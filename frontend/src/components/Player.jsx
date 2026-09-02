import { useFrame, useLoader, useThree } from "@react-three/fiber";

import { useEffect, useRef } from "react";

import * as THREE from "three";

const PLAYER_SPRITE = "/player.png";

const PLAYER_FORM_SPRITE = "/player_form.png";

export default function Player({ player, color, renderMode }) {
  const groupRef = useRef(null);

  const { camera } = useThree();

  const textures = useLoader(THREE.TextureLoader, [
    PLAYER_SPRITE,
    PLAYER_FORM_SPRITE,
  ]);

  const animation = useRef({
    start: new THREE.Vector3(player.x, 0, player.z),

    target: new THREE.Vector3(player.x, 0, player.z),

    elapsed: 0,

    duration: 0.5,

    initialized: false,
  });

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    const current = groupRef.current.position;

    animation.current.start.copy(current);

    animation.current.target.set(player.x, 0, player.z);

    animation.current.elapsed = 0;

    if (!animation.current.initialized) {
      current.set(player.x, 0, player.z);

      animation.current.start.copy(current);

      animation.current.initialized = true;
    }
  }, [player.x, player.z]);

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    if (renderMode === "sprites") {
      return;
    }

    if (
      player.direction_angle === null ||
      player.direction_angle === undefined
    ) {
      return;
    }

    groupRef.current.rotation.y = Number(player.direction_angle);
  }, [player.direction_angle, renderMode]);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    const anim = animation.current;

    if (anim.elapsed >= anim.duration) {
      groupRef.current.position.copy(anim.target);
    } else {
      anim.elapsed += delta;

      let progress = anim.elapsed / anim.duration;

      progress = Math.min(progress, 1);

      const smoothProgress = progress * progress * (3 - 2 * progress);

      groupRef.current.position.lerpVectors(
        anim.start,
        anim.target,
        smoothProgress,
      );
    }

    if (renderMode !== "sprites") {
      return;
    }

    if (
      player.direction_angle === null ||
      player.direction_angle === undefined
    ) {
      return;
    }

    const angle = Number(player.direction_angle);

    const playerDirection = new THREE.Vector3(
      Math.cos(angle),
      0,
      Math.sin(angle),
    );

    const cameraForward = new THREE.Vector3();

    camera.getWorldDirection(cameraForward);

    cameraForward.y = 0;

    if (cameraForward.lengthSq() === 0) {
      return;
    }

    cameraForward.normalize();

    const cameraRight = new THREE.Vector3();

    cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0));

    if (cameraRight.lengthSq() === 0) {
      return;
    }

    cameraRight.normalize();

    const side = playerDirection.dot(cameraRight);

    const mirrored = side < 0;

    for (const child of groupRef.current.children) {
      if (!child.isSprite) {
        continue;
      }

      child.scale.x = mirrored ? -1.1 : 1.1;
    }
  });

  if (renderMode === "sprites") {
    return (
      <group ref={groupRef}>
        <sprite position={[0, 1.2, 0]} scale={[1.1, 2.2, 1]} renderOrder={1}>
          <spriteMaterial
            map={textures[0]}
            transparent
            alphaTest={0.05}
            depthWrite
          />
        </sprite>

        <sprite position={[0, 1.2, 0]} scale={[1.1, 2.2, 1]} renderOrder={2}>
          <spriteMaterial
            map={textures[1]}
            color={color}
            transparent
            alphaTest={0.05}
            depthWrite={false}
          />
        </sprite>
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      <mesh position={[0, 1.25, 0]}>
        <capsuleGeometry args={[0.28, 0.65, 8, 16]} />

        <meshStandardMaterial color={color} />
      </mesh>

      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />

        <meshStandardMaterial color="#d9a066" />
      </mesh>

      <mesh position={[-0.38, 1.3, 0]} rotation={[0, 0, -0.15]}>
        <capsuleGeometry args={[0.08, 0.5, 6, 8]} />

        <meshStandardMaterial color={color} />
      </mesh>

      <mesh position={[0.38, 1.3, 0]} rotation={[0, 0, 0.15]}>
        <capsuleGeometry args={[0.08, 0.5, 6, 8]} />

        <meshStandardMaterial color={color} />
      </mesh>

      <mesh position={[-0.14, 0.55, 0]}>
        <capsuleGeometry args={[0.09, 0.5, 6, 8]} />

        <meshStandardMaterial color="#222222" />
      </mesh>

      <mesh position={[0.14, 0.55, 0]}>
        <capsuleGeometry args={[0.09, 0.5, 6, 8]} />

        <meshStandardMaterial color="#222222" />
      </mesh>
    </group>
  );
}
