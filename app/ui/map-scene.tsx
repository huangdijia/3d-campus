'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls, Html } from '@react-three/drei';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import type { University } from '../data/types';
import { project, elevation, type Terrain, type MapView } from './geo';
type Props = {
  universities: University[];
  selected: University | null;
  onSelect: (u: University) => void;
  viewRef: RefObject<MapView | null>;
  reset: number;
  onError: () => void;
};
type MapData = { model: THREE.Group; terrain: Terrain };
type Marker = {
  key: string;
  name: string;
  items: University[];
  position: [number, number];
  world: [number, number, number];
};
const initial: MapView = { position: [0, 75, 63], target: [0, 0, 1] };
const modelUrl = '/models/national-map.glb';
// Cache downloaded bytes, not GPU objects: every Canvas owns and disposes its model.
let bytesPromise: Promise<ArrayBuffer> | null = null;
let terrainPromise: Promise<Terrain> | null = null;
function modelBytes() {
  if (!bytesPromise)
    bytesPromise = fetch('/data/national-map.json')
      .then(async (r) => {
        if (!r.ok) throw Error('National map manifest unavailable');
        const asset: { modelSha256: string } = await r.json();
        return fetch(`${modelUrl}?v=${asset.modelSha256.slice(0, 12)}`);
      })
      .then((r) => {
        if (!r.ok) throw Error('National map unavailable');
        return r.arrayBuffer();
      })
      .catch((e) => {
        bytesPromise = null;
        throw e;
      });
  return bytesPromise;
}
function terrainData() {
  if (!terrainPromise)
    terrainPromise = fetch('/data/terrain.json')
      .then((r) => {
        if (!r.ok) throw Error('Terrain unavailable');
        return r.json() as Promise<Terrain>;
      })
      .catch((e) => {
        terrainPromise = null;
        throw e;
      });
  return terrainPromise;
}
function disposeModel(model: THREE.Group) {
  model.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((m) => m.dispose());
    }
  });
}
const regionByProvince: Record<string, string> = {
  北京: '华北',
  天津: '华北',
  河北: '华北',
  山西: '华北',
  内蒙古: '华北',
  辽宁: '东北',
  吉林: '东北',
  黑龙江: '东北',
  上海: '华东',
  江苏: '华东',
  浙江: '华东',
  安徽: '华东',
  福建: '华东',
  江西: '华东',
  山东: '华东',
  河南: '华中',
  湖北: '华中',
  湖南: '华中',
  广东: '华南',
  广西: '华南',
  海南: '华南',
  重庆: '西南',
  四川: '西南',
  贵州: '西南',
  云南: '西南',
  西藏: '西南',
  陕西: '西北',
  甘肃: '西北',
  青海: '西北',
  宁夏: '西北',
  新疆: '西北',
};
const mobileRegionOffsets: Record<string, [number, number]> = {
  华北: [0, -25],
  东北: [36, -42],
  华东: [38, 0],
  华中: [-15, 12],
  华南: [0, 20],
  西南: [-30, 8],
  西北: [-28, -15],
};
function MarkerPosts({
  markers,
  selectedId,
}: {
  markers: Marker[];
  selectedId: string | undefined;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4(),
      color = new THREE.Color();
    markers.forEach((marker, index) => {
      const [x, y, z] = marker.world;
      matrix.makeTranslation(x, y + 0.35, z);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(
        index,
        color.set(
          marker.items.some((u) => u.id === selectedId) ? '#007aff' : '#598e87',
        ),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [markers, selectedId]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, markers.length]}>
      <cylinderGeometry args={[0.11, 0.16, 0.7, 8]} />
      <meshStandardMaterial
        color="white"
        emissive="#6d8e9b"
        emissiveIntensity={0.12}
      />
    </instancedMesh>
  );
}
function MapWorld({
  universities,
  selected,
  onSelect,
  viewRef,
  reset,
  onError,
}: Props) {
  const [data, setData] = useState<MapData | null>(null),
    [level, setLevel] = useState(0);
  const controls = useRef<MapControlsImpl>(null),
    { camera, invalidate, size, setDpr } = useThree();
  const target = useRef(new THREE.Vector3()),
    fly = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null),
    first = useRef(true),
    selectedInitialized = useRef(false),
    restoredView = useRef(false),
    viewInitialized = useRef(false);
  const mobile = size.width < 640;
  const home = useMemo<MapView>(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const distance = Math.max(
      125,
      110 /
        (2 *
          Math.tan(THREE.MathUtils.degToRad(47) / 2) *
          Math.max(aspect, 0.25)),
    );
    return {
      position: mobile
        ? [0, distance * 0.77, distance * 0.65]
        : initial.position,
      target: initial.target,
    };
  }, [mobile, size.width, size.height]);
  const homeDistance = Math.hypot(...home.position);
  const homeRef = useRef(home);
  useEffect(() => {
    homeRef.current = home;
  }, [home]);
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio, mobile ? 1 : 1.5));
  }, [mobile, setDpr]);
  useEffect(() => {
    let active = true,
      owned: THREE.Group | null = null;
    Promise.all([modelBytes(), terrainData()])
      .then(async ([bytes, terrain]) => {
        if (!active) return;
        const gltf = await new GLTFLoader().parseAsync(
          bytes,
          new URL('.', new URL(modelUrl, location.href)).href,
        );
        owned = gltf.scene;
        if (!active) {
          disposeModel(owned);
          owned = null;
          return;
        }
        setData({ model: owned, terrain });
        invalidate();
      })
      .catch(() => active && onError());
    return () => {
      active = false;
      if (owned) disposeModel(owned);
    };
  }, [onError, invalidate]);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      onError();
    };
    const canvas = controls.current?.domElement;
    canvas?.addEventListener('webglcontextlost', lost);
    return () => canvas?.removeEventListener('webglcontextlost', lost);
  }, [onError]);
  useEffect(() => {
    if (!controls.current || !size.width || viewInitialized.current) return;
    restoredView.current = Boolean(viewRef.current);
    viewInitialized.current = true;
    const v = viewRef.current || home;
    camera.position.set(...v.position);
    controls.current.target.set(...v.target);
    controls.current.update();
    invalidate();
  }, [camera, viewRef, home, size.width, invalidate]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fly.current = {
      p: new THREE.Vector3(...homeRef.current.position),
      t: new THREE.Vector3(...homeRef.current.target),
    };
    invalidate();
  }, [reset, invalidate]);
  useEffect(() => {
    if (!data || !viewInitialized.current) return;
    if (!selectedInitialized.current) {
      selectedInitialized.current = true;
      if (restoredView.current) return;
    }
    if (!selected?.position) return;
    const [x, z] = project(...selected.position),
      h = elevation(data.terrain, ...selected.position);
    fly.current = {
      p: new THREE.Vector3(x, 15 + h, z + 12),
      t: new THREE.Vector3(x, h, z),
    };
    invalidate();
  }, [selected, data, size.width, invalidate]);
  useFrame((_, dt) => {
    if (!fly.current || !controls.current) return;
    const v = fly.current,
      a = 1 - Math.exp(-Math.min(dt, 0.1) * 3.4);
    camera.position.lerp(v.p, a);
    controls.current.target.lerp(v.t, a);
    if (camera.position.distanceTo(v.p) < 0.02) fly.current = null;
    controls.current.update();
    invalidate();
  });
  const markers = useMemo<Marker[]>(() => {
    if (!data) return [];
    const valid = universities.filter((u) => u.position);
    const groups = new Map<string, University[]>();
    valid.forEach((u) => {
      const key =
        level >= 2
          ? u.id
          : mobile && level === 0
            ? regionByProvince[u.province] || u.province
            : level === 0 || mobile
              ? u.province
              : u.city;
      groups.set(key, [...(groups.get(key) || []), u]);
    });
    return [...groups.entries()].map(([key, items]) => {
      const position: [number, number] = [
        items.reduce((v, u) => v + u.position![0], 0) / items.length,
        items.reduce((v, u) => v + u.position![1], 0) / items.length,
      ];
      const [x, z] = project(...position),
        h = elevation(data.terrain, ...position);
      return {
        key,
        name: level >= 2 ? items[0].name : key,
        items,
        position,
        world: [x, h + 0.22, z],
      };
    });
  }, [universities, level, mobile, data]);
  const onChange = () => {
    if (!controls.current || !viewInitialized.current) return;
    target.current.copy(controls.current.target);
    const distance = camera.position.distanceTo(target.current);
    setLevel(distance < 27 ? 2 : distance < 42 ? 1 : 0);
    viewRef.current = {
      position: camera.position.toArray() as [number, number, number],
      target: target.current.toArray() as [number, number, number],
    };
  };
  return (
    <>
      <ambientLight intensity={1.8} />
      <directionalLight
        position={[-30, 50, -20]}
        intensity={2.3}
        color="#ffedc9"
      />
      <directionalLight
        position={[20, 20, 20]}
        intensity={0.8}
        color="#a1d2e4"
      />
      <fog
        attach="fog"
        args={['#e8f1f4', homeDistance * 1.3, homeDistance * 2.5]}
      />
      {data && <primitive object={data.model} dispose={null} />}
      {markers.length > 0 && (
        <MarkerPosts markers={markers} selectedId={selected?.id} />
      )}
      {markers.map((m) => {
        const active = m.items.some((u) => u.id === selected?.id);
        const offset =
          mobile && level === 0 ? mobileRegionOffsets[m.name] : undefined;
        return (
          <Html
            key={m.key}
            position={[m.world[0], m.world[1] + 1.1, m.world[2]]}
            center
            distanceFactor={mobile ? undefined : level === 2 ? 24 : 85}
            zIndexRange={[15, 5]}
          >
            {offset && (
              <svg className="map-pin-leader" aria-hidden="true">
                <line x1="0" y1="0" x2={offset[0]} y2={offset[1]} />
                <circle cx="0" cy="0" r="2" />
              </svg>
            )}
            <button
              className={`map-pin ${active ? 'active' : ''}`}
              style={
                offset
                  ? { transform: `translate(${offset[0]}px, ${offset[1]}px)` }
                  : undefined
              }
              aria-label={
                m.items.length > 1
                  ? `${m.name} ${m.items.length} 所高校`
                  : m.name
              }
              onClick={() => {
                if (m.items.length === 1) onSelect(m.items[0]);
                else {
                  const [x, y, z] = m.world;
                  fly.current = {
                    p: new THREE.Vector3(
                      x,
                      y + (mobile && level === 0 ? 27 : 14),
                      z + (mobile && level === 0 ? 22 : 12),
                    ),
                    t: new THREE.Vector3(x, y, z),
                  };
                  invalidate();
                }
              }}
            >
              <span>{m.name}</span>
              {m.items.length > 1 && <b>{m.items.length}</b>}
            </button>
          </Html>
        );
      })}
      <MapControls
        ref={controls}
        screenSpacePanning={false}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
        makeDefault
        minDistance={4}
        maxDistance={Math.max(180, homeDistance * 2.2)}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2.25}
        enableDamping
        dampingFactor={0.08}
        onStart={() => {
          fly.current = null;
        }}
        onChange={onChange}
      />
    </>
  );
}
export default function MapScene(props: Props) {
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: initial.position, fov: 47, near: 0.5, far: 500 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor('#e8f1f4')}
      fallback={
        <div className="scene-error">当前设备不支持 3D，请使用高校列表。</div>
      }
    >
      <MapWorld {...props} />
    </Canvas>
  );
}
