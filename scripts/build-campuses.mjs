import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import polygonClipping from 'polygon-clipping';
// Three's exporter targets browsers; this shim only reads the exporter-owned Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = `data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;
      this.onloadend?.();
    });
  }
};
const root = process.cwd(),
  input = path.join(root, 'data/sources/campuses');
const universities = JSON.parse(
  await fs.readFile('app/data/universities.json', 'utf8'),
);
const selectedIds = process.argv
  .find((arg) => arg.startsWith('--ids='))
  ?.slice(6)
  .split(',');
const previousManifest = selectedIds
  ? JSON.parse(await fs.readFile('public/data/asset-manifest.json', 'utf8'))
  : [];
const manifests = previousManifest.filter(
  (entry) => !selectedIds.includes(entry.campusId.split('/')[0]),
);
async function writeAtomic(file, content) {
  await fs.writeFile(`${file}.tmp`, content);
  await fs.rename(`${file}.tmp`, file);
}
const inside = (p, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
};
const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
function ringsOf(e, role = 'outer') {
  if (e.geometry) {
    const r = e.geometry.map((p) => [p.lon, p.lat]);
    return role === 'outer' && r.length >= 4 && equal(r[0], r.at(-1))
      ? [r]
      : [];
  }
  const parts = (e.members || [])
    .filter((m) => (m.role || 'outer') === role && m.geometry?.length)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const rings = [];
  while (parts.length) {
    const ring = parts.shift();
    let changed = true;
    while (changed && !equal(ring[0], ring.at(-1))) {
      changed = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (equal(ring.at(-1), p[0])) ring.push(...p.slice(1));
        else if (equal(ring.at(-1), p.at(-1)))
          ring.push(...p.slice(0, -1).reverse());
        else if (equal(ring[0], p.at(-1))) ring.unshift(...p.slice(0, -1));
        else if (equal(ring[0], p[0])) ring.unshift(...p.slice(1).reverse());
        else continue;
        parts.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (ring.length >= 4 && equal(ring[0], ring.at(-1))) rings.push(ring);
    else throw Error(`Unclosed ${role} ring in ${e.type}/${e.id}`);
  }
  return rings;
}
function polygonsOf(e) {
  const outer = ringsOf(e),
    holes = ringsOf(e, 'inner');
  return outer.map((r) => [r, ...holes.filter((h) => inside(h[0], r))]);
}
// Split lines at all boundary intersections, retaining only the interior portions.
function clipSegment(a, b, polygons) {
  const ts = [0, 1],
    r = [b[0] - a[0], b[1] - a[1]],
    cross = (p, q) => p[0] * q[1] - p[1] * q[0];
  for (const poly of polygons)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1],
          d = ring[i],
          s = [d[0] - c[0], d[1] - c[1]],
          den = cross(r, s);
        if (Math.abs(den) < 1e-12) continue;
        const ca = [c[0] - a[0], c[1] - a[1]],
          t = cross(ca, s) / den,
          u = cross(ca, r) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
  ts.sort((x, y) => x - y);
  const point = (t) => [a[0] + r[0] * t, a[1] + r[1] * t],
    result = [];
  for (let i = 1; i < ts.length; i++) {
    const mid = point((ts[i - 1] + ts[i]) / 2);
    if (
      polygons.some(
        (p) => inside(mid, p[0]) && !p.slice(1).some((h) => inside(mid, h)),
      )
    )
      result.push([point(ts[i - 1]), point(ts[i])]);
  }
  return result;
}
function material(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}
// The roof mesh owns the top surface. Keeping ExtrudeGeometry's top cap as well
// creates a second layer only centimetres away, which flickers at bird's-eye depth.
// Keep walls and the bottom intact; never change the source-derived height.
function withoutTopCap(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const normal = flat.getAttribute('normal');
  const position = flat.getAttribute('position');
  flat.computeBoundingBox();
  const top = flat.boundingBox.max.y;
  const retained = [];
  for (let i = 0; i < normal.count; i += 3) {
    if (
      (normal.getY(i) > 0.999 &&
        normal.getY(i + 1) > 0.999 &&
        normal.getY(i + 2) > 0.999) ||
      // Very thin/degenerate triangulation can produce a zero normal. Its
      // vertices still lie on the top plane, so remove that cap as well.
      (Math.abs(position.getY(i) - top) < 0.0001 &&
        Math.abs(position.getY(i + 1) - top) < 0.0001 &&
        Math.abs(position.getY(i + 2) - top) < 0.0001)
    )
      continue;
    retained.push(i, i + 1, i + 2);
  }
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(flat.attributes)) {
    const data = new attribute.array.constructor(
      retained.length * attribute.itemSize,
    );
    retained.forEach((vertex, offset) => {
      for (let component = 0; component < attribute.itemSize; component++)
        data[offset * attribute.itemSize + component] =
          attribute.array[vertex * attribute.itemSize + component];
    });
    result.setAttribute(
      name,
      new THREE.BufferAttribute(data, attribute.itemSize, attribute.normalized),
    );
  }
  result.userData.removedTopCapTriangles = (normal.count - retained.length) / 3;
  if (flat !== geometry) flat.dispose();
  geometry.dispose();
  return result;
}
if (process.argv.includes('--self-test')) {
  const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    hole = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ];
  assert.deepEqual(clipSegment([-2, 5], [12, 5], [[outer, hole]]), [
    [
      [0, 5],
      [4, 5],
    ],
    [
      [6, 5],
      [10, 5],
    ],
  ]);
  assert.equal(
    polygonsOf({
      type: 'way',
      id: 1,
      geometry: [
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 1, lat: 1 },
      ],
    }).length,
    0,
  );
  const clipped = polygonClipping.intersection(
    [[outer, hole]],
    [
      [
        [
          [2, 2],
          [8, 2],
          [8, 8],
          [2, 8],
          [2, 2],
        ],
      ],
    ],
  );
  assert.equal(clipped.length, 1);
  assert.equal(clipped[0].length, 2);
  const box = new THREE.ExtrudeGeometry(
    new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(2, 0),
      new THREE.Vector2(2, 2),
      new THREE.Vector2(0, 2),
    ]),
    { depth: 7, bevelEnabled: false },
  );
  box.rotateX(-Math.PI / 2);
  const wallsAndBottom = withoutTopCap(box);
  const normals = wallsAndBottom.getAttribute('normal');
  assert.equal(normals.count / 3, 10);
  for (let i = 0; i < normals.count; i++) assert(normals.getY(i) < 0.999);
  wallsAndBottom.computeBoundingBox();
  assert.equal(wallsAndBottom.boundingBox.max.y, 7);
  assert.equal(wallsAndBottom.boundingBox.min.y, 0);
  wallsAndBottom.dispose();
  console.log(
    'Geometry self-test passed: boundary clipping, holes, closed polygons, and roof-cap removal without height change.',
  );
  process.exit(0);
}
const mats = {
  ground: material('#78896a'),
  building: material('#e3ddcc'),
  roof: material('#9b7767'),
  road: material('#c5bb9f'),
  water: material('#65b0b5'),
  grass: material('#7c9e70'),
  pitch: material('#83a47c'),
};
const exporter = new GLTFExporter();
for (const f of (await fs.readdir(input)).filter((f) => f.endsWith('.json'))) {
  const id = f.slice(0, -5),
    u = universities.find((u) => u.id === id);
  if (!u) continue;
  if (selectedIds && !selectedIds.includes(id)) continue;
  u.campusId = null;
  try {
    const raw = JSON.parse(await fs.readFile(path.join(input, f), 'utf8'));
    const polygons = polygonsOf(raw.boundary.elements[0]),
      rings = polygons.map((p) => p[0]);
    if (!rings.length) throw Error('No closed outer ring');
    const all = rings.flat(),
      west = Math.min(...all.map((p) => p[0])),
      east = Math.max(...all.map((p) => p[0])),
      south = Math.min(...all.map((p) => p[1])),
      north = Math.max(...all.map((p) => p[1]));
    const origin = [(west + east) / 2, (south + north) / 2];
    const project = ([lng, lat]) => [
      (lng - origin[0]) * 111320 * Math.cos((origin[1] * Math.PI) / 180),
      -(lat - origin[1]) * 110540,
    ];
    const group = new THREE.Group();
    group.name = `campus-${id}`;
    const pois = [],
      footprints = [],
      walkways = [];
    const counts = { buildings: 0, roads: 0, water: 0, green: 0 };
    const geometryStats = { removedTopCapTriangles: 0, triangles: 0 };
    const localPolygons = polygons.map((p) => p.map((r) => r.map(project))),
      localRings = localPolygons.map((p) => p[0]);
    function surface(points, height, mat, name, base = 0, holes = []) {
      if (points.length < 3) return;
      const shape = new THREE.Shape(
        points.map((p) => new THREE.Vector2(p[0], -p[1])),
      );
      shape.holes = holes.map(
        (r) => new THREE.Path(r.map((p) => new THREE.Vector2(p[0], -p[1]))),
      );
      let geo =
        height > 0
          ? new THREE.ExtrudeGeometry(shape, {
              depth: height,
              bevelEnabled: false,
            })
          : new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      if (height > 0) {
        geo = withoutTopCap(geo);
        geometryStats.removedTopCapTriangles +=
          geo.userData.removedTopCapTriangles;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = base;
      mesh.name = name;
      group.add(mesh);
      return mesh;
    }
    for (const p of localPolygons)
      surface(p[0], 0, mats.ground, 'campus-ground', 0, p.slice(1));
    const features = raw.geometry.elements;
    const geometryIssues = [];
    const relationMembers = new Set(
      features
        .filter((e) => e.type === 'relation' && e.tags?.type === 'multipolygon')
        .flatMap((e) =>
          (e.members || []).filter((m) => m.type === 'way').map((m) => m.ref),
        ),
    );
    for (const e of features) {
      if (e.type === 'way' && relationMembers.has(e.id)) continue;
      const t = e.tags || {},
        coords = (
          e.geometry ||
          e.members?.flatMap((m) => m.geometry || []) ||
          []
        ).map((p) => [p.lon, p.lat]);
      if (coords.length < 2) continue;
      const featureId = e.type === 'relation' ? `r${e.id}` : String(e.id);
      const center = [
        coords.reduce((v, p) => v + p[0], 0) / coords.length,
        coords.reduce((v, p) => v + p[1], 0) / coords.length,
      ];
      if (t.highway) {
        let included = false;
        for (let i = 1; i < coords.length; i++)
          for (const [p, q] of clipSegment(
            project(coords[i - 1]),
            project(coords[i]),
            localPolygons,
          )) {
            const dx = q[0] - p[0],
              dz = q[1] - p[1],
              len = Math.hypot(dx, dz);
            if (len < 0.5) continue;
            const w = ['footway', 'path', 'steps'].includes(t.highway)
              ? 2.6
              : ['service', 'pedestrian', 'cycleway'].includes(t.highway)
                ? 5
                : 8;
            const nx = ((-dz / len) * w) / 2,
              nz = ((dx / len) * w) / 2,
              road = [
                [p[0] + nx, p[1] + nz],
                [q[0] + nx, q[1] + nz],
                [q[0] - nx, q[1] - nz],
                [p[0] - nx, p[1] - nz],
                [p[0] + nx, p[1] + nz],
              ];
            for (const poly of polygonClipping.intersection(
              [road],
              localPolygons,
            ))
              surface(poly[0], 0, mats.road, 'road', 0.12, poly.slice(1));
            walkways.push([p, q]);
            included = true;
          }
        if (included) counts.roads++;
        continue;
      }
      let sourcePolygons;
      try {
        sourcePolygons = polygonsOf(e);
      } catch (error) {
        geometryIssues.push({
          sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
          issue: error.message,
        });
        continue;
      }
      if (!sourcePolygons.length) continue;
      const clipped = polygonClipping.intersection(
        sourcePolygons.map((p) => p.map((r) => r.map(project))),
        localPolygons,
      );
      if (!clipped.length) continue;
      if (t.building && t.building !== 'no') {
        const hRaw = parseFloat(t.height),
          levels = parseFloat(t['building:levels']);
        const estimated = !Number.isFinite(hRaw);
        const h = Number.isFinite(hRaw)
          ? Math.max(2, Math.min(120, hRaw))
          : Number.isFinite(levels)
            ? Math.max(3, Math.min(120, levels * 3.3))
            : 12;
        for (const p of clipped) {
          surface(
            p[0],
            h,
            mats.building,
            `building-${featureId}`,
            0.2,
            p.slice(1),
          );
          // Flat roof follows source footprint; no invented facade or architectural style.
          surface(p[0], 0, mats.roof, `roof-${featureId}`, h + 0.2, p.slice(1));
          footprints.push({
            id: featureId,
            polygon: p[0],
            holes: p.slice(1),
            height: h,
            estimated,
          });
        }
        counts.buildings++;
        const n = t['name:zh'] || t.name;
        if (n) {
          let c = project(center);
          if (
            !clipped.some(
              (p) => inside(c, p[0]) && !p.slice(1).some((h) => inside(c, h)),
            )
          )
            c = clipped[0][0][0];
          pois.push({
            id: featureId,
            name: n,
            position: [c[0], h + 3, c[1]],
            description: `OpenStreetMap 标注建筑。建筑轮廓来自公开地理数据；${estimated ? '高度为估算值。' : '高度采用数据源标注。'}建筑介绍与现状待学校资料核验。`,
            sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
            verified: false,
          });
        }
      } else if (t.natural === 'water' || t.water) {
        for (const p of clipped)
          surface(p[0], 0, mats.water, `water-${e.id}`, 0.17, p.slice(1));
        counts.water++;
      } else if (
        ['grass', 'meadow', 'forest', 'recreation_ground'].includes(
          t.landuse,
        ) ||
        ['park', 'garden', 'pitch', 'track'].includes(t.leisure)
      ) {
        for (const p of clipped)
          surface(
            p[0],
            0,
            t.leisure === 'pitch' ? mats.pitch : mats.grass,
            `green-${e.id}`,
            0.16,
            p.slice(1),
          );
        counts.green++;
      }
    }
    if (counts.buildings < 3)
      throw Error(
        `Insufficient source geometry: ${counts.buildings} buildings`,
      );
    const source = {
      url: raw.source,
      title: 'OpenStreetMap contributors',
      license: 'ODbL-1.0',
      checkedAt: '2026-09-06',
    };
    // One draw call per material; preserve source building IDs through triangle ranges.
    group.updateMatrixWorld(true);
    const buckets = new Map();
    // Removal happens after collecting the meshes to avoid skipping children.
    const children = group.children.slice();
    for (const child of children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const key = child.material.uuid;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          material: child.material,
          geometries: [],
          ranges: [],
          faces: 0,
          name: child.name.startsWith('building-')
            ? 'buildings'
            : child.name.startsWith('roof-')
              ? 'roofs'
              : child.name === 'campus-ground'
                ? 'campus-ground'
                : 'environment',
        };
        buckets.set(key, bucket);
      }
      let g = child.geometry.clone().applyMatrix4(child.matrixWorld);
      if (g.index) {
        const flat = g.toNonIndexed();
        g.dispose();
        g = flat;
      }
      const faces = g.attributes.position.count / 3;
      bucket.ranges.push({
        start: bucket.faces,
        end: bucket.faces + faces,
        id: child.name.replace(/^(building|roof)-/, ''),
      });
      bucket.faces += faces;
      bucket.geometries.push(g);
      group.remove(child);
      child.geometry.dispose();
    }
    for (const b of buckets.values()) {
      geometryStats.triangles += b.faces;
      const geometry = mergeGeometries(b.geometries, false);
      b.geometries.forEach((g) => g.dispose());
      if (!geometry) throw Error('Geometry merge failed');
      const mesh = new THREE.Mesh(geometry, b.material);
      mesh.name = b.name;
      mesh.userData.featureRanges = b.ranges;
      group.add(mesh);
    }
    const binary = await exporter.parseAsync(group, {
      binary: true,
      onlyVisible: true,
    });
    const bytes = Buffer.from(binary);
    await writeAtomic(`public/models/${id}.glb`, bytes);
    const preferred = [
      '二校门',
      '清华学堂',
      '大礼堂',
      '图书馆',
      '科学馆',
      '主楼',
      '体育馆',
      '博雅塔',
      '百周年纪念讲堂',
    ];
    pois.sort((a, b) => {
      const score = (n) =>
        preferred.reduce((s, p, i) => s + (n.includes(p) ? 100 - i : 0), 0);
      return score(b.name) - score(a.name);
    });
    const local = all.map(project),
      bounds = [
        Math.min(...local.map((p) => p[0])),
        Math.min(...local.map((p) => p[1])),
        Math.max(...local.map((p) => p[0])),
        Math.max(...local.map((p) => p[1])),
      ];
    // Camera tour only. A verified pedestrian route is a distinct missing deliverable.
    const tourPois = pois.slice(0, 8);
    const campus = {
      id: 'main',
      universityId: id,
      name: u.campusName || u.name,
      origin,
      crs: 'EPSG:4326',
      modelUrl: `/models/${id}.glb`,
      bounds,
      pois,
      tours:
        tourPois.length > 1
          ? [
              {
                id: 'overview',
                name: '建筑鸟瞰',
                poiIds: tourPois.map((p) => p.id),
                path: tourPois.map((p) => [p.position[0], 150, p.position[2]]),
                verified: false,
              },
            ]
          : [],
      sources: [
        source,
        ...u.sources.filter((s) => !s.url.includes('openstreetmap.org')),
      ],
      status: 'draft',
      geometryIssues,
      counts,
    };
    await writeAtomic(`public/data/${id}.json`, JSON.stringify(campus));
    await writeAtomic(
      `public/data/${id}-collision.json`,
      JSON.stringify({
        footprints,
        walkways,
        rings: localRings,
        polygons: localPolygons,
      }),
    );
    u.campusId = 'main';
    u.position = origin;
    manifests.push({
      campusId: `${id}/main`,
      modelUrl: campus.modelUrl,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      geometrySource: source,
      estimatedHeights: true,
      boundaryVerified: false,
      layoutVerified: false,
      detailedLandmarks: 0,
      releaseReady: false,
      geometryStats,
      geometryIssues,
      counts,
      bytes: bytes.length,
    });
    console.log(
      id,
      counts.buildings,
      'buildings',
      pois.length,
      'candidate POIs',
      Math.round(bytes.length / 1024) + ' KB',
    );
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  } catch (e) {
    console.error('SKIP', id, e.message);
  }
}
await writeAtomic(
  'app/data/universities.json',
  JSON.stringify(universities, null, 2),
);
await writeAtomic(
  'public/data/asset-manifest.json',
  JSON.stringify(manifests, null, 2),
);
console.log(
  'Built',
  manifests.length,
  'campus geometry previews; release-ready:',
  manifests.filter((x) => x.releaseReady).length,
);
