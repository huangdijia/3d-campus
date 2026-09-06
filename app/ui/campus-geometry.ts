import * as THREE from 'three';

export type GroundPoint = [number, number];
export type CollisionData = {
  footprints: {
    id: string;
    polygon: GroundPoint[];
    holes?: GroundPoint[][];
    height: number;
  }[];
  walkways: GroundPoint[][];
  rings: GroundPoint[][];
  polygons?: GroundPoint[][][];
};

type FeatureRange = { start: number; end: number; id: string };

export function featureIdAtFace(
  object: THREE.Object3D,
  faceIndex: number | undefined | null,
): string | null {
  const ranges: unknown = object.userData.featureRanges;
  if (Array.isArray(ranges) && faceIndex != null) {
    const range = (ranges as FeatureRange[]).find(
      (item) => faceIndex >= item.start && faceIndex < item.end,
    );
    return range?.id ?? null;
  }
  return /^(building|roof)-/.test(object.name)
    ? object.name.replace(/^(building|roof)-/, '')
    : null;
}

export function buildingBounds(
  model: THREE.Object3D,
  id: string,
): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    const indices = object.geometry.getIndex();
    const faceCount = Math.floor((indices?.count ?? position.count) / 3);
    const ranges: unknown = object.userData.featureRanges;
    const matching = Array.isArray(ranges)
      ? (ranges as FeatureRange[]).filter((range) => range.id === id)
      : featureIdAtFace(object, null) === id
        ? [{ start: 0, end: faceCount, id }]
        : [];
    for (const range of matching) {
      const start = Math.max(0, range.start) * 3;
      const end = Math.min(faceCount, range.end) * 3;
      for (let index = start; index < end; index++) {
        point.fromBufferAttribute(position, indices?.getX(index) ?? index);
        point.applyMatrix4(object.matrixWorld);
        bounds.expandByPoint(point);
      }
    }
  });
  return bounds.isEmpty() ? null : bounds;
}

export function insideRing(point: GroundPoint, ring: GroundPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToRing(point: GroundPoint, ring: GroundPoint[]): number {
  let distance = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared
      ? THREE.MathUtils.clamp(
          ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared,
          0,
          1,
        )
      : 0;
    distance = Math.min(
      distance,
      Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz),
    );
  }
  return distance;
}

export function insideCampus(point: GroundPoint, data: CollisionData): boolean {
  if (data.polygons?.length) {
    return data.polygons.some(
      ([outer, ...holes]) =>
        insideRing(point, outer) &&
        !holes.some((hole) => insideRing(point, hole)),
    );
  }
  return data.rings.some((ring) => insideRing(point, ring));
}

export function chooseSafeSpawn(
  data: CollisionData,
  center: GroundPoint,
): [number, number, number] | null {
  const candidates = data.walkways
    .filter((line) => line.length >= 2)
    .flatMap((line) =>
      line
        .slice(1)
        .map(
          (point, index): GroundPoint => [
            (point[0] + line[index][0]) / 2,
            (point[1] + line[index][1]) / 2,
          ],
        ),
    )
    .sort(
      (a, b) =>
        Math.hypot(a[0] - center[0], a[1] - center[1]) -
        Math.hypot(b[0] - center[0], b[1] - center[1]),
    );
  // A road midpoint is usable only inside the ground and outside all buildings.
  // Never assume the first imported road is a safe starting location.
  const point = candidates.find(
    (candidate) =>
      insideCampus(candidate, data) &&
      (data.polygons?.flat() ?? data.rings).every(
        (ring) => distanceToRing(candidate, ring) > 1,
      ) &&
      data.footprints.every(
        ({ polygon, holes = [] }) =>
          (!insideRing(candidate, polygon) ||
            holes.some((hole) => insideRing(candidate, hole))) &&
          [polygon, ...holes].every(
            (ring) => distanceToRing(candidate, ring) > 1,
          ),
      ),
  );
  return point ? [point[0], 1.1, point[1]] : null;
}

export function readCollisionData(value: unknown): CollisionData {
  const finitePoint = (point: unknown): point is GroundPoint =>
    Array.isArray(point) &&
    point.length === 2 &&
    point.every(
      (number) => typeof number === 'number' && Number.isFinite(number),
    );
  const line = (points: unknown): points is GroundPoint[] =>
    Array.isArray(points) && points.every(finitePoint);
  if (!value || typeof value !== 'object')
    throw Error('Invalid collision data');
  const data = value as Partial<CollisionData>;
  if (
    !Array.isArray(data.rings) ||
    !data.rings.length ||
    !data.rings.every((ring) => line(ring) && ring.length >= 3) ||
    (data.polygons !== undefined &&
      (!Array.isArray(data.polygons) ||
        !data.polygons.every(
          (polygon) =>
            Array.isArray(polygon) &&
            polygon.length > 0 &&
            polygon.every((ring) => line(ring) && ring.length >= 3),
        ))) ||
    !Array.isArray(data.walkways) ||
    !data.walkways.every(line) ||
    !Array.isArray(data.footprints) ||
    !data.footprints.every(
      (footprint) =>
        footprint &&
        typeof footprint.id === 'string' &&
        line(footprint.polygon) &&
        footprint.polygon.length >= 3 &&
        (footprint.holes === undefined ||
          (Array.isArray(footprint.holes) &&
            footprint.holes.every((hole) => line(hole) && hole.length >= 3))) &&
        Number.isFinite(footprint.height),
    )
  ) {
    throw Error('Incomplete collision data');
  }
  return data as CollisionData;
}

export function hasCampusGeometry(model: THREE.Group): boolean {
  let found = false;
  model.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      (object.name.startsWith('building') || object.name === 'campus-ground') &&
      object.geometry.attributes.position?.count >= 3
    )
      found = true;
  });
  return found;
}

export function makeCollisionMesh(model: THREE.Group) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const vertex = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      (!object.name.startsWith('building') &&
        !object.name.startsWith('roof') &&
        object.name !== 'campus-ground')
    ) {
      return;
    }
    const geometry = object.geometry;
    const positions = geometry.attributes.position;
    const offset = vertices.length / 3;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      vertices.push(vertex.x, vertex.y, vertex.z);
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) {
        indices.push(offset + geometry.index.getX(i));
      }
    } else {
      for (let i = 0; i < positions.count; i++) indices.push(offset + i);
    }
  });
  return vertices.length
    ? {
        vertices: new Float32Array(vertices),
        indices: new Uint32Array(indices),
      }
    : null;
}

export function disposeCampusModel(model: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const entries = Array.isArray(object.material)
      ? object.material
      : [object.material];
    entries.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value: unknown) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => {
    texture.dispose();
    const source: unknown = texture.source.data;
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
      source.close();
    }
  });
}
