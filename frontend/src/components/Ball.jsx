import {
  useFrame,
  useLoader,
} from "@react-three/fiber";

import {
  useEffect,
  useRef,
} from "react";

import * as THREE from "three";


const BALL_SPRITE = "/ball.png";


export default function Ball({
  ball,
  renderMode,
}) {
  const objectRef =
    useRef(null);


  const texture = useLoader(
    THREE.TextureLoader,
    BALL_SPRITE
  );


  const animation = useRef({
    start: new THREE.Vector3(
      ball.x,
      ball.y + 0.15 ?? 0.15,
      ball.z
    ),

    target: new THREE.Vector3(
      ball.x,
      ball.y + 0.15 ?? 0.15,
      ball.z
    ),

    elapsed: 0,
    duration: 0.5,
    initialized: false,
  });


  useEffect(() => {
    if (!objectRef.current) {
      return;
    }


    const current =
      objectRef.current.position;


    animation.current.start.copy(
      current
    );

    animation.current.target.set(
      ball.x,
      ball.y + 0.15 ?? 0.15,
      ball.z
    );

    animation.current.elapsed = 0;


    if (
      !animation.current.initialized
    ) {
      current.copy(
        animation.current.target
      );

      animation.current.start.copy(
        current
      );

      animation.current.initialized =
        true;
    }
  }, [
    ball.x,
    ball.y,
    ball.z,
  ]);


  useFrame((_, delta) => {
    const anim =
      animation.current;


    if (!objectRef.current) {
      return;
    }


    if (
      anim.elapsed >=
      anim.duration
    ) {
      objectRef.current.position.copy(
        anim.target
      );

      return;
    }


    anim.elapsed += delta;


    const progress =
      Math.min(
        anim.elapsed /
          anim.duration,
        1
      );


    const smoothProgress =
      progress *
      progress *
      (3 - 2 * progress);


    objectRef.current.position.lerpVectors(
      anim.start,
      anim.target,
      smoothProgress
    );
  });

  if (renderMode === "sprites") {
    return (
      <sprite
        ref={objectRef}
        scale={[
          1.1,
          2.2,
          1,
        ]}
      >
        <spriteMaterial
          map={texture}
          transparent
          alphaTest={0.05}
          depthWrite
        />
      </sprite>
    );
  }

  return (
    <mesh ref={objectRef}>
      <sphereGeometry
        args={[
          0.25,
          24,
          24,
        ]}
      />

      <meshStandardMaterial
        color="white"
      />
    </mesh>
  );
}