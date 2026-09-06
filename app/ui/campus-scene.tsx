/* oxlint-disable react/react-compiler -- Three.js cameras, Rapier bodies, and shared frame input are intentionally imperative resources, updated only in effects/events/physics steps. */
'use client';

import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { useEffect, useRef, useState, useMemo, Suspense, lazy } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { OrbitControls as OrbitControlsInstance } from 'three-stdlib';
import type { Campus, POI } from '../data/types';
import {
  chooseSafeSpawn,
  buildingBounds,
  disposeCampusModel,
  featureIdAtFace,
  hasCampusGeometry,
  readCollisionData,
  type CollisionData,
} from './campus-geometry';
import {
  CampusWalkControls,
  type WalkInput,
  type WalkInputRef,
} from './campus-walk-controls';

const CampusWalkWorld = lazy(() => import('./campus-walk-world'));

type Props = {
  campus: Campus;
  selected: POI | null;
  onSelect: (poi: POI) => void;
  touring: boolean;
  tourActive?: boolean;
  tourPOI?: POI | null;
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
  tourActive = true,
  tourPOI = null,
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
  const { camera, gl, invalidate } = useThree();
  const callbacks = useRef({ onError, onReady });
  const controls = useRef<OrbitControlsInstance>(null);
  const elapsed = useRef(0);
  const destinationIndex = useRef(0);
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
  const campusRadius =
    Math.hypot(
      campus.bounds[2] - campus.bounds[0],
      campus.bounds[3] - campus.bounds[1],
    ) /
      2 +
    120;
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
  const calloutPOI = tourPOI ?? selected;
  const calloutAnchor = useMemo<[number, number, number] | null>(() => {
    if (!calloutPOI) return null;
    const bounds = loaded ? buildingBounds(loaded.model, calloutPOI.id) : null;
    return [
      calloutPOI.position[0],
      Math.max(calloutPOI.position[1], bounds?.max.y ?? 0) + 2,
      calloutPOI.position[2],
    ];
  }, [loaded, calloutPOI]);

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
        if (!hasCampusGeometry(owned))
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
    destinationIndex.current = 0;
    lastIndex.current = -1;
    invalidate();
  }, [reset, walking, camera, span, center, invalidate]);

  useEffect(() => {
    if (!selected || walking) return;
    const target = new THREE.Vector3(...selected.position);
    flight.current = {
      position: target.clone().add(new THREE.Vector3(90, 145, 135)),
      target,
    };
    invalidate();
  }, [selected, walking, invalidate]);

  useEffect(() => {
    if (touring) flight.current = null;
  }, [touring]);

  useEffect(() => {
    if (tourActive) {
      onTourIndex(-1);
      return;
    }
    destinationIndex.current = 0;
    elapsed.current = 0;
    lastIndex.current = -1;
  }, [tourActive, onTourIndex]);

  useFrame((_, delta) => {
    const orbit = controls.current;
    if (camera instanceof THREE.PerspectiveCamera) {
      // A 20 cm near plane wastes depth precision in a kilometre-scale bird view.
      // Log depth handles thin ground layers; clipping still follows this campus.
      const distance = orbit ? camera.position.distanceTo(orbit.target) : span;
      const near = walking
        ? 0.15
        : THREE.MathUtils.clamp(distance / 100, 1, 10);
      const far = Math.max(
        500,
        camera.position.distanceTo(center) + campusRadius * 1.25,
      );
      if (
        Math.abs(camera.near - near) > 0.001 ||
        Math.abs(camera.far - far) > 0.1
      ) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    }
    if (walking || !orbit) return;
    const smooth = 1 - Math.exp(-Math.min(delta, 0.1) * 3);
    if (touring && tourPath?.length) {
      const index = destinationIndex.current % tourPath.length;
      const point = tourPath[index];
      const poi = campus.pois.find(
        (candidate) => candidate.id === campus.tours[0]?.poiIds[index],
      );
      tourPoint.set(...(poi?.position || [point[0], 10, point[2]]));
      tourCamera.set(point[0] + 80, point[1] + 100, point[2] + 150);
      camera.position.lerp(tourCamera, smooth);
      orbit.target.lerp(tourPoint, smooth);
      if (
        camera.position.distanceTo(tourCamera) < 0.1 &&
        orbit.target.distanceTo(tourPoint) < 0.1
      ) {
        // Report the building only once the camera has reached that stop.
        camera.position.copy(tourCamera);
        orbit.target.copy(tourPoint);
        if (index !== lastIndex.current) {
          lastIndex.current = index;
          onTourIndex(index);
        }
        elapsed.current += Math.min(delta, 0.1);
        if (elapsed.current >= 4) {
          destinationIndex.current = (index + 1) % tourPath.length;
          elapsed.current = 0;
        }
      }
      orbit.update();
    } else if (flight.current) {
      const target = flight.current;
      camera.position.lerp(target.position, smooth);
      orbit.target.lerp(target.target, smooth);
      orbit.update();
      if (camera.position.distanceTo(target.position) < 0.1) {
        camera.position.copy(target.position);
        orbit.target.copy(target.target);
        orbit.update();
        flight.current = null;
      } else {
        // Continue just this flight while an otherwise idle campus uses demand rendering.
        invalidate();
      }
    }
  });

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
        </group>
      )}
      {calloutPOI && calloutAnchor && !walking && (
        <Html center position={calloutAnchor} zIndexRange={[20, 0]}>
          <article
            className="campus-tour-callout"
            aria-label={tourPOI ? '当前导览建筑信息' : '当前查看建筑信息'}
            aria-live="polite"
            aria-atomic="true"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <h2>{calloutPOI.name}</h2>
            <p>{calloutPOI.description}</p>
            <a href={calloutPOI.sourceUrl} target="_blank" rel="noreferrer">
              查看建筑资料 ↗
            </a>
          </article>
        </Html>
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
      {walking && loaded?.spawn && loaded.collisionData && (
        <Suspense
          fallback={
            <Html center>
              <output className="canvas-loading">正在准备校园漫游…</output>
            </Html>
          }
        >
          <CampusWalkWorld
            model={loaded.model}
            spawn={loaded.spawn}
            collisionData={loaded.collisionData}
            reset={reset}
            input={input}
          />
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
        camera={{ position: [0, 1400, 1200], fov: 48, near: 10, far: 10000 }}
        frameloop={props.walk || props.touring ? 'always' : 'demand'}
        dpr={[1, mobile ? 1 : 1.5]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          logarithmicDepthBuffer: true,
        }}
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
