import { Canvas, useThree } from "@react-three/fiber";

import { useTexture } from "@react-three/drei";

import { useEffect, useMemo, useRef, useState } from "react";

import { useParams } from "react-router-dom";

import * as THREE from "three";

import Players from "../components/Players";
import Ball from "../components/Ball";

import { getViewerScenes, getViewerScene } from "../api";

const FIELD_WIDTH = 40 / 2;
const FIELD_DEPTH = 27 / 3;

const SOURCE_WIDTH = 640;
const SOURCE_HEIGHT = 360;

function convertPosition(position) {
  if (!position) {
    return null;
  }

  const x = (Number(position.x) / SOURCE_WIDTH - 0.5) * FIELD_WIDTH;

  const z = (0.5 - Number(position.z) / SOURCE_HEIGHT) * FIELD_DEPTH;

  return {
    x,
    y: Number(position.y) || 0,
    z,
    direction_angle:
      position.direction_angle !== null &&
      position.direction_angle !== undefined
        ? Number(position.direction_angle)
        : null,
  };
}

function getObjectPosition(object, frameNumber) {
  if (!object) {
    return null;
  }

  const positions = object.positions || [];

  if (positions.length === 0) {
    return null;
  }

  const exact = positions.find(
    (position) => Number(position.frame) === Number(frameNumber),
  );

  if (exact) {
    return convertPosition(exact);
  }

  const previous = positions
    .filter((position) => Number(position.frame) <= Number(frameNumber))
    .sort((a, b) => Number(b.frame) - Number(a.frame))[0];

  if (previous) {
    return convertPosition(previous);
  }

  const next = positions
    .filter((position) => Number(position.frame) > Number(frameNumber))
    .sort((a, b) => Number(a.frame) - Number(b.frame))[0];

  if (next) {
    return convertPosition(next);
  }

  return null;
}

function CameraController({ selectedObject, currentFrame }) {
  const { camera, gl } = useThree();

  const yaw = useRef(0);
  const pitch = useRef(0);

  const dragging = useRef(false);

  const keys = useRef({});

  const previousMouse = useRef({
    x: 0,
    y: 0,
  });

  const initialized = useRef(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      keys.current[event.code] = true;

      if (event.code === "Space") {
        event.preventDefault();
      }
    };

    const onKeyUp = (event) => {
      keys.current[event.code] = false;
    };

    window.addEventListener("keydown", onKeyDown);

    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);

      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;

    camera.rotation.order = "YXZ";

    if (!initialized.current) {
      const euler = new THREE.Euler().setFromQuaternion(
        camera.quaternion,
        "YXZ",
      );

      yaw.current = euler.y;
      pitch.current = euler.x;

      initialized.current = true;
    }

    const onMouseDown = (event) => {
      if (event.button !== 0) {
        return;
      }

      dragging.current = true;

      previousMouse.current = {
        x: event.clientX,
        y: event.clientY,
      };

      canvas.requestPointerLock?.();
    };

    const onMouseUp = () => {
      dragging.current = false;

      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
    };

    const onMouseMove = (event) => {
      if (document.pointerLockElement === canvas) {
        const deltaX = event.movementX || 0;

        const deltaY = event.movementY || 0;

        yaw.current -= deltaX * 0.003;

        pitch.current -= deltaY * 0.003;
      } else if (dragging.current) {
        const deltaX = event.clientX - previousMouse.current.x;

        const deltaY = event.clientY - previousMouse.current.y;

        previousMouse.current = {
          x: event.clientX,
          y: event.clientY,
        };

        yaw.current -= deltaX * 0.005;

        pitch.current -= deltaY * 0.005;
      }

      const maxPitch = Math.PI / 2 - 0.05;

      pitch.current = THREE.MathUtils.clamp(pitch.current, -maxPitch, maxPitch);

      camera.rotation.y = yaw.current;

      camera.rotation.x = pitch.current;
    };

    canvas.addEventListener("mousedown", onMouseDown);

    window.addEventListener("mouseup", onMouseUp);

    window.addEventListener("mousemove", onMouseMove);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);

      window.removeEventListener("mouseup", onMouseUp);

      window.removeEventListener("mousemove", onMouseMove);

      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
    };
  }, [camera, gl]);

  useEffect(() => {
    if (!selectedObject) {
      return;
    }

    const position = getObjectPosition(selectedObject, currentFrame);

    if (!position) {
      return;
    }

    camera.position.set(position.x, position.y + 1.7, position.z);

    camera.rotation.order = "YXZ";
  }, [camera, selectedObject, currentFrame]);

  useEffect(() => {
    let animationFrame;

    const clock = new THREE.Clock();

    const direction = new THREE.Vector3();

    const right = new THREE.Vector3();

    const move = new THREE.Vector3();

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);

      const speed = keys.current.ShiftLeft || keys.current.ShiftRight ? 12 : 6;

      camera.getWorldDirection(direction);

      direction.y = 0;

      if (direction.lengthSq() > 0) {
        direction.normalize();
      }

      right.crossVectors(direction, camera.up);

      if (right.lengthSq() > 0) {
        right.normalize();
      }

      move.set(0, 0, 0);

      if (keys.current.KeyW) {
        move.add(direction);
      }

      if (keys.current.KeyS) {
        move.sub(direction);
      }

      if (keys.current.KeyD) {
        move.add(right);
      }

      if (keys.current.KeyA) {
        move.sub(right);
      }

      if (keys.current.Space) {
        move.y += 1;
      }

      if (keys.current.ControlLeft || keys.current.ControlRight) {
        move.y -= 1;
      }

      if (move.lengthSq() > 0) {
        move.normalize();

        camera.position.addScaledVector(move, speed * delta);
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [camera]);

  return null;
}

function StadiumSkybox() {
  const texture = useTexture("/stadium.png");

  return (
    <mesh>
      <sphereGeometry args={[50, 64, 64]} />

      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}

function Field() {
  const texture = useTexture("/plane_texture.png");

  texture.wrapS = THREE.RepeatWrapping;

  texture.wrapT = THREE.RepeatWrapping;

  texture.repeat.set(8, 5);

  texture.needsUpdate = true;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[FIELD_WIDTH * 4, FIELD_DEPTH * 4]} />

      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

function buildFrames(objects, fps) {
  const frameNumbers = new Set();

  for (const object of objects) {
    for (const position of object.positions || []) {
      frameNumbers.add(Number(position.frame));
    }
  }

  const sortedFrames = Array.from(frameNumbers).sort((a, b) => a - b);

  return sortedFrames.map((frameNumber) => {
    const frame = {
      frame: frameNumber,

      timestamp: frameNumber / fps,

      allies: [],
      enemies: [],
      unknown: [],
      ball: null,
    };

    for (const object of objects) {
      const position = getObjectPosition(object, frameNumber);

      if (!position) {
        continue;
      }

      const item = {
        id: object.id,
        x: position.x,
        y: position.y,
        z: position.z,
        direction_angle: position.direction_angle,
      };

      switch (object.type) {
        case "teammate":
          frame.allies.push(item);
          break;

        case "opponent":
          frame.enemies.push(item);
          break;

        case "unknown":
          frame.unknown.push(item);
          break;

        case "ball":
          frame.ball = item;
          break;

        default:
          break;
      }
    }

    return frame;
  });
}

function SoccerScene({ frame, selectedObject, currentFrame, renderMode }) {
  if (!frame) {
    return null;
  }

  return (
    <>
      <CameraController
        selectedObject={selectedObject}
        currentFrame={currentFrame}
      />

      <StadiumSkybox />

      <Field />

      <ambientLight intensity={2} />

      <directionalLight position={[10, 20, 10]} intensity={2} />

      <Players players={frame.allies} color="#00ff00" renderMode={renderMode} />

      <Players
        players={frame.enemies}
        color="#ff0000"
        renderMode={renderMode}
      />

      <Players
        players={frame.unknown}
        color="#888888"
        renderMode={renderMode}
      />

      {frame.ball && <Ball ball={frame.ball} renderMode={renderMode} />}
    </>
  );
}

export default function ViewerPage() {
  const { sceneId } = useParams();

  const [scenes, setScenes] = useState([]);

  const [selectedSceneId, setSelectedSceneId] = useState("");

  const [objects, setObjects] = useState([]);

  const [fps, setFps] = useState(5);

  const currentFrame = 0;

  const [selectedObjectId, setSelectedObjectId] = useState("");

  const [renderMode, setRenderMode] = useState("models");

  const [loadingScenes, setLoadingScenes] = useState(true);

  const [loadingScene, setLoadingScene] = useState(false);

  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadScenes() {
      try {
        setLoadingScenes(true);

        setError(null);

        const data = await getViewerScenes();

        const sceneList = data.scenes || [];

        setScenes(sceneList);

        if (sceneId) {
          const sceneExists = sceneList.some(
            (scene) => String(scene.id) === String(sceneId),
          );

          if (sceneExists) {
            setSelectedSceneId(String(sceneId));
          } else {
            setSelectedSceneId("");

            setError(`Scene ${sceneId} not found`);
          }
        } else if (sceneList.length > 0) {
          setSelectedSceneId(String(sceneList[0].id));
        }
      } catch (error) {
        console.error(error);

        setError(error.message || "Failed to load scenes");
      } finally {
        setLoadingScenes(false);
      }
    }

    loadScenes();
  }, [sceneId]);

  useEffect(() => {
    if (!selectedSceneId) {
      return;
    }

    async function loadScene() {
      try {
        setLoadingScene(true);

        setError(null);

        const data = await getViewerScene(selectedSceneId);

        setObjects(data.objects || []);

        setFps(Number(data.fps) || 5);

        setSelectedObjectId("");
      } catch (error) {
        console.error(error);

        setError(error.message || "Failed to load scene");
      } finally {
        setLoadingScene(false);
      }
    }

    loadScene();
  }, [selectedSceneId]);

  const frames = useMemo(() => buildFrames(objects, fps), [objects, fps]);

  const currentFrameData = frames.length > 0 ? frames[0] : null;

  const cameraObjects = useMemo(
    () =>
      objects.filter(
        (object) => object.type === "teammate" || object.type === "opponent",
      ),
    [objects],
  );

  const selectedObject = useMemo(
    () =>
      cameraObjects.find(
        (object) => String(object.id) === String(selectedObjectId),
      ) || null,
    [cameraObjects, selectedObjectId],
  );

  const handleSceneChange = (event) => {
    setSelectedSceneId(event.target.value);
  };

  const handleObjectChange = (event) => {
    setSelectedObjectId(event.target.value);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#111",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          zIndex: 20,
          top: 20,
          left: 20,
          width: 320,
          padding: 16,
          background: "rgba(0,0,0,0.82)",
          borderRadius: 10,
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          3D Scene Viewer
        </div>

        <label
          style={{
            display: "block",
            marginBottom: 6,
            color: "#aaa",
            fontSize: 13,
          }}
        >
          Scene
        </label>

        <select
          value={selectedSceneId}
          onChange={handleSceneChange}
          disabled={loadingScenes || loadingScene}
          style={{
            width: "100%",
            padding: "9px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#222",
            color: "white",
            marginBottom: 18,
          }}
        >
          <option value="">Select scene</option>

          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>

        <label
          style={{
            display: "block",
            marginBottom: 6,
            color: "#aaa",
            fontSize: 13,
          }}
        >
          Representation
        </label>

        <select
          value={renderMode}
          onChange={(event) => setRenderMode(event.target.value)}
          style={{
            width: "100%",
            padding: "9px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#222",
            color: "white",
            marginBottom: 18,
          }}
        >
          <option value="models">3D Models</option>

          <option value="sprites">3D Sprites</option>
        </select>

        <label
          style={{
            display: "block",
            marginBottom: 6,
            color: "#aaa",
            fontSize: 13,
          }}
        >
          Camera
        </label>

        <select
          value={selectedObjectId}
          onChange={handleObjectChange}
          disabled={loadingScene}
          style={{
            width: "100%",
            padding: "9px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            background: "#222",
            color: "white",
          }}
        >
          <option value="">Free camera</option>

          {cameraObjects.map((object) => {
            const label =
              object.type === "unknown"
                ? `Unknown #${object.id}`
                : `Person #${object.id}`;

            return (
              <option key={object.id} value={object.id}>
                {label}
              </option>
            );
          })}
        </select>

        {!selectedObject && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 6,
              fontSize: 12,
              color: "#aaa",
              lineHeight: 1.6,
            }}
          >
            <div>
              <strong
                style={{
                  color: "#fff",
                }}
              >
                Free camera
              </strong>
            </div>

            <div>WASD — move</div>

            <div>Space — up</div>

            <div>Ctrl — down</div>

            <div>Shift — faster</div>

            <div>Mouse — look</div>
          </div>
        )}

        {selectedObject && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 6,
              fontSize: 12,
              color: "#aaa",
            }}
          >
            Camera starts at{" "}
            {selectedObject.type === "unknown" ? "Unknown" : "Person"}
            {" #"}
            {selectedObject.id}
            <div
              style={{
                marginTop: 6,
                color: "#777",
              }}
            >
              WASD and mouse remain active.
            </div>
          </div>
        )}

        {loadingScene && (
          <div
            style={{
              marginTop: 12,
              color: "#aaa",
              fontSize: 13,
            }}
          >
            Loading scene...
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 6,
              color: "#ff5555",
              background: "rgba(255,0,0,0.1)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <Canvas
        camera={{
          position: [0, 5, 15],
          fov: 75,
          near: 0.1,
          far: 1000,
        }}
      >
        <SoccerScene
          frame={currentFrameData}
          selectedObject={selectedObject}
          currentFrame={currentFrameData?.frame ?? 0}
          renderMode={renderMode}
        />
      </Canvas>
    </div>
  );
}
