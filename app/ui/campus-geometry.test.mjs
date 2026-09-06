import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  chooseSafeSpawn,
  buildingBounds,
  insideCampus,
  featureIdAtFace,
  readCollisionData,
  makeCollisionMesh,
  disposeCampusModel,
} from './campus-geometry.ts';

const square = (min, max) => [
  [min, min],
  [max, min],
  [max, max],
  [min, max],
];

test('building bounds isolate indexed feature faces and transformed roof height', () => {
  const model = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 2, 0, 0, 0, 10, 2, 10, 0, 10, 12, 0, 10, 10, 80, 12],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  const mesh = new THREE.Mesh(geometry);
  mesh.userData.featureRanges = [
    { start: 0, end: 1, id: 'hall' },
    { start: 1, end: 2, id: 'other' },
  ];
  model.add(mesh);
  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 0, 2], 3),
  );
  const roof = new THREE.Mesh(roofGeometry);
  roof.name = 'roof-hall';
  roof.position.y = 13;
  model.add(roof);
  model.position.set(20, 5, -10);
  assert.deepEqual(buildingBounds(model, 'hall').min.toArray(), [20, 5, -10]);
  assert.deepEqual(buildingBounds(model, 'hall').max.toArray(), [22, 18, -8]);
  assert.equal(buildingBounds(model, 'missing'), null);
  geometry.dispose();
  roofGeometry.dispose();
});

test('merged building and roof clicks resolve exact triangle ranges', () => {
  const mesh = new THREE.Mesh();
  mesh.name = 'buildings';
  mesh.userData.featureRanges = [
    { start: 0, end: 12, id: 'hall' },
    { start: 12, end: 24, id: 'library' },
  ];
  assert.equal(featureIdAtFace(mesh, 11), 'hall');
  assert.equal(featureIdAtFace(mesh, 12), 'library');
  assert.equal(featureIdAtFace(mesh, 24), null);
  assert.equal(featureIdAtFace(mesh, null), null);
});

test('safe spawn rejects boundary, building interiors, and campus holes', () => {
  const data = {
    rings: [square(-20, 20)],
    polygons: [[square(-20, 20), square(-3, 3)]],
    footprints: [
      {
        id: 'building',
        polygon: [
          [6, -5],
          [12, -5],
          [12, 5],
          [6, 5],
        ],
        height: 10,
      },
    ],
    walkways: [
      [
        [19.5, -2],
        [19.5, 2],
      ],
      [
        [-1, 0],
        [1, 0],
      ],
      [
        [7, 0],
        [11, 0],
      ],
      [
        [-12, 0],
        [-8, 0],
      ],
    ],
  };
  assert.deepEqual(chooseSafeSpawn(data, [0, 0]), [-10, 1.1, 0]);
  assert.equal(insideCampus([0, 0], data), false);
  assert.equal(insideCampus([-10, 0], data), true);
  assert.equal(chooseSafeSpawn({ ...data, walkways: [] }, [0, 0]), null);
});

test('a genuine building courtyard stays walkable', () => {
  const data = {
    rings: [square(-20, 20)],
    footprints: [
      {
        id: 'courtyard',
        polygon: square(-10, 10),
        holes: [square(-5, 5)],
        height: 10,
      },
    ],
    walkways: [
      [
        [-2, 0],
        [2, 0],
      ],
    ],
  };
  assert.deepEqual(chooseSafeSpawn(data, [0, 0]), [0, 1.1, 0]);
});

test('malformed collision assets fail clearly', () => {
  assert.throws(() =>
    readCollisionData({ rings: [], footprints: [], walkways: [] }),
  );
  assert.throws(() =>
    readCollisionData({
      rings: [square(-20, 20)],
      footprints: [],
      walkways: [[[NaN, 0]]],
    }),
  );
});

test('collision geometry applies model transforms and excludes environment decoration', () => {
  const model = new THREE.Group();
  const building = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
  building.name = 'buildings';
  building.position.set(10, 2, 0);
  const ornament = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100));
  ornament.name = 'environment';
  model.add(building, ornament);
  const mesh = makeCollisionMesh(model);
  assert.ok(mesh);
  assert.equal(mesh.indices.length, 36);
  const x = Array.from(mesh.vertices).filter((_, index) => index % 3 === 0);
  assert.equal(Math.min(...x), 9);
  assert.equal(Math.max(...x), 11);
  disposeCampusModel(model);
});

test('Rapier capsule walks on ground, stops at a wall and resets to safety', async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(50, 0.1, 50).setTranslation(0, -0.1, 0),
    ground,
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1, 5, 10).setTranslation(5, 5, 0),
    ground,
  );
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.1, 0),
  );
  const capsule = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.55, 0.3),
    body,
  );
  const controller = world.createCharacterController(0.025);
  controller.enableSnapToGround(0.4);
  controller.enableAutostep(0.3, 0.2, false);
  let velocity = 0;
  for (let frame = 0; frame < 240; frame++) {
    velocity = Math.max(-25, velocity - 9.81 / 60);
    controller.computeColliderMovement(
      capsule,
      { x: 4 / 60, y: velocity / 60, z: 0 },
      undefined,
      undefined,
      (other) => other.handle !== capsule.handle,
    );
    const movement = controller.computedMovement();
    const position = body.translation();
    body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
    if (controller.computedGrounded()) velocity = 0;
    world.step();
  }
  const position = body.translation();
  assert.ok(position.x > 3.5 && position.x < 3.71, `wall stop x=${position.x}`);
  assert.ok(
    position.y > 0.8 && position.y < 1,
    `ground contact y=${position.y}`,
  );
  body.setTranslation({ x: 0, y: 1.1, z: 0 }, true);
  body.setNextKinematicTranslation({ x: 0, y: 1.1, z: 0 });
  world.step();
  assert.equal(body.translation().x, 0);
  world.removeCharacterController(controller);
  world.free();
});

test('the Tsinghua GLB collider stops a walker before a real imported building wall', async () => {
  const { readFile } = await import('node:fs/promises');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const raw = await readFile(
    new URL('../../public/models/10003.glb', import.meta.url),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    '',
  );
  const collision = makeCollisionMesh(scene);
  const data = readCollisionData(
    JSON.parse(
      await readFile(
        new URL('../../public/data/10003-collision.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const spawn = chooseSafeSpawn(data, [0, 0]);
  assert.ok(collision);
  assert.ok(spawn);
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(collision.vertices, collision.indices),
      ground,
    );
    world.step();
    const origin = { x: spawn[0], y: spawn[1], z: spawn[2] };
    const walls = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([x, z]) => {
        const hit = world.castRay(
          new RAPIER.Ray(origin, { x, y: 0, z }),
          200,
          true,
        );
        return hit ? { x, z, distance: hit.timeOfImpact } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
    const wall = walls[0];
    assert.ok(wall, 'a building is reachable within 200m of the safe spawn');
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...spawn),
    );
    const capsule = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.55, 0.3),
      body,
    );
    const controller = world.createCharacterController(0.025);
    controller.enableSnapToGround(0.4);
    controller.enableAutostep(0.3, 0.2, false);
    let velocity = 0;
    for (
      let frame = 0;
      frame < Math.ceil(((wall.distance + 5) / 4) * 60);
      frame++
    ) {
      velocity = Math.max(-25, velocity - 9.81 / 60);
      controller.computeColliderMovement(
        capsule,
        { x: (wall.x * 4) / 60, y: velocity / 60, z: (wall.z * 4) / 60 },
        undefined,
        undefined,
        (other) => other.handle !== capsule.handle,
      );
      const movement = controller.computedMovement();
      const position = body.translation();
      body.setNextKinematicTranslation({
        x: position.x + movement.x,
        y: position.y + movement.y,
        z: position.z + movement.z,
      });
      if (controller.computedGrounded()) velocity = 0;
      world.step();
    }
    const finish = body.translation();
    const progress =
      (finish.x - spawn[0]) * wall.x + (finish.z - spawn[2]) * wall.z;
    assert.ok(
      progress < wall.distance && progress > wall.distance - 2,
      `progress ${progress}, wall ${wall.distance}`,
    );
    assert.ok(finish.y > 0.7 && finish.y < 1.2, `ground height ${finish.y}`);
  } finally {
    world.free();
    disposeCampusModel(scene);
  }
});
