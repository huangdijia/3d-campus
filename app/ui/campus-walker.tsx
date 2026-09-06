/* oxlint-disable react/react-compiler -- Three.js cameras, Rapier bodies, and shared frame input are intentionally imperative resources, updated only in effects/events/physics steps. */
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useRef } from 'react';
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat';
import { insideCampus, type CollisionData } from './campus-geometry';

import type { WalkInputRef } from './campus-walk-controls';

const movementKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export function CampusWalker({
  spawn,
  reset,
  input,
  collisionData,
}: {
  spawn: [number, number, number];
  reset: number;
  input: WalkInputRef;
  collisionData: CollisionData;
}) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const { world } = useRapier();
  const { camera, gl } = useThree();
  const controller = useRef<KinematicCharacterController | null>(null);
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const velocity = useRef(0);

  useEffect(() => {
    const character = world.createCharacterController(0.025);
    character.enableSnapToGround(0.4);
    character.enableAutostep(0.3, 0.2, false);
    character.setMaxSlopeClimbAngle(Math.PI / 4);
    controller.current = character;
    return () => {
      controller.current = null;
      world.removeCharacterController(character);
    };
  }, [world]);

  useEffect(() => {
    body.current?.setTranslation(
      { x: spawn[0], y: spawn[1], z: spawn[2] },
      true,
    );
    body.current?.setNextKinematicTranslation({
      x: spawn[0],
      y: spawn[1],
      z: spawn[2],
    });
    velocity.current = 0;
    yaw.current = 0;
    pitch.current = 0;
    input.current = { x: 0, z: 0, yaw: 0, pitch: 0 };
    keys.current.clear();
    camera.position.set(spawn[0], spawn[1] + 0.65, spawn[2]);
    camera.rotation.set(0, 0, 0);
  }, [reset, spawn, camera, input]);

  useEffect(() => {
    const canvas = gl.domElement;
    const previousTabIndex = canvas.tabIndex;
    canvas.tabIndex = 0;
    const clear = () => {
      keys.current.clear();
      input.current.x = 0;
      input.current.z = 0;
    };
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Escape') clear();
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /INPUT|TEXTAREA|SELECT/.test(target.tagName))
      )
        return;
      if (
        movementKeys.has(event.code) &&
        (document.pointerLockElement === canvas ||
          document.activeElement === canvas)
      ) {
        event.preventDefault();
        keys.current.add(event.code);
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const move = (event: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        input.current.yaw -= event.movementX * 0.002;
        input.current.pitch -= event.movementY * 0.002;
      }
    };
    let touch: { id: number; x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      canvas.focus({ preventScroll: true });
      if (event.pointerType === 'touch') {
        touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      } else if (event.button === 0 && canvas.requestPointerLock) {
        // Embedded browsers may decline pointer lock; drag-to-look still works.
        try {
          void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
        } catch {
          // Drag-to-look is also available when pointer lock is disallowed.
        }
        touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (
        !touch ||
        touch.id !== event.pointerId ||
        document.pointerLockElement === canvas
      )
        return;
      input.current.yaw -= (event.clientX - touch.x) * 0.005;
      input.current.pitch -= (event.clientY - touch.y) * 0.005;
      touch.x = event.clientX;
      touch.y = event.clientY;
    };
    const pointerUp = () => {
      touch = null;
    };
    const lockChanged = () => {
      if (document.pointerLockElement !== canvas) clear();
    };
    const visibilityChanged = () => {
      if (document.hidden) clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibilityChanged);
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lockChanged);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    return () => {
      clear();
      canvas.tabIndex = previousTabIndex;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibilityChanged);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lockChanged);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [gl, input]);

  useBeforePhysicsStep(() => {
    const character = controller.current;
    const rigidBody = body.current;
    const shape = collider.current;
    if (!character || !rigidBody || !shape) return;
    const dt = Math.min(world.timestep, 1 / 30);
    const pressed = keys.current;
    yaw.current += input.current.yaw;
    pitch.current = Math.max(
      -1.3,
      Math.min(1.3, pitch.current + input.current.pitch),
    );
    input.current.yaw = 0;
    input.current.pitch = 0;
    let x =
      input.current.x +
      Number(pressed.has('KeyD') || pressed.has('ArrowRight')) -
      Number(pressed.has('KeyA') || pressed.has('ArrowLeft'));
    let z =
      input.current.z +
      Number(pressed.has('KeyS') || pressed.has('ArrowDown')) -
      Number(pressed.has('KeyW') || pressed.has('ArrowUp'));
    const length = Math.max(1, Math.hypot(x, z));
    x = (x / length) * 4 * dt;
    z = (z / length) * 4 * dt;
    velocity.current = Math.max(-25, velocity.current - 9.81 * dt);
    character.computeColliderMovement(
      shape,
      {
        x: x * Math.cos(yaw.current) + z * Math.sin(yaw.current),
        y: velocity.current * dt,
        z: z * Math.cos(yaw.current) - x * Math.sin(yaw.current),
      },
      undefined,
      undefined,
      (obstacle) => obstacle.handle !== shape.handle,
    );
    const movement = character.computedMovement();
    const position = rigidBody.translation();
    const next = {
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    };
    if (!insideCampus([next.x, next.z], collisionData)) {
      next.x = position.x;
      next.z = position.z;
    }
    if (position.y < -5 || !Number.isFinite(position.y)) {
      rigidBody.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
      rigidBody.setNextKinematicTranslation({
        x: spawn[0],
        y: spawn[1],
        z: spawn[2],
      });
      velocity.current = 0;
      return;
    }
    rigidBody.setNextKinematicTranslation(next);
    if (character.computedGrounded()) velocity.current = 0;
  });

  useFrame(() => {
    const position = body.current?.translation();
    if (!position) return;
    camera.position.set(position.x, position.y + 0.65, position.z);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={spawn}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider ref={collider} args={[0.55, 0.3]} />
    </RigidBody>
  );
}
