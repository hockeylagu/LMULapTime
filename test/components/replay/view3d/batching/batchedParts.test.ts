import { BatchedMesh, BoxGeometry, Matrix4, MeshStandardMaterial, SphereGeometry, type BufferAttribute } from 'three';
import { expect, it } from 'vitest';
import { addHiddenInstance, computeBatchBounds, createBatch, createShownCounts, layoutOf, releaseBatchOnUpload } from '../../../../../src/components/replay/view3d/batching/batchedParts.js';

const BOX = {vertices: 24, indices: 36};
const made = (options = {}) => createBatch({draws: 2, ...BOX, material: new MeshStandardMaterial(), name: 'batch', castShadow: true, receiveShadow: false, ...options});

it('creates a batch with the options set and culling off per instance by default', () => {
  const material = new MeshStandardMaterial(), batch = made({material, name: 'asphalt'});
  expect(batch).toBeInstanceOf(BatchedMesh);
  expect([batch.material, batch.name, batch.castShadow, batch.receiveShadow]).toEqual([material, 'asphalt', true, false]);
  expect([batch.frustumCulled, batch.perObjectFrustumCulled, batch.sortObjects, batch.matrixAutoUpdate]).toEqual([true, false, false, true]);
  const own = made({frustumCulled: false, perObjectFrustumCulled: true, matrixAutoUpdate: false});
  expect([own.frustumCulled, own.perObjectFrustumCulled, own.matrixAutoUpdate]).toEqual([false, true, false]);
});

it('adds instances hidden, at the matrix when given', () => {
  const batch = made(), id = batch.addGeometry(new BoxGeometry());
  const placed = addHiddenInstance(batch, id, new Matrix4().makeTranslation(5, 0, 0)), plain = addHiddenInstance(batch, id);
  expect([batch.getVisibleAt(placed), batch.getVisibleAt(plain)]).toEqual([false, false]);
  expect(batch.getMatrixAt(placed, new Matrix4()).elements[12]).toBe(5);
});

it('tells layouts apart by their attributes', () => {
  expect(layoutOf(new BoxGeometry(1, 1, 1))).toBe(layoutOf(new BoxGeometry(2, 3, 4)));
  expect(layoutOf(new BoxGeometry())).not.toBe(layoutOf(new SphereGeometry(1).deleteAttribute('uv')));
});

it("releases a batch's arrays after its next upload, keeping its bounds", () => {
  const batch = made(), id = batch.addGeometry(new BoxGeometry());
  addHiddenInstance(batch, id, new Matrix4().makeTranslation(100, 0, 0));
  computeBatchBounds(batch);
  releaseBatchOnUpload(batch);
  const buffers = [batch.geometry.index!, ...Object.values(batch.geometry.attributes)] as BufferAttribute[];
  expect(buffers.every(buffer => buffer.array.length > 0)).toBe(true);
  buffers.forEach(buffer => buffer.onUploadCallback());
  expect(buffers.map(buffer => buffer.array.length)).toEqual(buffers.map(() => 0));
  expect(batch.geometry.boundingBox!.equals(batch.boundingBox!)).toBe(true);
  expect(batch.geometry.boundingSphere!.radius).toBeCloseTo(batch.boundingSphere!.radius);
});

it('counts the owners showing a batch and reports whether any does', () => {
  const batch = made(), seen: boolean[] = [], counts = createShownCounts((_, visible) => seen.push(visible));
  counts.change(batch, 1); counts.change(batch, 1); counts.change(batch, -1); counts.change(batch, -1);
  expect([seen, counts.of(batch)]).toEqual([[true, true, true, false], 0]);
  counts.change(batch, 1); counts.clear();
  expect(counts.of(batch)).toBe(0);
});
