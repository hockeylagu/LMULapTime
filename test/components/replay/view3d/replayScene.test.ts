import { expect, it, vi } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import {createCameraCollision} from '../../../../src/components/replay/view3d/scenery/cameraCollision.js';

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
  const collision = createCameraCollision();
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
  const collision = createCameraCollision(), origin = new Vector3(100, 2, 200), eye = new Vector3(0, 0, 0), look = new Vector3(0, 3.5, -3);
  try {
    await collision.add('road', root);
    expect(collision.resolve(eye, look, origin, new Vector3()).y).toBeCloseTo(4.2);
    expect(road.geometry.getAttribute('position').array).toEqual(original);
    collision.remove('road');
    expect(collision.resolve(eye, look, origin, new Vector3())).toEqual(eye);
  } finally { collision.dispose(); }
});
