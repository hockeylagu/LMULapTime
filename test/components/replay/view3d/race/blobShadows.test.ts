import { Box3, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createBlobShadows } from '../../../../../src/components/replay/view3d/race/blobShadows.js';

describe('race blob shadows', () => {
  it('lays a contact shadow on the road under each car placed this frame, sized to its footprint, none before it compiles', async () => {
    const root = new Group();
    let compiled: (() => void) | undefined;
    const blobs = createBlobShadows(root, 4, () => new Promise<void>(resolve => { compiled = resolve; }));
    const car = new Matrix4().makeTranslation(10, 2, -5);
    // A car 2.4 m wide and 5 m long, its centre 0.3 m ahead of its origin.
    const footprint = new Box3(new Vector3(-1.2, -0.3, -2.2), new Vector3(1.2, 1, 2.8));
    // Nothing compiles until a car needs a shadow (a new shell has no environment to compile with yet).
    expect(compiled).toBeUndefined();
    blobs.begin(); blobs.place(car, -0.3, footprint); blobs.end();
    expect(root.children).toHaveLength(0);
    compiled!(); await Promise.resolve();
    const [mesh] = root.children as InstancedMesh[];
    blobs.begin(); blobs.place(car, -0.3, footprint); blobs.place(new Matrix4(), 0, footprint); blobs.end();
    expect([mesh.count, mesh.visible, mesh.castShadow, mesh.receiveShadow]).toEqual([2, true, false, false]);
    // In the car's frame, on its road height just above it, at its footprint's centre; the quad spans it and its spread.
    const at = new Vector3(), turn = new Quaternion(), size = new Vector3();
    new Matrix4().fromArray(mesh.instanceMatrix.array, 0).decompose(at, turn, size);
    expect(at.x).toBeCloseTo(10, 6); expect(at.y).toBeCloseTo(2 - 0.3 + 0.02, 6); expect(at.z).toBeCloseTo(-5 + 0.3, 6);
    mesh.geometry.computeBoundingBox();
    const quad = mesh.geometry.boundingBox!;
    expect((quad.max.x - quad.min.x) * size.x).toBeCloseTo(2.4 + 1, 6); expect((quad.max.z - quad.min.z) * size.z).toBeCloseTo(5 + 1, 6);
    // Flat on the road: the quad's normal is the car's up.
    expect(quad.max.y - quad.min.y).toBeCloseTo(0, 6);
    blobs.begin(); blobs.end();
    expect([mesh.count, mesh.visible]).toEqual([0, false]);
    blobs.dispose(); expect(root.children).toHaveLength(0);
  });
});
