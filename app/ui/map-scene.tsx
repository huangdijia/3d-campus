'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls, Html, Line } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import type { University } from '../data/types';
import { project, elevation, inside, type Terrain, type MapView } from './geo';
type AreaFeature = {
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
};
type BorderFeature = {
  geometry:
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'MultiLineString'; coordinates: number[][][] };
};
type TerrainData = Terrain & { available?: boolean };
type MapData = {
  features: AreaFeature[];
  terrain: Terrain;
  provinces: BorderFeature[];
};
async function loadData<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw Error(url);
  return r.json() as Promise<T>;
}
const flatTerrain: Terrain = {
  west: 72,
  south: 18,
  step: 1,
  width: 66,
  height: 37,
  elevations: Array(66 * 37).fill(0),
};
type Props = {
  universities: University[];
  selected: University | null;
  onSelect: (u: University) => void;
  viewRef: RefObject<MapView | null>;
  reset: number;
  onError: () => void;
};
const initial: MapView = { position: [0, 75, 63], target: [0, 0, 1] };
function TerrainModel({ features, terrain, provinces }: MapData) {
  const rings = useMemo(
    () =>
      features.flatMap((f) =>
        f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates.map((p) => p[0])
          : [f.geometry.coordinates[0]],
      ),
    [features],
  );
  const bases = useMemo(
    () =>
      rings.map((ring: number[][]) => {
        const shape = new THREE.Shape(
          ring.map(([lng, lat]) => {
            const [x, z] = project(lng, lat);
            return new THREE.Vector2(x, -z);
          }),
        );
        const g = new THREE.ExtrudeGeometry(shape, {
          depth: 0.42,
          bevelEnabled: false,
        });
        g.rotateX(-Math.PI / 2);
        return g;
      }),
    [rings],
  );
  const geo = useMemo(() => {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      color = new THREE.Color();
    for (let y = 0; y < terrain.height; y++)
      for (let x = 0; x < terrain.width; x++) {
        const lng = terrain.west + x * terrain.step,
          lat = terrain.south + y * terrain.step;
        const [px, pz] = project(lng, lat),
          h = elevation(terrain, lng, lat);
        positions.push(px, h, pz);
        color.set(h > 2.4 ? '#b6c5b3' : h > 1.3 ? '#b4cdbc' : '#bad6c5');
        color.multiplyScalar(0.93 + Math.min(h, 4) * 0.025);
        colors.push(color.r, color.g, color.b);
      }
    for (let y = 0; y < terrain.height - 1; y++)
      for (let x = 0; x < terrain.width - 1; x++) {
        const lng = terrain.west + (x + 0.5) * terrain.step,
          lat = terrain.south + (y + 0.5) * terrain.step;
        if (!rings.some((r: number[][]) => inside([lng, lat], r))) continue;
        const a = y * terrain.width + x,
          b = a + 1,
          c = a + terrain.width,
          d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [rings, terrain]);
  useEffect(
    () => () => {
      geo.dispose();
      bases.forEach((g) => g.dispose());
    },
    [geo, bases],
  );
  return (
    <group>
      {bases.map((g, i) => (
        <mesh geometry={g} key={i}>
          <meshStandardMaterial color="#91b6a5" roughness={0.86} />
        </mesh>
      ))}
      <mesh geometry={geo}>
        <meshStandardMaterial
          vertexColors
          roughness={0.93}
          side={THREE.DoubleSide}
        />
      </mesh>
      {rings.map((r: number[][], i: number) => (
        <Line
          key={i}
          points={r.map(([lng, lat]) => {
            const [x, z] = project(lng, lat);
            return [x, elevation(terrain, lng, lat) + 0.075, z];
          })}
          color="#7eac9a"
          lineWidth={0.6}
          transparent
          opacity={0.55}
        />
      ))}
      {provinces.map((f, i) => {
        const lines =
          f.geometry.type === 'MultiLineString'
            ? f.geometry.coordinates
            : [f.geometry.coordinates];
        return lines.map((r: number[][], j: number) => (
          <Line
            key={`${i}-${j}`}
            points={r.map(([lng, lat]) => {
              const [x, z] = project(lng, lat);
              return [x, elevation(terrain, lng, lat) + 0.06, z];
            })}
            color="#819f92"
            lineWidth={0.4}
            transparent
            opacity={0.3}
          />
        ));
      })}
    </group>
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
  const [data, setData] = useState<MapData | null>(null);
  const controls = useRef<MapControlsImpl>(null),
    { camera } = useThree(),
    [level, setLevel] = useState(0);
  const target = useRef(new THREE.Vector3()),
    fly = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null),
    first = useRef(true);
  useEffect(() => {
    let active = true;
    Promise.all([
      loadData<{ features: AreaFeature[] }>('/data/china.geojson'),
      loadData<TerrainData>('/data/terrain.json').catch(
        () => flatTerrain as TerrainData,
      ),
      loadData<{ features: BorderFeature[] }>('/data/provinces.geojson').catch(
        () => ({ features: [] }),
      ),
    ])
      .then(
        ([china, terrain, province]) =>
          active &&
          setData({
            features: china.features,
            terrain:
              terrain.available === false
                ? {
                    west: 72,
                    south: 18,
                    step: 1,
                    width: 66,
                    height: 37,
                    elevations: Array(66 * 37).fill(0),
                  }
                : terrain,
            provinces: province.features,
          }),
      )
      .catch(() => active && onError());
    return () => {
      active = false;
    };
  }, [onError]);
  const restoredView = useRef(false);
  useEffect(() => {
    if (!controls.current) return;
    restoredView.current = Boolean(viewRef.current);
    const v = viewRef.current || initial;
    camera.position.set(...v.position);
    controls.current.target.set(...v.target);
    controls.current.update();
  }, [camera, viewRef]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fly.current = {
      p: new THREE.Vector3(...initial.position),
      t: new THREE.Vector3(...initial.target),
    };
  }, [reset]);
  const selectedInitialized = useRef(false);

  useEffect(() => {
    if (!data) return;
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
  }, [selected, data]);
  useFrame((_, dt) => {
    if (fly.current && controls.current) {
      const v = fly.current;
      const a = 1 - Math.exp(-dt * 3.4);
      camera.position.lerp(v.p, a);
      controls.current.target.lerp(v.t, a);
      if (camera.position.distanceTo(v.p) < 0.02) fly.current = null;
      controls.current.update();
    }
  });
  const markerData = useMemo(() => {
    const valid = universities.filter((u) => u.position);
    if (level >= 2)
      return valid.map((u) => ({
        key: u.id,
        name: u.name,
        items: [u],
        position: u.position!,
      }));
    const groups = new Map<string, University[]>();
    valid.forEach((u) => {
      const key = level === 0 ? u.province : u.city;
      groups.set(key, [...(groups.get(key) || []), u]);
    });
    return [...groups.entries()].map(([key, items]) => ({
      key,
      name: key,
      items,
      position: [
        items.reduce((v, u) => v + u.position![0], 0) / items.length,
        items.reduce((v, u) => v + u.position![1], 0) / items.length,
      ] as [number, number],
    }));
  }, [universities, level]);
  const onChange = () => {
    if (!controls.current) return;
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
      <fog attach="fog" args={['#e8f1f4', 100, 210]} />
      {data && <TerrainModel {...data} />}
      {data &&
        markerData.map((m) => {
          const [x, z] = project(...m.position),
            h = elevation(data.terrain, ...m.position),
            active = m.items.some((u) => u.id === selected?.id);
          return (
            <group key={m.key} position={[x, h + 0.22, z]}>
              <mesh position={[0, 0.35, 0]}>
                <cylinderGeometry args={[0.11, 0.16, 0.7, 8]} />
                <meshStandardMaterial
                  color={active ? '#007aff' : '#598e87'}
                  emissive={active ? '#007aff' : '#609a91'}
                  emissiveIntensity={0.5}
                />
              </mesh>
              <Html
                position={[0, 1.1, 0]}
                center
                distanceFactor={level === 2 ? 24 : 85}
                zIndexRange={[15, 5]}
              >
                <button
                  className={`map-pin ${active ? 'active' : ''}`}
                  aria-label={
                    m.items.length > 1
                      ? `${m.name} ${m.items.length} 所高校`
                      : m.name
                  }
                  onClick={() => {
                    if (m.items.length === 1) onSelect(m.items[0]);
                    else {
                      fly.current = {
                        p: new THREE.Vector3(x, 14 + h, z + 12),
                        t: new THREE.Vector3(x, h, z),
                      };
                    }
                  }}
                >
                  <span>{m.name}</span>
                  {m.items.length > 1 && <b>{m.items.length}</b>}
                </button>
              </Html>
            </group>
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
        maxDistance={180}
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
      camera={{
        position: initial.position,
        fov: 47,
        near: 0.1,
        far: 500,
      }}
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
