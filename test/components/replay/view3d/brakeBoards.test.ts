// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { makeBrakeBoards } from '../../../../src/components/replay/view3d/brakeBoards.js';
import type { LoadedBrakeBoardArtwork } from '../../../../src/api/scenes/brakeBoardArtworkApi.js';

afterEach(() => vi.restoreAllMocks());
const points = [{x: 0, y: .33, z: 0}, {x: 0, y: .33, z: 5}, {x: 0, y: .33, z: 10}];
const marker = {id: 'board-test', label: '100', center: [5, 5] as [number, number], stationM: 5, side: 'right' as const};
function artwork(): LoadedBrakeBoardArtwork {
  return {metadata: {layoutKey: 'monza_gp', sourceGeometryRevision: 'geometry-test', markerIds: ['board-test'], label: '100', revision: 'artwork-test', sha256: 'test', byteLength: 100, widthPx: 100, heightPx: 200, widthM: .8, heightM: 1.4, packageRevision: 'test'}, image: document.createElement('img')};
}

it('uses the marker-bound source image and measured panel size without mirroring the text', () => {
  const source = artwork(), root = makeBrakeBoards([marker], points, new Vector3(), () => 0, [source]);
  const board = root.children[0], face = board.children[1] as Mesh<PlaneGeometry, MeshStandardMaterial>;
  expect(face.material.map?.image).toBe(source.image);
  expect(face.geometry.parameters.width).toBe(.8); expect(face.geometry.parameters.height).toBe(1.4);
  expect(board.rotation.y).toBeCloseTo(0); expect(board.scale.x).toBe(1); expect(board.scale.z).toBe(1);
  expect(board.position.toArray()).toEqual([5, 0, -5]);
});

it('retains the label fallback when artwork belongs to a different marker or label', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  for (const source of [{...artwork(), metadata: {...artwork().metadata, markerIds: ['other']}}, {...artwork(), metadata: {...artwork().metadata, label: '200'}}]) {
    const root = makeBrakeBoards([marker], points, new Vector3(), () => 0, [source]);
    const face = root.children[0].children[1] as Mesh<PlaneGeometry, MeshStandardMaterial>;
    expect(face.material.map).toBeNull(); expect(face.geometry.parameters.width).toBe(.9);
  }
});

it('hangs a board at its measured game height on posts down to the ground, never below the default lift', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const centreY = (baseY: number) => (makeBrakeBoards([{...marker, baseY}], points, new Vector3(), () => 0).children[0].children[0] as Mesh).position.y;
  expect(centreY(4.5)).toBeCloseTo(4.5 + 1.6 / 2);
  expect(centreY(0.1)).toBeCloseTo(0.45 + 1.6 / 2);
});
