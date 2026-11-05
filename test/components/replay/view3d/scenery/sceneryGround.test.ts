import { expect, it, vi } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createSceneryGround } from '../../../../../src/components/replay/view3d/scenery/sceneryGround.js';

vi.mock('three-mesh-bvh/worker', async () => {
  const {MeshBVH} = await import('three-mesh-bvh');
  return {GenerateMeshBVHWorker: class {async generate(geometry: BufferGeometry) { return new MeshBVH(geometry, {indirect: true}); } dispose() {}}};
});

it('uses BVH terrain intersections to bring an obstructed camera above banking and leaves clear views alone', async () => {
  const sheet = (values: number[]) => {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
    const root = new Group(), mesh = new Mesh(geometry, new MeshBasicMaterial()); mesh.name = 'road__OPAQUE'; root.add(mesh);
    return root;
  };
  // A banking rising from 10 m to 16 m over x 0..10, nothing past its top edge (native z 0..100).
  const banking = sheet([0, 10, 0, 10, 16, 0, 10, 16, 100, 0, 10, 0, 10, 16, 100, 0, 10, 100]), origin = new Vector3();
  // Car at the bottom, eye 5 m past the top and below it: the top edge three quarters of the way out blocks the view.
  const collision = createSceneryGround();
  try {
    await collision.add('bank', banking);
    const eye = new Vector3(15, 14, -50), corrected = collision.resolve(eye, new Vector3(1, 10.6, -50), origin, new Vector3());
    expect(corrected.x).toBeLessThan(eye.x);
    expect(corrected.y).toBeGreaterThanOrEqual(10 + corrected.x * 0.6 + 1.2 - 1e-6);
    collision.remove('bank');
    const flat = sheet([0, 0, 0, 100, 0, 0, 100, 0, 100, 0, 0, 0, 100, 0, 100, 0, 0, 100]);
    await collision.add('flat', flat);
    const clear = new Vector3(60, 1.5, -50);
    expect(collision.resolve(clear, new Vector3(40, 0.5, -50), origin, new Vector3())).toEqual(clear);
  } finally { collision.dispose(); }
});

it('keeps the eye above resident ground, preserves native handedness, and releases unloaded collision geometry', async () => {
  const root = new Group(), road = new Mesh(new BoxGeometry(20, 1, 20), new MeshBasicMaterial());
  road.name = 'terrain__OPAQUE'; road.position.set(100, 4.5, 200); root.add(road);
  const original = road.geometry.getAttribute('position').array.slice();
  const collision = createSceneryGround(), origin = new Vector3(100, 2, 200), eye = new Vector3(0, 0, 0), look = new Vector3(0, 3.5, -3);
  try {
    await collision.add('road', root);
    expect(collision.resolve(eye, look, origin, new Vector3()).y).toBeCloseTo(4.2);
    expect(road.geometry.getAttribute('position').array).toEqual(original);
    collision.remove('road');
    expect(collision.resolve(eye, look, origin, new Vector3())).toEqual(eye);
  } finally { collision.dispose(); }
});

const triangle = (name: string, values: number[], index?: number[]) => {
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
  if (index) geometry.setIndex(index);
  const mesh = new Mesh(geometry, new MeshBasicMaterial()); mesh.name = name;
  return mesh;
};

it('answers the highest opaque surface in reach, picking the right bridge layer and ignoring the filler ground', async () => {
  const root = new Group();
  root.add(
    triangle('road__OPAQUE', [0, 1, 0, 10, 2, 0, 0, 1, 10], [0, 1, 2]), triangle('bridge__OPAQUE', [0, 6, 0, 10, 7, 0, 0, 6, 10], [0, 1, 2]),
    triangle('FILLER_GROUND__OPAQUE', [-50, 3, -50, 50, 3, -50, -50, 3, 50], [0, 1, 2]), triangle('decal__BLEND', [0, 1.6, 0, 10, 1.6, 0, 0, 1.6, 10], [0, 1, 2]),
  );
  const ground = createSceneryGround();
  try {
    expect(ground.surfaceHeight({x: 5, y: 1.82, z: 1})).toBeNull(); // Nothing resident yet.
    await ground.add('chunk', root);
    expect(ground.surfaceHeight({x: 5, y: 1.82, z: 1})).toBeCloseTo(1.5);
    expect(ground.surfaceHeight({x: 5, y: 6.82, z: 1})).toBeCloseTo(6.5);
    expect(ground.surfaceHeight({x: 100, y: 1.32, z: 1})).toBeNull();
    expect(ground.surfaceHeight({x: 5, y: 4, z: 1})).toBeNull();
    expect(ground.surfaceHeight({x: NaN, y: 0, z: 0})).toBeNull();
    expect(ground.surfaceHeight({x: 5, y: 4, z: 1}, 5)).toBeCloseTo(1.5); // A wider reach finds the road far below.
    ground.remove('chunk');
    expect(ground.surfaceHeight({x: 5, y: 1.82, z: 1})).toBeNull();
  } finally { ground.dispose(); }
});

it('applies native transforms to large terrain triangles', async () => {
  const root = new Group(); root.position.y = 2;
  root.add(triangle('terrain__OPAQUE', [-1000, 0, -1000, 1000, 0, -1000, 0, 0, 1000], [0, 1, 2]));
  const ground = createSceneryGround();
  try {
    await ground.add('terrain', root);
    expect(ground.surfaceHeight({x: 0, y: 2.32, z: 0})).toBeCloseTo(2);
    expect(ground.surfaceHeight({x: 32, y: 2.32, z: 0})).toBeCloseTo(2);
  } finally { ground.dispose(); }
});

it('builds chunks concurrently and ignores a removal from a load the chunk no longer belongs to', async () => {
  const chunk = (y: number) => { const root = new Group(); root.add(triangle('road__OPAQUE', [0, y, 0, 10, y, 0, 0, y, 10], [0, 1, 2])); return root; };
  const ground = createSceneryGround(), stale = chunk(1), current = chunk(2), other = chunk(5);
  try {
    const first = ground.add('a', stale);
    await Promise.all([ground.add('a', current), ground.add('b', other), expect(first).rejects.toThrow('removed')]);
    ground.remove('a', stale); // The replaced load's cleanup must not drop the newer tree.
    expect(ground.surfaceHeight({x: 1, y: 2.1, z: 1})).toBeCloseTo(2);
    expect(ground.surfaceHeight({x: 1, y: 5.1, z: 1})).toBeCloseTo(5);
    ground.remove('a', current);
    expect(ground.surfaceHeight({x: 1, y: 2.1, z: 1})).toBeNull();
  } finally { ground.dispose(); }
});
