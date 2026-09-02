import asyncio
import uuid
from pathlib import Path

from db import get_scene
from db import get_scene_objects
from db import get_scene_object_groups
from db import save_scene_scheme
from db import get_viewer_scenes
from db import get_viewer_scene
from db import check_database

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    WebSocket,
    WebSocketDisconnect,
)

from fastapi.middleware.cors import CORSMiddleware

from analyzer import analyze_video as run_analysis

app = FastAPI(
    title="CV Soccer Situation Viewer API",
    version="0.1.0",
)

analysis_jobs = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("/app/uploads")

UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

@app.get("/")
def root():
    """Return the basic API service status."""
    return {
        "service": "cv-soccer-situation-viewer",
        "status": "ok",
    }

@app.get("/api/scenes/{scene_id}")
def api_get_scene(scene_id: int):
    """Return a scene by its database ID.

    Args:
        scene_id: Unique database identifier of the scene.

    Raises:
        HTTPException: If the scene does not exist.

    Returns:
        Scene data including its detected objects.
    """
    scene = get_scene(scene_id)

    if scene is None:
        raise HTTPException(
            status_code=404,
            detail="Scene not found",
        )

    return scene


@app.get("/api/scenes/{scene_id}/objects")
def get_scene_objects_endpoint(scene_id: int):
    """Return the detected objects for a scene.

    Args:
        scene_id: Unique database identifier of the scene.

    Raises:
        HTTPException: If objects cannot be loaded from the database.

    Returns:
        A dictionary containing the scene ID and its objects.
    """
    try:
        objects = get_scene_objects(scene_id)

        return {
            "scene_id": scene_id,
            "objects": objects,
        }

    except Exception as error:
        print(
            "Failed to get scene objects:",
            repr(error),
            flush=True,
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to load scene objects",
        )


@app.get("/api/scenes/{scene_id}/groups")
def get_scene_object_groups_endpoint(
    scene_id: int,
    similarity: float = 70.0,
):
    """Group scene objects by color-vector similarity.

    Args:
        scene_id: Unique database identifier of the scene.
        similarity: Minimum similarity percentage required to group
            objects together. Must be between 0 and 100.

    Raises:
        HTTPException: If the similarity value is invalid or the
            groups cannot be calculated.

    Returns:
        A dictionary containing the scene ID, similarity threshold,
        and calculated object groups.
    """
    if similarity < 0 or similarity > 100:
        raise HTTPException(
            status_code=400,
            detail="similarity must be between 0 and 100",
        )

    try:
        groups = get_scene_object_groups(
            scene_id,
            similarity,
        )

        return {
            "scene_id": scene_id,
            "similarity": similarity,
            "groups": groups,
        }

    except Exception as error:
        print(
            "Failed to get scene object groups:",
            repr(error),
            flush=True,
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to calculate scene object groups",
        )


@app.get("/api/scenes/{scene_id}/frames")
def get_scene_frames(scene_id: int):
    """Return all stored frames for a scene.

    Args:
        scene_id: Unique identifier of the scene.

    Raises:
        HTTPException: If the scene does not exist.

    Returns:
        Scene metadata and its associated frames.
    """
    if scene_id not in scene_frames:
        raise HTTPException(
            status_code=404,
            detail="Scene not found",
        )

    scene = next(
        (
            scene
            for scene in scenes
            if scene["id"] == scene_id
        ),
        None,
    )

    if scene is None:
        raise HTTPException(
            status_code=404,
            detail="Scene not found",
        )

    return {
        "scene_id": scene_id,
        "name": scene["name"],
        "fps": scene["fps"],
        "frame_count": len(scene_frames[scene_id]),
        "frames": scene_frames[scene_id],
    }


@app.post("/api/analyze")
async def start_analysis(video: UploadFile = File(...)):
    """Start asynchronous analysis of an uploaded MP4 video.

    The video is saved to the upload directory and processed in a
    background thread. Progress and detection results are delivered
    through the analysis WebSocket endpoint.

    Args:
        video: Uploaded MP4 video file.

    Raises:
        HTTPException: If the filename is missing or the file is not
            an MP4 video.

    Returns:
        The status of the analysis and its unique analysis ID.
    """
    if not video.filename:
        raise HTTPException(
            status_code=400,
            detail="No filename provided",
        )

    if not video.filename.lower().endswith(".mp4"):
        raise HTTPException(
            status_code=400,
            detail="Only MP4 files are supported",
        )

    analysis_id = str(uuid.uuid4())

    video_path = UPLOAD_DIR / f"{analysis_id}.mp4"

    try:
        with video_path.open("wb") as buffer:
            while True:
                chunk = await video.read(1024 * 1024)

                if not chunk:
                    break

                buffer.write(chunk)
    finally:
        await video.close()

    queue = asyncio.Queue()

    analysis_jobs[analysis_id] = {
        "queue": queue,
        "video_path": str(video_path),
    }

    loop = asyncio.get_running_loop()

    asyncio.create_task(
        asyncio.to_thread(
            run_analysis,
            str(video_path),
            queue,
            loop,
        )
    )

    return {
        "status": "started",
        "analysis_id": analysis_id,
    }


@app.websocket("/api/analyze/{analysis_id}/ws")
async def analysis_websocket(websocket: WebSocket, analysis_id: str):
    """Stream analysis progress and detection results to a client.

    Args:
        websocket: WebSocket connection used to send analysis events.
        analysis_id: Unique identifier of the running analysis.

    The WebSocket sends frame updates, completion information, or an
    error message depending on the analysis state.
    """
    await websocket.accept()

    job = analysis_jobs.get(analysis_id)

    if not job:
        await websocket.send_json(
            {
                "type": "error",
                "message": "Analysis not found",
            }
        )
        await websocket.close()
        return

    queue = job["queue"]

    try:
        while True:
            message = await queue.get()

            message_type = message["type"]

            if message_type == "frame":
                await websocket.send_json(
                    {
                        "type": "frame",
                        "frame": message["frame"],
                        "timestamp": message["timestamp"],
                        "progress": message["progress"],
                        "detections": message["detections"],
                        "image": message["image"],
                    }
                )

            elif message_type == "completed":
                await websocket.send_json(
                    {
                        "type": "completed",
                        "duration": message["duration"],
                        "source_fps": message["source_fps"],
                        "total_frames": message["total_frames"],
                        "processed_frames": message["processed_frames"],
                        "progress": 100,
                        "scene_id": message["scene_id"],
                    }
                )
                break

            elif message_type == "error":
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": message["message"],
                    }
                )

                break

    except WebSocketDisconnect:
        print(
            f"WebSocket disconnected: {analysis_id}",
            flush=True,
        )

    except Exception as error:
        print(
            f"WebSocket error: {repr(error)}",
            flush=True,
        )

    finally:
        analysis_jobs.pop(
            analysis_id,
            None,
        )


@app.post("/api/scenes/{scene_id}/scheme")
async def save_scene_scheme_endpoint(
    scene_id: int,
    payload: dict,
):
    """Save the manually assigned team types for scene objects.

    Args:
        scene_id: Unique database identifier of the scene.
        payload: Request body containing object-to-team assignments
            and an optional acceptance flag.

    Raises:
        HTTPException: If the payload is invalid, the scene does not
            exist, or the scheme cannot be saved.

    Returns:
        The number of objects whose team assignment was updated.
    """
    try:
        object_teams = payload.get(
            "object_teams",
            {},
        )

        accepted = payload.get(
            "accepted",
            False,
        )

        if not isinstance(object_teams, dict):
            raise HTTPException(
                status_code=400,
                detail="object_teams must be an object",
            )

        updated = save_scene_scheme(
            scene_id,
            object_teams,
        )

        return {
            "status": "saved",
            "scene_id": scene_id,
            "accepted": accepted,
            "updated": updated,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )

    except Exception as error:
        print(
            "Failed to save scene scheme:",
            repr(error),
            flush=True,
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to save scene scheme",
        )


@app.get("/api/viewer/scenes")
def get_viewer_scenes_endpoint():
    """Return all scenes accepted for viewing.

    Returns:
        A dictionary containing the list of accepted scenes.

    Raises:
        HTTPException: If the scenes cannot be loaded.
    """
    try:
        scenes = get_viewer_scenes()

        return {
            "scenes": scenes,
        }

    except Exception as error:
        print(
            "Failed to get viewer scenes:",
            repr(error),
            flush=True,
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to load viewer scenes",
        )


@app.get("/api/viewer/scenes/{scene_id}")
def get_viewer_scene_endpoint(scene_id: int):
    """Return complete viewer data for an accepted scene.

    Args:
        scene_id: Unique database identifier of the scene.

    Raises:
        HTTPException: If the scene does not exist, is not accepted,
            or cannot be loaded.

    Returns:
        Scene metadata and tracked object positions.
    """
    try:
        scene = get_viewer_scene(scene_id)

        if scene is None:
            raise HTTPException(
                status_code=404,
                detail="Scene not found",
            )

        return scene

    except HTTPException:
        raise

    except Exception as error:
        print(
            "Failed to get viewer scene:",
            repr(error),
            flush=True,
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to load viewer scene",
        )
    
@app.get("/api/health")
def health():
    """Check API and database health.

    Returns:
        A dictionary containing API status, database status,
        and the database query result when available.
    """
    try:
        result = check_database()

        return {
            "api": "ok",
            "database": "ok",
            "result": result,
        }

    except Exception as error:
        return {
            "api": "ok",
            "database": "error",
            "error": str(error),
        }
    
