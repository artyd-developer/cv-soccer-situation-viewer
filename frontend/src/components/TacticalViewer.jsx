import { Canvas, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import Players from "./Players";
import Ball from "./Ball";
import { getSceneFrames } from "../api";

function CameraController({
  selectedObject,
  currentFrame,
}) {
  const { camera, gl } = useThree();

  const keys = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    ctrl: false,
    shift: false,
  });

  const dragging = useRef(false);

  const yaw = useRef(0);
  const pitch = useRef(0);

  const previousMouse = useRef({
    x: 0,
    y: 0,
  });

  useEffect(() => {
    camera.rotation.order = "YXZ";

    yaw.current = camera.rotation.y;
    pitch.current = camera.rotation.x;
  }, [
    camera,
  ]);

  useEffect(() => {
    if (!selectedObject) {
      return;
    }

    const position = getObjectPosition(
      selectedObject,
      currentFrame
    );

    if (!position) {
      return;
    }

    camera.position.set(
      position.x,
      position.y + 1.7,
      position.z
    );

    camera.rotation.order = "YXZ";

    yaw.current = camera.rotation.y;
    pitch.current = camera.rotation.x;

  }, [
    camera,
    selectedObject,
    currentFrame,
  ]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      switch (event.code) {
        case "KeyW":
          keys.current.w = true;
          break;

        case "KeyA":
          keys.current.a = true;
          break;

        case "KeyS":
          keys.current.s = true;
          break;

        case "KeyD":
          keys.current.d = true;
          break;

        case "Space":
          event.preventDefault();
          keys.current.space = true;
          break;

        case "ControlLeft":
        case "ControlRight":
          keys.current.ctrl = true;
          break;

        case "ShiftLeft":
        case "ShiftRight":
          keys.current.shift = true;
          break;

        default:
          break;
      }
    };


    const handleKeyUp = (event) => {
      switch (event.code) {
        case "KeyW":
          keys.current.w = false;
          break;

        case "KeyA":
          keys.current.a = false;
          break;

        case "KeyS":
          keys.current.s = false;
          break;

        case "KeyD":
          keys.current.d = false;
          break;

        case "Space":
          keys.current.space = false;
          break;

        case "ControlLeft":
        case "ControlRight":
          keys.current.ctrl = false;
          break;

        case "ShiftLeft":
        case "ShiftRight":
          keys.current.shift = false;
          break;

        default:
          break;
      }
    };


    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    window.addEventListener(
      "keyup",
      handleKeyUp
    );


    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );

      window.removeEventListener(
        "keyup",
        handleKeyUp
      );
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;


    const handleMouseDown = (event) => {
      if (selectedObject) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      dragging.current = true;

      previousMouse.current = {
        x: event.clientX,
        y: event.clientY,
      };
    };


    const handleMouseUp = () => {
      dragging.current = false;
    };


    const handleMouseMove = (event) => {
      if (!dragging.current) {
        return;
      }

      const deltaX =
        event.clientX -
        previousMouse.current.x;

      const deltaY =
        event.clientY -
        previousMouse.current.y;


      previousMouse.current = {
        x: event.clientX,
        y: event.clientY,
      };


      yaw.current -=
        deltaX * 0.005;

      pitch.current -=
        deltaY * 0.005;


      const maxPitch =
        Math.PI / 2 - 0.05;


      pitch.current =
        THREE.MathUtils.clamp(
          pitch.current,
          -maxPitch,
          maxPitch
        );


      camera.rotation.order = "YXZ";

      camera.rotation.y =
        yaw.current;

      camera.rotation.x =
        pitch.current;
    };


    canvas.addEventListener(
      "mousedown",
      handleMouseDown
    );

    window.addEventListener(
      "mouseup",
      handleMouseUp
    );

    window.addEventListener(
      "mousemove",
      handleMouseMove
    );


    return () => {
      canvas.removeEventListener(
        "mousedown",
        handleMouseDown
      );

      window.removeEventListener(
        "mouseup",
        handleMouseUp
      );

      window.removeEventListener(
        "mousemove",
        handleMouseMove
      );
    };
  }, [
    camera,
    gl,
    selectedObject,
  ]);

  useFrame((_, delta) => {
    if (selectedObject) {
      return;
    }


    const speed =
      keys.current.shift
        ? 15
        : 5;


    const distance =
      speed * delta;


    const forward =
      new THREE.Vector3(
        0,
        0,
        -1
      );


    const right =
      new THREE.Vector3(
        1,
        0,
        0
      );


    forward.applyQuaternion(
      camera.quaternion
    );

    right.applyQuaternion(
      camera.quaternion
    );

    forward.y = 0;
    right.y = 0;


    forward.normalize();
    right.normalize();


    if (keys.current.w) {
      camera.position.addScaledVector(
        forward,
        distance
      );
    }


    if (keys.current.s) {
      camera.position.addScaledVector(
        forward,
        -distance
      );
    }


    if (keys.current.a) {
      camera.position.addScaledVector(
        right,
        -distance
      );
    }


    if (keys.current.d) {
      camera.position.addScaledVector(
        right,
        distance
      );
    }


    if (keys.current.space) {
      camera.position.y +=
        distance;
    }


    if (keys.current.ctrl) {
      camera.position.y -=
        distance;
    }
  });


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
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[40, 25]} />

      <meshStandardMaterial color="#287a32" />
    </mesh>
  );
}

function SoccerScene({ frame }) {
  if (!frame) {
    return null;
  }

  return (
    <>
      <CameraController />

      <StadiumSkybox />

      <Field />

      <ambientLight intensity={2} />

      <directionalLight position={[10, 20, 10]} intensity={2} />

      <Players players={frame.allies || []} color="#00ff00" />

      <Players players={frame.enemies || []} color="#ff0000" />

      <Players players={frame.unknown || []} color="#888888" />

      {frame.ball && <Ball ball={frame.ball} />}
    </>
  );
}

export default function TacticalViewer({ sceneId, onClose }) {
  const [frames, setFrames] = useState([]);

  const [currentFrame, setCurrentFrame] = useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sceneId) {
      return;
    }

    let cancelled = false;

    async function loadFrames() {
      try {
        setLoading(true);
        setError(null);

        const data = await getSceneFrames(sceneId);

        if (cancelled) {
          return;
        }

        const loadedFrames = Array.isArray(data?.frames) ? data.frames : [];

        setFrames(loadedFrames);
        setCurrentFrame(0);
      } catch (err) {
        console.error("Failed to load 3D frames:", err);

        if (!cancelled) {
          setError("Failed to load 3D scene");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFrames();

    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  useEffect(() => {
    if (frames.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentFrame((previous) => (previous + 1) % frames.length);
    }, 200);

    return () => {
      clearInterval(interval);
    };
  }, [frames]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,

        background: "rgba(0, 0, 0, 0.82)",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        padding: "3vh 3vw",

        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "relative",

          width: "94vw",
          height: "94vh",

          background: "#050505",

          borderRadius: "14px",

          overflow: "hidden",

          boxShadow: "0 25px 80px rgba(0,0,0,0.7)",

          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {/* HEADER */}

        <div
          style={{
            position: "absolute",

            top: 0,
            left: 0,
            right: 0,

            height: "64px",

            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",

            padding: "0 18px 0 22px",

            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0))",

            zIndex: 20,

            pointerEvents: "none",
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: "17px",
              fontWeight: 700,

              textShadow: "0 2px 5px rgba(0,0,0,0.8)",
            }}
          >
            3D Tactical View
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              pointerEvents: "auto",

              width: "40px",
              height: "40px",

              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",

              background: "rgba(0,0,0,0.55)",

              color: "#fff",

              fontSize: "22px",

              cursor: "pointer",

              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* LOADING */}

        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,

              zIndex: 10,

              display: "flex",
              alignItems: "center",
              justifyContent: "center",

              color: "#fff",

              fontSize: "16px",

              background: "rgba(0,0,0,0.4)",
            }}
          >
            Loading 3D scene...
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div
            style={{
              position: "absolute",

              top: "80px",
              left: "50%",

              transform: "translateX(-50%)",

              zIndex: 30,

              padding: "12px 18px",

              background: "rgba(70,20,20,0.95)",

              color: "#ff8a8a",

              borderRadius: "8px",

              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* FRAME INFO */}

        {!loading && !error && frames.length > 0 && (
          <div
            style={{
              position: "absolute",

              bottom: "16px",
              left: "18px",

              zIndex: 20,

              padding: "8px 12px",

              background: "rgba(0,0,0,0.55)",

              borderRadius: "6px",

              color: "#aaa",

              fontSize: "12px",

              pointerEvents: "none",
            }}
          >
            Frame {currentFrame + 1}
            {" / "}
            {frames.length}
          </div>
        )}

        {/* HELP */}

        {!loading && !error && frames.length > 0 && (
          <div
            style={{
              position: "absolute",

              bottom: "16px",
              right: "18px",

              zIndex: 20,

              padding: "8px 12px",

              background: "rgba(0,0,0,0.55)",

              borderRadius: "6px",

              color: "#aaa",

              fontSize: "12px",

              pointerEvents: "none",
            }}
          >
            Drag to look around
            {" • "}
            ESC to close
          </div>
        )}

        {/* THREE.JS */}

        <Canvas
          camera={{
            fov: 75,
            near: 0.1,
            far: 1000,
          }}
          style={{
            width: "100%",
            height: "100%",
          }}
        >
          <SoccerScene frame={frames[currentFrame]} />
        </Canvas>
      </div>
    </div>
  );
}
