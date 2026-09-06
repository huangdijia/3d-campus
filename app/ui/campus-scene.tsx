/* oxlint-disable react/react-compiler -- Three.js cameras, Rapier bodies, and shared frame input are intentionally imperative resources, updated only in effects/events/physics steps. */
'use client';

import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { OrbitControls as OrbitControlsInstance } from 'three-stdlib';
import { Physics, RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { Campus, POI } from '../data/types';
import {
  chooseSafeSpawn,
  disposeCampusModel,
  featureIdAtFace,
  makeCollisionMesh,
  readCollisionData,
  type CollisionData,
} from './campus-geometry';
import {
  CampusWalker,
  CampusWalkControls,
  type WalkInput,
  type WalkInputRef,
} from './campus-walker';

type Props = {
  campus: Campus;
  selected: POI | null;
  onSelect: (poi: POI) => void;
  touring: boolean;
  onTourIndex: (index: number) => void;
  walk: boolean;
  reset: number;
  onError: () => void;
  onReady: () => void;
};

type LoadedCampus = {
  model: THREE.Group;
  collisionData: CollisionData | null;
  spawn: [number, number, number] | null;
};

function World({
  campus,
  selected,
  onSelect,
  touring,
  onTourIndex,
  walk,
  reset,
  onError,
  onReady,
  input,
  onWalkAvailable,
}: Props & {
  input: WalkInputRef;
  onWalkAvailable: (available: boolean) => void;
}) {
  const [loaded, setLoaded] = useState<LoadedCampus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { camera, gl } = useThree();
  const callbacks = useRef({ onError, onReady });
  const controls = useRef<OrbitControlsInstance>(null);
  const elapsed = useRef(0);
  const lastIndex = useRef(-1);
  const flight = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const span = Math.max(
    campus.bounds[2] - campus.bounds[0],
    campus.bounds[3] - campus.bounds[1],
    100,
  );
  const center = useMemo(
    () =>
      new THREE.Vector3(
        (campus.bounds[0] + campus.bounds[2]) / 2,
        0,
        (campus.bounds[1] + campus.bounds[3]) / 2,
      ),
    [campus.bounds],
  );
  const tourPath = campus.tours[0]?.path;
  const tourPoint = useMemo(() => new THREE.Vector3(), []);
  const tourCamera = useMemo(() => new THREE.Vector3(), []);
  const canWalk = Boolean(loaded?.spawn && loaded.collisionData);
  const walking = walk && canWalk;

  useEffect(() => {
    callbacks.current = { onError, onReady };
  }, [onError, onReady]);

  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    let owned: THREE.Group | null = null;
    const timeout = window.setTimeout(() => abort.abort(), 45000);
    async function load() {
      try {
        const collisionPromise = fetch(
          `/data/${campus.universityId}-collision.json`,
          { signal: abort.signal },
        )
          .then((response) => {
            if (!response.ok) throw Error('Collision data unavailable');
            return response.json() as Promise<unknown>;
          })
          .then(readCollisionData)
          .catch(() => null);
        const response = await fetch(campus.modelUrl, { signal: abort.signal });
        if (!response.ok) throw Error(`Campus model HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(
          bytes,
          new URL('.', new URL(campus.modelUrl, location.href)).href,
        );
        owned = gltf.scene;
        if (!active) {
          if (owned) disposeCampusModel(owned);
          owned = null;
          return;
        }
        if (!makeCollisionMesh(owned))
          throw Error('Campus model has no usable geometry');
        const collisionData = await collisionPromise;
        if (!active) {
          if (owned) disposeCampusModel(owned);
          owned = null;
          return;
        }
        const spawn = collisionData
          ? chooseSafeSpawn(collisionData, [center.x, center.z])
          : null;
        setLoaded({ model: owned, collisionData, spawn });
        onWalkAvailable(Boolean(spawn));
        callbacks.current.onReady();
      } catch {
        if (owned) {
          disposeCampusModel(owned);
          owned = null;
        }
        if (active) {
          setLoadError(true);
          callbacks.current.onError();
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      active = false;
      abort.abort();
      window.clearTimeout(timeout);
      if (owned) {
        disposeCampusModel(owned);
        owned = null;
      }
    };
  }, [campus.modelUrl, campus.universityId, center, onWalkAvailable]);

  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      callbacks.current.onError();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl]);

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = walking ? 65 : 48;
      camera.updateProjectionMatrix();
    }
    if (walking) return;
    camera.position.set(center.x, span * 0.78, center.z + span * 0.7);
    camera.lookAt(center);
    if (controls.current) {
      controls.current.target.copy(center);
      controls.current.update();
    }
    flight.current = null;
    elapsed.current = 0;
    lastIndex.current = -1;
  }, [reset, walking, camera, span, center]);

  useEffect(() => {
    if (!selected || walking) return;
    const target = new THREE.Vector3(...selected.position);
    flight.current = {
      position: target.clone().add(new THREE.Vector3(90, 145, 135)),
      target,
    };
  }, [selected, walking]);

  useEffect(() => {
    if (touring) flight.current = null;
  }, [touring]);

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (walking || !orbit) return;
    const smooth = 1 - Math.exp(-Math.min(delta, 0.1) * 3);
    if (touring && tourPath?.length) {
      elapsed.current += Math.min(delta, 0.1);
      const index = Math.floor(elapsed.current / 6) % tourPath.length;
      const next = (index + 1) % tourPath.length;
      const t = (elapsed.current % 6) / 6;
      const progress = t * t * (3 - 2 * t);
      const a = tourPath[index];
      const b = tourPath[next];
      tourPoint.set(
        THREE.MathUtils.lerp(a[0], b[0], progress),
        THREE.MathUtils.lerp(a[1], b[1], progress),
        THREE.MathUtils.lerp(a[2], b[2], progress),
      );
      tourCamera.copy(tourPoint).add(new THREE.Vector3(80, 100, 150));
      camera.position.lerp(tourCamera, smooth);
      orbit.target.lerp(tourPoint.setY(10), smooth);
      if (index !== lastIndex.current) {
        lastIndex.current = index;
        onTourIndex(index);
      }
      orbit.update();
    } else if (flight.current) {
      const target = flight.current;
      camera.position.lerp(target.position, smooth);
      orbit.target.lerp(target.target, smooth);
      orbit.update();
      if (camera.position.distanceTo(target.position) < 0.1)
        flight.current = null;
    }
  });

  const collision = useMemo(
    () => (loaded && walking ? makeCollisionMesh(loaded.model) : null),
    [loaded, walking],
  );
  const selectBuilding = (event: ThreeEvent<MouseEvent>) => {
    if (walking || event.delta > 3) return;
    const id = featureIdAtFace(event.object, event.faceIndex);
    const poi = campus.pois.find((candidate) => candidate.id === id);
    if (poi) {
      event.stopPropagation();
      onSelect(poi);
    }
  };

  return (
    <>
      <color attach="background" args={['#e8f0f2']} />
      <ambientLight intensity={2} />
      <directionalLight
        position={[-500, 900, 300]}
        intensity={2.5}
        color="#fff0d4"
      />
      <directionalLight
        position={[400, 500, -300]}
        intensity={1}
        color="#b9dfe9"
      />
      {loaded && (
        <primitive
          object={loaded.model}
          dispose={null}
          onClick={selectBuilding}
        />
      )}
      {!loaded && !loadError && (
        <Html center>
          <output className="canvas-loading">
            <span className="spinner" />
            正在载入校园建筑
          </output>
        </Html>
      )}
      {loadError && (
        <Html center>
          <div className="canvas-loading" role="alert">
            校园模型加载失败，请返回重试。
          </div>
        </Html>
      )}
      {walk && loaded && !canWalk && (
        <Html center>
          <output className="canvas-loading">
            漫游资料尚未就绪，仍可使用鸟瞰与建筑导览。
          </output>
        </Html>
      )}
      {selected && !walking && (
        <group position={selected.position}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[15, 19, 40]} />
            <meshBasicMaterial
              color="#007aff"
              side={THREE.DoubleSide}
              depthTest={false}
              transparent
              opacity={0.85}
            />
          </mesh>
          <Html position={[0, 12, 0]} center style={{ pointerEvents: 'none' }}>
            <span className="poi-label">{selected.name}</span>
          </Html>
        </group>
      )}
      {touring && !walking && tourPath && tourPath.length > 1 && (
        <Line
          points={tourPath}
          color="#007aff"
          lineWidth={1.5}
          transparent
          opacity={0.5}
          dashed
          dashSize={12}
          gapSize={8}
        />
      )}
      {!walking && (
        <OrbitControls
          ref={controls}
          makeDefault
          minDistance={30}
          maxDistance={span * 2.2}
          maxPolarAngle={Math.PI / 2.15}
          enabled={!touring}
          enableDamping={!touring}
          dampingFactor={0.07}
          onStart={() => {
            flight.current = null;
          }}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
          screenSpacePanning={false}
          touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        />
      )}
      {walking && collision && loaded?.spawn && loaded.collisionData && (
        <Suspense
          fallback={
            <Html center>
              <output className="canvas-loading">正在准备校园漫游…</output>
            </Html>
          }
        >
          <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
            <RigidBody type="fixed" colliders={false}>
              <TrimeshCollider args={[collision.vertices, collision.indices]} />
            </RigidBody>
            <CampusWalker
              spawn={loaded.spawn}
              collisionData={loaded.collisionData}
              reset={reset}
              input={input}
            />
          </Physics>
        </Suspense>
      )}
    </>
  );
}

export default function CampusScene(props: Props) {
  const input = useRef<WalkInput>({ x: 0, z: 0, yaw: 0, pitch: 0 });
  const [walkAvailable, setWalkAvailable] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return (
    <>
      <Canvas
        camera={{ position: [0, 1400, 1200], fov: 48, near: 0.2, far: 15000 }}
        dpr={[1, mobile ? 1 : 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <World
          key={`${props.campus.universityId}:${props.campus.id}:${props.campus.modelUrl}`}
          {...props}
          input={input}
          onWalkAvailable={setWalkAvailable}
        />
      </Canvas>
      {props.walk && walkAvailable && <CampusWalkControls input={input} />}
    </>
  );
}
