'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
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
import { layoutMapLabels, type LabelAnchor } from './map-label-layout';
import './map-labels.css';
import { provinceRegion } from './regions';
type Props = {
  universities: University[];
  selected: University | null;
  onSelect: (u: University) => void;
  viewRef: RefObject<MapView | null>;
  reset: number;
  onError: () => void;
  onFocusComplete?: (universityId: string) => void;
  onFocusCancel?: () => void;
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
class LabelBridge {
  update?: (camera: THREE.Camera, width: number, height: number) => void;
  select?: (marker: Marker) => void;
  invalidate?: () => void;
  connectLabels(update: NonNullable<LabelBridge['update']>) {
    this.update = update;
    return () => {
      if (this.update === update) this.update = undefined;
    };
  }
  connectWorld(invalidate: () => void, select: (marker: Marker) => void) {
    this.invalidate = invalidate;
    this.select = select;
  }
}
function MapLabels({
  markers,
  selectedId,
  bridge,
}: {
  markers: Marker[];
  selectedId: string | undefined;
  bridge: RefObject<LabelBridge>;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const nodes = markers.map((marker) => ({
      marker,
      button: element.querySelector<HTMLButtonElement>(
        `[data-label-id="${CSS.escape(marker.key)}"]`,
      )!,
      leader: element.querySelector<SVGGElement>(
        `[data-leader-id="${CSS.escape(marker.key)}"]`,
      )!,
      overflowButton: element.querySelector<HTMLButtonElement>(
        `[data-overflow-id="${CSS.escape(marker.key)}"]`,
      )!,
    }));
    const overflow = element.querySelector<HTMLDetailsElement>('details')!;
    const summary = overflow.querySelector('summary')!;
    const projected = new THREE.Vector3();
    const update = (camera: THREE.Camera, width: number, height: number) => {
      const anchors: LabelAnchor[] = [];
      for (const { marker, button } of nodes) {
        projected.set(...marker.world).project(camera);
        // Ignore points outside the camera frustum rather than pinning distant
        // cities to viewport edges. Every school remains in the atlas list.
        if (
          projected.z < -1 ||
          projected.z > 1 ||
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1
        )
          continue;
        // Hidden elements have no measured size: use their last real dimensions.
        const w = button.offsetWidth || Number(button.dataset.width) || 120;
        const h = button.offsetHeight || Number(button.dataset.height) || 36;
        button.dataset.width = String(w);
        button.dataset.height = String(h);
        anchors.push({
          id: marker.key,
          x: ((projected.x + 1) * width) / 2,
          y: ((1 - projected.y) * height) / 2,
          width: w,
          height: h,
          priority: marker.items.some((u) => u.id === selectedId)
            ? 10000
            : marker.items.length,
        });
      }
      const layout = layoutMapLabels(anchors, {
        left: 12,
        top: 76,
        right: width - 12,
        bottom: height - (width < 640 ? 150 : 58),
      });
      const positions = new Map(layout.placed.map((p) => [p.id, p]));
      const extra = new Set(layout.overflow);
      for (const { marker, button, leader, overflowButton } of nodes) {
        const placement = positions.get(marker.key);
        button.hidden = !placement;
        leader.style.display = placement ? '' : 'none';
        overflowButton.hidden = !extra.has(marker.key);
        if (!placement) continue;
        button.style.transform = `translate(${placement.left}px, ${placement.top}px)`;
        const endX = Math.max(
          placement.left,
          Math.min(placement.x, placement.left + placement.width),
        );
        const endY = Math.max(
          placement.top,
          Math.min(placement.y, placement.top + placement.height),
        );
        const line = leader.children[0];
        line.setAttribute('x1', String(placement.x));
        line.setAttribute('y1', String(placement.y));
        line.setAttribute('x2', String(endX));
        line.setAttribute('y2', String(endY));
        const dot = leader.children[1];
        dot.setAttribute('cx', String(placement.x));
        dot.setAttribute('cy', String(placement.y));
      }
      overflow.hidden = !extra.size;
      summary.textContent = `更多高校（${extra.size}）`;
    };
    const disconnect = bridge.current.connectLabels(update);
    const observer = new ResizeObserver(() => bridge.current.invalidate?.());
    nodes.forEach(({ button }) => observer.observe(button));
    bridge.current.invalidate?.();
    return () => {
      observer.disconnect();
      disconnect();
    };
  }, [markers, selectedId, bridge]);
  return (
    <div className="map-label-overlay" ref={root}>
      <svg aria-hidden="true">
        {markers.map((m) => (
          <g key={m.key} data-leader-id={m.key} style={{ display: 'none' }}>
            <line />
            <circle r="2.5" />
          </g>
        ))}
      </svg>
      {markers.map((m) => (
        <button
          key={m.key}
          data-label-id={m.key}
          className={`map-pin ${m.items.some((u) => u.id === selectedId) ? 'active' : ''}`}
          style={{ transform: 'translate(-10000px, -10000px)' }}
          aria-label={
            m.items.length > 1 ? `${m.name} ${m.items.length} 所高校` : m.name
          }
          onClick={() => bridge.current.select?.(m)}
        >
          <span>{m.name}</span>
          {m.items.length > 1 && <b>{m.items.length}</b>}
        </button>
      ))}
      <details className="map-label-overflow" hidden>
        <summary>更多高校</summary>
        <div className="map-label-overflow-list">
          {markers.map((m) => (
            <button
              key={m.key}
              data-overflow-id={m.key}
              onClick={() => bridge.current.select?.(m)}
            >
              {m.name}
              {m.items.length > 1 ? ` · ${m.items.length} 所` : ''}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
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
  onFocusComplete,
  onFocusCancel,
  bridge,
  onMarkers,
}: Props & {
  bridge: RefObject<LabelBridge>;
  onMarkers: (markers: Marker[]) => void;
}) {
  const [data, setData] = useState<MapData | null>(null),
    [level, setLevel] = useState(0);
  const controls = useRef<MapControlsImpl>(null),
    { camera, invalidate, size, setDpr } = useThree();
  const target = useRef(new THREE.Vector3()),
    fly = useRef<{
      p: THREE.Vector3;
      t: THREE.Vector3;
      schoolId?: string;
    } | null>(null),
    first = useRef(true),
    selectedInitialized = useRef(false),
    restoredView = useRef(false),
    viewInitialized = useRef(false);
  const focusCallbacks = useRef({ onFocusComplete, onFocusCancel });
  useLayoutEffect(() => {
    focusCallbacks.current = { onFocusComplete, onFocusCancel };
  }, [onFocusComplete, onFocusCancel]);
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
    if (fly.current?.schoolId) focusCallbacks.current.onFocusCancel?.();
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
      if (restoredView.current && !focusCallbacks.current.onFocusComplete)
        return;
    }
    if (!selected?.position) {
      if (fly.current?.schoolId) fly.current = null;
      return;
    }
    const [x, z] = project(...selected.position),
      h = elevation(data.terrain, ...selected.position);
    fly.current = {
      schoolId: selected.id,
      p: new THREE.Vector3(x, 15 + h, z + 12),
      t: new THREE.Vector3(x, h, z),
    };
    invalidate();
  }, [selected, data, invalidate]);
  useFrame((_, dt) => {
    if (!fly.current || !controls.current) return;
    const v = fly.current,
      a = 1 - Math.exp(-Math.min(dt, 0.1) * 3.4);
    camera.position.lerp(v.p, a);
    controls.current.target.lerp(v.t, a);
    const arrived =
      camera.position.distanceTo(v.p) < 0.02 &&
      controls.current.target.distanceTo(v.t) < 0.02;
    if (arrived) {
      camera.position.copy(v.p);
      controls.current.target.copy(v.t);
      fly.current = null;
    }
    controls.current.update();
    invalidate();
    if (arrived && v.schoolId)
      focusCallbacks.current.onFocusComplete?.(v.schoolId);
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
            ? provinceRegion(u.province) || u.province
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
  useEffect(() => {
    onMarkers(markers);
  }, [markers, onMarkers]);
  useLayoutEffect(() => {
    bridge.current.connectWorld(invalidate, (marker) => {
      if (marker.items.length === 1) onSelect(marker.items[0]);
      else {
        if (fly.current?.schoolId) focusCallbacks.current.onFocusCancel?.();
        const [x, y, z] = marker.world;
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
    });
  }, [bridge, invalidate, onSelect, mobile, level]);
  // Project after camera movement, without scheduling a perpetual render loop.
  useFrame(() => bridge.current.update?.(camera, size.width, size.height));
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
          if (fly.current?.schoolId) focusCallbacks.current.onFocusCancel?.();
          fly.current = null;
        }}
        onChange={onChange}
      />
    </>
  );
}
export default function MapScene(props: Props) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const bridge = useRef<LabelBridge>(new LabelBridge());
  return (
    <div className="map-scene-world">
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
        <MapWorld {...props} bridge={bridge} onMarkers={setMarkers} />
      </Canvas>
      <MapLabels
        markers={markers}
        selectedId={props.selected?.id}
        bridge={bridge}
      />
    </div>
  );
}
