'use client';

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { Physics, RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { Group } from 'three';
import { makeCollisionMesh, type CollisionData } from './campus-geometry';
import { CampusWalker } from './campus-walker';
import type { WalkInputRef } from './campus-walk-controls';

// This entire module, including Rapier/WASM, is imported only upon entering walk mode.
export default function CampusWalkWorld({
  model,
  spawn,
  collisionData,
  reset,
  input,
}: {
  model: Group;
  spawn: [number, number, number];
  collisionData: CollisionData;
  reset: number;
  input: WalkInputRef;
}) {
  const collision = useMemo(() => makeCollisionMesh(model), [model]);
  if (!collision) {
    return (
      <Html center>
        <output className="canvas-loading">
          校园碰撞资料无法使用，请切回鸟瞰。
        </output>
      </Html>
    );
  }
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[collision.vertices, collision.indices]} />
      </RigidBody>
      <CampusWalker
        spawn={spawn}
        collisionData={collisionData}
        reset={reset}
        input={input}
      />
    </Physics>
  );
}
