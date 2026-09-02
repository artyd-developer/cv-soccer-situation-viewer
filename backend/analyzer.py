import asyncio
import base64
import os
import time

from pathlib import Path
import cv2
import numpy as np

from ultralytics import YOLO

from db import save_scene

model = None

ALLOWED_CLASSES = {
    "person",
    "ball",
    "sports ball",
}

MAX_DISTANCE = 400

OBJECT_CONFIDENCE = {
    "person": 0.25,
    "ball": 0.1,
    "sports ball": 0.1,
}


def get_model():
    """Load and cache the configured YOLO model.

    The model is loaded only once and reused by subsequent analysis
    requests.

    Returns:
        The initialized Ultralytics YOLO model.
    """
    global model

    if model is None:
        print("Loading YOLO model...", flush=True)

        base_dir = Path(__file__).resolve().parent

        model_name = os.getenv(
            "ULTRALYTICS_YOLO_MODEL",
            "yolo11n.pt",
        )

        model_path = base_dir / "yolo_model" / model_name

        model = YOLO(model_path)

        print("YOLO model loaded.", flush=True)

    return model


def get_color_vector(frame, x1, y1, x2, y2):
    """Extract a normalized HSV color histogram from an object.

    The histogram is calculated from the central torso area of the
    bounding box to reduce the influence of the head, legs, and
    surrounding background.

    Args:
        frame: OpenCV BGR image containing the detected object.
        x1: Left coordinate of the bounding box.
        y1: Top coordinate of the bounding box.
        x2: Right coordinate of the bounding box.
        y2: Bottom coordinate of the bounding box.

    Returns:
        A flattened 192-dimensional normalized color vector,
        or an empty list if the bounding box is invalid or empty.
    """
    width = x2 - x1
    height = y2 - y1

    if width <= 0 or height <= 0:
        return []

    # Central torso area. Avoid head, legs and most of the background.

    crop_x1 = x1 + int(width * 0.20)
    crop_x2 = x1 + int(width * 0.80)

    crop_y1 = y1 + int(height * 0.25)
    crop_y2 = y1 + int(height * 0.65)

    crop_x1 = max(0, crop_x1)
    crop_y1 = max(0, crop_y1)

    crop_x2 = min(frame.shape[1], crop_x2)
    crop_y2 = min(frame.shape[0], crop_y2)

    crop = frame[
        crop_y1:crop_y2,
        crop_x1:crop_x2,
    ]

    if crop.size == 0:
        return []

    # BGR -> HSV

    hsv = cv2.cvtColor(
        crop,
        cv2.COLOR_BGR2HSV,
    )

    # Ignore very dark and very low-saturation pixels. This reduces influence of background/shadows.

    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]

    mask = (
        (saturation > 35)
        & (value > 40)
    ).astype(np.uint8) * 255

    # 12 x 4 x 4 = 192 dimensions.

    histogram = cv2.calcHist(
        [hsv],
        [0, 1, 2],
        mask,
        [12, 4, 4],
        [0, 180, 0, 256, 0, 256],
    )

    # L1 normalization

    histogram = cv2.normalize(
        histogram,
        histogram,
        norm_type=cv2.NORM_L1,
    )

    return histogram.flatten().tolist()


def update_object_tracking(
    objects_tracking,
    result_boxes,
    class_names,
    next_object_id,
    frame,
    frame_number,
    max_distance,
):
    """Update object tracks using nearest-center matching.

    Each current detection is matched to the closest previously tracked
    object of the same class when the distance is within max_distance.
    Otherwise, a new object track is created.

    Args:
        objects_tracking: Existing object tracking data.
        result_boxes: YOLO detection boxes for the current frame.
        class_names: Mapping of YOLO class IDs to class names.
        next_object_id: ID to assign to the next newly detected object.
        frame: Current OpenCV frame.
        frame_number: Number of the current frame.
        max_distance: Maximum allowed center-to-center distance for
            matching a detection to an existing object.

    Returns:
        The next available object ID.
    """
    current_detections = []

    for box in result_boxes:
        xyxy = box.xyxy[0].cpu().numpy()

        x1, y1, x2, y2 = map(int, xyxy)

        class_id = int(box.cls[0].cpu().item())

        class_name = class_names[class_id]

        if class_name not in ALLOWED_CLASSES:
            continue

        current_detections.append(
            {
                "class_name": class_name,
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "color_vector": get_color_vector(
                    frame,
                    x1,
                    y1,
                    x2,
                    y2,
                ),
            }
        )

    matched_objects = set()

    for detection in current_detections:
        class_name = detection["class_name"]

        if class_name not in objects_tracking:
            objects_tracking[class_name] = {}

        current_center_x = (detection["x1"] + detection["x2"]) / 2
        current_center_y = (detection["y1"] + detection["y2"]) / 2

        best_object_id = None
        best_distance = None

        for object_id, boxes in objects_tracking[class_name].items():
            if object_id in matched_objects or not boxes:
                continue

            previous_box = boxes[-1]

            previous_center_x = (
                previous_box["x1"] + previous_box["x2"]
            ) / 2

            previous_center_y = (
                previous_box["y1"] + previous_box["y2"]
            ) / 2

            distance = (
                (current_center_x - previous_center_x) ** 2
                + (current_center_y - previous_center_y) ** 2
            ) ** 0.5

            if distance <= max_distance:
                if (
                    best_distance is None
                    or distance < best_distance
                ):
                    best_distance = distance
                    best_object_id = object_id

        current_box = {
            "frame": frame_number,
            "x1": detection["x1"],
            "y1": detection["y1"],
            "x2": detection["x2"],
            "y2": detection["y2"],
            "color_vector": detection["color_vector"],
        }

        if best_object_id is not None:
            objects_tracking[class_name][best_object_id].append(
                current_box
            )

            matched_objects.add(best_object_id)

        else:
            objects_tracking[class_name][next_object_id] = [current_box]

            matched_objects.add(next_object_id)

            next_object_id += 1

    return next_object_id


def analyze_video(video_path: str, queue: asyncio.Queue, loop):
    """Analyze a video using YOLO and stream results through a queue.

    The video is sampled at predefined timestamps. Detected persons
    and balls are tracked between sampled frames, annotated frames are
    encoded as Base64 JPEG images, and progress messages are sent to
    the provided asyncio queue.

    After processing, the tracked scene is saved to the database and
    a completion message is sent through the queue.

    Args:
        video_path: Path to the input video file.
        queue: Asyncio queue used to send analysis events to the API.
        loop: Event loop used to schedule queue operations from the
            background analysis thread.

    The queue receives messages with one of the following types:

        - "frame": Processed frame with detections and image data.
        - "completed": Analysis completion information.
        - "error": Error information if analysis fails.
    """
    cap = None

    objects_tracking = {}
    next_object_id = 1

    try:
        print(f"YOLO analysis started: {video_path}", flush=True)

        yolo = get_model()

        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            raise RuntimeError(
                f"Could not open video: {video_path}"
            )

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        source_fps = float(cap.get(cv2.CAP_PROP_FPS))

        if source_fps <= 0:
            source_fps = 30.0

        duration = (
            total_frames / source_fps
            if total_frames > 0
            else 0
        )

        target_timestamps = [
            0.1,
            0.2,
            0.3,
            0.4,
            0.5,
            0.6,
            0.7,
            0.99,
        ]

        target_frames = []

        for ts in target_timestamps:
            if ts <= duration:
                frame_num = int(ts * source_fps)

                target_frames.append(frame_num)

        target_frames = sorted(set(target_frames))

        total_to_process = len(target_frames)

        processed_frames = 0
        current_frame = 0

        start_time = time.time()

        while True:
            success, frame = cap.read()

            if not success:
                break

            frame_number = current_frame

            if current_frame not in target_frames:
                current_frame += 1
                continue

            results = yolo(
                frame,
                verbose=False,
                iou=0.40,
            )

            result = results[0]

            next_object_id = update_object_tracking(
                objects_tracking,
                result.boxes,
                result.names,
                next_object_id,
                frame,
                frame_number,
                MAX_DISTANCE,
            )

            detections = []

            if result.boxes is not None:
                boxes = result.boxes

                for i in range(len(boxes)):
                    box = boxes[i]

                    xyxy = box.xyxy[0].cpu().numpy()

                    x1, y1, x2, y2 = map(int, xyxy)

                    confidence = float(box.conf[0].cpu().item())
                    class_id = int(box.cls[0].cpu().item())
                    class_name = result.names[class_id]

                    if class_name not in ALLOWED_CLASSES:
                        continue

                    if OBJECT_CONFIDENCE[class_name] < confidence:
                        detections.append(
                            {
                                "class_id": class_id,
                                "class_name": class_name,
                                "confidence": confidence,
                                "x1": x1,
                                "y1": y1,
                                "x2": x2,
                                "y2": y2,
                            }
                        )

                    if class_name == "person":
                        color = (
                            0,
                            255,
                            0,
                        )

                    elif class_name == "sports ball":
                        color = (
                            0,
                            165,
                            255,
                        )

                    else:
                        color = (
                            255,
                            180,
                            0,
                        )

                    cv2.rectangle(
                        frame,
                        (x1, y1),
                        (x2, y2),
                        color,
                        2,
                    )

                    label = f"{class_name} {confidence * 100:.0f}%"

                    (
                        text_width,
                        text_height,
                    ), _ = cv2.getTextSize(
                        label,
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        2,
                    )

                    label_y = max(y1, text_height + 8)

                    cv2.rectangle(
                        frame,
                        (x1, label_y - text_height - 8),
                        (x1 + text_width + 8, label_y),
                        color,
                        -1,
                    )

                    cv2.putText(
                        frame,
                        label,
                        (x1 + 4, label_y - 4),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        (0, 0, 0),
                        2,
                        cv2.LINE_AA,
                    )

            progress = 0.0

            if total_to_process > 0:
                progress = (
                    (processed_frames + 1)
                    / total_to_process
                    * 100.0
                )

            timestamp = frame_number / source_fps

            frame_height = int(frame.shape[0])
            frame_width = int(frame.shape[1])

            encode_success, encoded = cv2.imencode(
                ".jpg",
                frame,
                [
                    cv2.IMWRITE_JPEG_QUALITY,
                    80,
                ],
            )

            if not encode_success:
                raise RuntimeError(
                    "Failed to encode annotated frame"
                )

            image_base64 = (
                base64.b64encode(encoded.tobytes())
                .decode("ascii")
            )

            print(
                f"Sending frame "
                f"{frame_number}, "
                f"size={frame_width}x{frame_height}, "
                f"jpeg={len(encoded)} bytes, "
                f"base64={len(image_base64)} chars, "
                f"detections={len(detections)}",
                flush=True,
            )

            message = {
                "type": "frame",
                "frame": frame_number,
                "timestamp": timestamp,
                "progress": round(progress, 2),
                "width": frame_width,
                "height": frame_height,
                "detections": detections,
                "image": image_base64,
            }

            asyncio.run_coroutine_threadsafe(
                queue.put(message),
                loop,
            ).result()

            processed_frames += 1
            current_frame += 1

            print(
                f"Frame "
                f"{processed_frames}/"
                f"{total_to_process} "
                f"({progress:.1f}%) "
                f"detections="
                f"{len(detections)}",
                flush=True,
            )

        elapsed = time.time() - start_time

        print(
            f"YOLO analysis completed: "
            f"{processed_frames} frames "
            f"in {elapsed:.2f}s",
            flush=True,
        )

        try:
            scene_id = save_scene(
                name=f"Analysis {Path(video_path).stem}",
                objects_tracking=objects_tracking,
            )

            print(
                f"Scene saved to database: {scene_id}",
                flush=True,
            )

        except Exception as error:
            print(
                "Failed to save scene to database:",
                repr(error),
                flush=True,
            )
            scene_id = None

        asyncio.run_coroutine_threadsafe(
            queue.put(
                {
                    "type": "completed",
                    "duration": duration,
                    "source_fps": source_fps,
                    "total_frames": total_frames,
                    "processed_frames": processed_frames,
                    "scene_id": scene_id,
                }
            ),
            loop,
        ).result()

    except Exception as error:
        print(
            "YOLO analysis ERROR:",
            repr(error),
            flush=True,
        )

        asyncio.run_coroutine_threadsafe(
            queue.put(
                {
                    "type": "error",
                    "message": str(error),
                }
            ),
            loop,
        ).result()

    finally:
        if cap is not None:
            cap.release()