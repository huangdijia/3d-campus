import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { project, elevation, inside } from '../app/ui/geo.ts';

// Offline equivalent of the previous TerrainModel: no source simplification,
// new heights, border correction, or changes to the existing display projection.
// Run with Node >=22.13: node scripts/build-national-map.mjs [--check]
// --check computes in memory and verifies committed assets without writing.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const inputFiles = [
  'public/data/china.geojson',
  'public/data/provinces.geojson',
  'public/data/terrain.json',
  'app/ui/geo.ts',
  'scripts/build-national-map.mjs',
];
const inputs = await Promise.all(
  inputFiles.map(async (file) => ({
    file,
    bytes: await fs.readFile(path.join(root, file)),
  })),
);
const [china, provinces, terrain] = inputs
  .slice(0, 3)
  .map(({ bytes }) => JSON.parse(bytes));
assert.notEqual(terrain.available, false, 'Real terrain must be available');
assert.equal(terrain.elevations.length, terrain.width * terrain.height);
assert(terrain.elevations.every(Number.isFinite), 'Nonfinite terrain data');
const rings = china.features.flatMap((feature) =>
  feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates.map((polygon) => polygon[0])
    : [feature.geometry.coordinates[0]],
);
const provinceLines = provinces.features.flatMap((feature) =>
  feature.geometry.type === 'MultiLineString'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates],
);
const scene = new THREE.Group();
scene.name = 'national-map';
scene.userData = {
  boundariesVerified: false,
  projection: 'atlas-local, see app/ui/geo.ts',
};

const baseParts = rings.map((ring) => {
  const shape = new THREE.Shape(
    ring.map(([lng, lat]) => {
      const [x, z] = project(lng, lat);
      return new THREE.Vector2(x, -z);
    }),
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.42,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  // Untextured material needs no UVs; remove groups to preserve one primitive.
  geometry.deleteAttribute('uv');
  geometry.clearGroups();
  return geometry;
});
const mergedBaseGeometry = mergeGeometries(baseParts, false);
assert(mergedBaseGeometry, 'Base geometries could not be merged');
// Exact Float32 bit equality keeps seams and all original normal directions.
// Unlike tolerance-based welding this cannot move even a tiny boundary point.
const baseGeometry = new THREE.BufferGeometry();
const baseAttributes = Object.keys(mergedBaseGeometry.attributes);
const baseBits = Object.fromEntries(
  baseAttributes.map((name) => {
    const values = mergedBaseGeometry.getAttribute(name).array;
    return [
      name,
      new Uint32Array(values.buffer, values.byteOffset, values.length),
    ];
  }),
);
const baseUnique = new Map(),
  baseValues = Object.fromEntries(baseAttributes.map((name) => [name, []])),
  baseIndices = [];
for (let i = 0; i < mergedBaseGeometry.getAttribute('position').count; i++) {
  const key = baseAttributes
    .flatMap((name) => Array.from(baseBits[name].subarray(i * 3, i * 3 + 3)))
    .join(',');
  if (!baseUnique.has(key)) {
    baseUnique.set(key, baseUnique.size);
    for (const name of baseAttributes) {
      const attr = mergedBaseGeometry.getAttribute(name);
      baseValues[name].push(attr.getX(i), attr.getY(i), attr.getZ(i));
    }
  }
  baseIndices.push(baseUnique.get(key));
}
for (const [name, values] of Object.entries(baseValues))
  baseGeometry.setAttribute(name, new THREE.Float32BufferAttribute(values, 3));
baseGeometry.setIndex(baseIndices);
// Compare every original triangle corner after exact welding.
for (const name of baseAttributes) {
  const original = mergedBaseGeometry.getAttribute(name),
    welded = baseGeometry.getAttribute(name);
  for (let i = 0; i < baseIndices.length; i++) {
    assert.equal(welded.getX(baseIndices[i]), original.getX(i));
    assert.equal(welded.getY(baseIndices[i]), original.getY(i));
    assert.equal(welded.getZ(baseIndices[i]), original.getZ(i));
  }
}
mergedBaseGeometry.dispose();
const base = new THREE.Mesh(
  baseGeometry,
  new THREE.MeshStandardMaterial({ color: '#91b6a5', roughness: 0.86 }),
);
base.name = 'national-base';
scene.add(base);
baseParts.forEach((geometry) => geometry.dispose());

const positions = [],
  colors = [],
  indices = [],
  color = new THREE.Color();
for (let y = 0; y < terrain.height; y++) {
  for (let x = 0; x < terrain.width; x++) {
    const lng = terrain.west + x * terrain.step;
    const lat = terrain.south + y * terrain.step;
    const [px, pz] = project(lng, lat),
      h = elevation(terrain, lng, lat);
    positions.push(px, h, pz);
    color.set(h > 2.4 ? '#b6c5b3' : h > 1.3 ? '#b4cdbc' : '#bad6c5');
    color.multiplyScalar(0.93 + Math.min(h, 4) * 0.025);
    colors.push(color.r, color.g, color.b);
  }
}
for (let y = 0; y < terrain.height - 1; y++) {
  for (let x = 0; x < terrain.width - 1; x++) {
    const lng = terrain.west + (x + 0.5) * terrain.step;
    const lat = terrain.south + (y + 0.5) * terrain.step;
    if (!rings.some((ring) => inside([lng, lat], ring))) continue;
    const a = y * terrain.width + x,
      b = a + 1,
      c = a + terrain.width,
      d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
}
const fullGeometry = new THREE.BufferGeometry();
fullGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(positions, 3),
);
fullGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
fullGeometry.setIndex(indices);
fullGeometry.computeVertexNormals();
// Remove vertices that are never referenced by a retained triangle. Existing
// positions, colors, normals and triangle order are copied without resampling.
const remap = new Map(),
  compact = { position: [], color: [], normal: [] },
  compactIndices = [];
for (const index of indices) {
  if (!remap.has(index)) {
    remap.set(index, remap.size);
    for (const name of Object.keys(compact)) {
      const attribute = fullGeometry.getAttribute(name);
      compact[name].push(
        attribute.getX(index),
        attribute.getY(index),
        attribute.getZ(index),
      );
    }
  }
  compactIndices.push(remap.get(index));
}
const terrainGeometry = new THREE.BufferGeometry();
for (const [name, values] of Object.entries(compact))
  terrainGeometry.setAttribute(
    name,
    new THREE.Float32BufferAttribute(values, 3),
  );
terrainGeometry.setIndex(compactIndices);
const relief = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    side: THREE.DoubleSide,
  }),
);
relief.name = 'national-terrain';
scene.add(relief);
fullGeometry.dispose();

function addLines(name, lines, heightOffset, color, opacity, pixelWidth) {
  const values = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      for (const [lng, lat] of [line[i - 1], line[i]]) {
        const [x, z] = project(lng, lat);
        values.push(x, elevation(terrain, lng, lat) + heightOffset, z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(values, 3),
  );
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.name = name;
  object.userData = {
    pixelWidth,
    heightOffset,
    segmentCount: values.length / 6,
    originalPolylineCount: lines.length,
  };
  scene.add(object);
  return object;
}
addLines('national-outline', rings, 0.075, '#7eac9a', 0.55, 0.6);
addLines('province-outline', provinceLines, 0.06, '#819f92', 0.3, 0.4);
scene.updateMatrixWorld(true);
for (const object of scene.children) {
  object.geometry.computeBoundingBox();
  object.geometry.computeBoundingSphere();
}
const exported = await new GLTFExporter().parseAsync(scene, {
  binary: true,
  onlyVisible: false,
});
assert(exported instanceof ArrayBuffer);
const bytes = Buffer.from(exported);
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(8), bytes.length);
const gltf = JSON.parse(
  bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim(),
);
assert.equal(gltf.meshes.length, 4);
assert.equal(
  gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
  4,
);
assert.deepEqual(
  gltf.meshes.map((mesh) => mesh.primitives[0].mode),
  [4, 4, 1, 1],
);
// Verify actual loader behavior, not just exported file existence.
const loaded = await new GLTFLoader().parseAsync(exported, '');
for (const original of scene.children) {
  const restored = loaded.scene.getObjectByName(original.name);
  assert(restored, `Missing node ${original.name}`);
  const names = original.isLineSegments
    ? ['position']
    : ['position', ...(original === relief ? ['color'] : [])];
  for (const name of names) {
    assert.deepEqual(
      restored.geometry.getAttribute(name).array,
      original.geometry.getAttribute(name).array,
      `${original.name}: changed ${name}`,
    );
  }
  if (original.isLineSegments) {
    assert(restored.isLineSegments, `Expected LineSegments: ${original.name}`);
    assert.equal(restored.userData.pixelWidth, original.userData.pixelWidth);
  }
  if (original.geometry.index)
    assert.deepEqual(
      restored.geometry.index.array,
      original.geometry.index.array,
    );
  if (original.material.isMeshStandardMaterial)
    assert.equal(restored.material.roughness, original.material.roughness);
  assert.equal(restored.material.opacity, original.material.opacity);
  assert.deepEqual(
    restored.material.color.toArray(),
    original.material.color.toArray(),
  );
}
const nodeStats = scene.children.map((object) => ({
  name: object.name,
  primitive: object.isLineSegments ? 'LINES' : 'TRIANGLES',
  vertices: object.geometry.getAttribute('position').count,
  triangles: object.isMesh
    ? (object.geometry.index?.count ??
        object.geometry.getAttribute('position').count) / 3
    : 0,
  segments: object.isLineSegments
    ? object.geometry.getAttribute('position').count / 2
    : 0,
  drawCalls: 1,
  ...(object.isLineSegments
    ? {
        pixelWidth: object.userData.pixelWidth,
        opacity: object.material.opacity,
      }
    : {}),
}));
const manifest = {
  schemaVersion: 1,
  modelUrl: '/models/national-map.glb',
  modelSha256: hash(bytes),
  modelBytes: bytes.length,
  generator: 'scripts/build-national-map.mjs',
  sources: inputs.map(({ file, bytes }) => ({
    file,
    sha256: hash(bytes),
    bytes: bytes.length,
  })),
  sourceTerrainSamples: terrain.elevations.length,
  retainedTerrainVertices: remap.size,
  discardedUnreferencedTerrainVertices: terrain.elevations.length - remap.size,
  triangles: nodeStats.reduce((sum, node) => sum + node.triangles, 0),
  lineSegments: nodeStats.reduce((sum, node) => sum + node.segments, 0),
  drawCalls: 4,
  previousDrawCalls: rings.length * 2 + provinceLines.length + 1,
  nodes: nodeStats,
  boundariesVerified: false,
  sourceAttribution: terrain.attribution,
  processing:
    'Same projection, nearest-grid elevation, colors, cell-centre boundary selection and base extrusion as original TerrainModel. No geographic simplification. Bases merged and exact Float32-identical vertices welded; unreferenced terrain vertices discarded; each outline type merged to LineSegments.',
  lineWidthNote:
    'glTF LINES does not encode screen-space fractional pixel width. Standard LineSegments renders at the platform line width (normally 1px), a documented difference from original 0.6/0.4px. Node extras.pixelWidth retains original values if a later renderer uses LineSegments2.',
  validation: {
    glbHeader: true,
    primitiveCount: 4,
    loaderRoundtrip: true,
    positionsUnchanged: true,
    vertexColorsUnchanged: true,
    materialColorsAndOpacityUnchanged: true,
  },
};
const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(
    hash(await fs.readFile(path.join(root, 'public/models/national-map.glb'))),
    manifest.modelSha256,
    'Generated model differs from saved asset',
  );
  assert.equal(
    await fs.readFile(path.join(root, 'public/data/national-map.json'), 'utf8'),
    manifestBytes,
    'Generated manifest differs from saved manifest',
  );
} else {
  await fs.mkdir(path.join(root, 'public/models'), { recursive: true });
  await fs.writeFile(path.join(root, 'public/models/national-map.glb'), bytes);
  await fs.writeFile(
    path.join(root, 'public/data/national-map.json'),
    manifestBytes,
  );
}
console.log(
  JSON.stringify(
    {
      ...manifest,
      sources: undefined,
      processing: undefined,
      lineWidthNote: undefined,
    },
    null,
    2,
  ),
);
scene.traverse((object) => {
  object.geometry?.dispose();
  object.material?.dispose();
});
loaded.scene.traverse((object) => {
  object.geometry?.dispose();
  object.material?.dispose();
});
