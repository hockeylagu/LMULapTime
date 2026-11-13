import { expect, it } from 'vitest';
import { roadHeightBytes, type SceneryRoadHeight } from '../../../shared/packageContract/scenery.js';
import { readRoadHeight } from '../../../shared/domain/scenery/roadHeight.js';

const STEP = 0.001;
/** A 2 x 1 tile grid of 8-cell tiles at 1 m cells from (10, 20); tile (1, 0) absent. `height(i, j)` in metres, null for no data. */
function grid(height: (i: number, j: number) => number | null) {
  const row: SceneryRoadHeight = {sha256: 'a'.repeat(64), byteLength: 0, cellM: 1, tileCells: 8, originM: [10, 20], tilesX: 2, tilesZ: 1, tiles: 1, heightOffsetM: 5, heightStepM: STEP, corridorM: 5};
  row.byteLength = roadHeightBytes(row);
  const bytes = new ArrayBuffer(row.byteLength), view = new DataView(bytes);
  view.setUint32(0, 0, true); view.setUint32(4, 0xFFFFFFFF, true);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const metres = height(i, j);
    view.setUint16(8 + (j * 8 + i) * 2, metres === null ? 0 : Math.round((metres - 5) / STEP) + 1, true);
  }
  return readRoadHeight(row, bytes);
}

it('interpolates a smooth surface between cell centres', () => {
  const lookup = grid((i, j) => 6 + 0.01 * i + 0.02 * j);
  // Cell (2, 3) has its centre at (12.5, 23.5): halfway to (3, 4) reads the mean of the four corners.
  expect(lookup(12.5, 23.5)).toBeCloseTo(6.08, 5);
  expect(lookup(13, 24)).toBeCloseTo(6 + 0.01 * 2.5 + 0.02 * 3.5, 5);
});

it('interpolates a steep bank whose cells rise by the same amount gap after gap', () => {
  const lookup = grid(i => 6 + 0.2 * i); // 0.2 m a cell: over the step limit, but no gap departs from its neighbours
  expect(lookup(13.9, 24)).toBeCloseTo(6 + 0.2 * 3.4, 5);
});

it('takes the nearest corner across a step instead of a slope up it', () => {
  const lookup = grid(i => (i < 4 ? 6 : 6.3));
  expect(lookup(13.9, 24)).toBeCloseTo(6, 5); // 0.4 of the way from cell 3 to cell 4: cell 3's side.
  expect(lookup(14.1, 24)).toBeCloseTo(6.3, 5);
});

it('reads the nearest corner with data at a hole, and no road off the grid or in an absent tile', () => {
  const lookup = grid((i, j) => (i === 3 && j === 3 ? null : 6));
  expect(lookup(13.4, 23.4)).toBeCloseTo(6, 5);
  expect(lookup(5, 20)).toBeNull();
  expect(lookup(22, 24)).toBeNull(); // tile (1, 0) is not stored
  expect(lookup(Number.NaN, 24)).toBeNull();
  expect(grid(() => null)(14, 24)).toBeNull();
});

it('rejects a file of another size than its row states', () => {
  const row: SceneryRoadHeight = {sha256: 'a'.repeat(64), byteLength: 4 + 128 + 8, cellM: 1, tileCells: 8, originM: [0, 0], tilesX: 1, tilesZ: 1, tiles: 1, heightOffsetM: 0, heightStepM: STEP, corridorM: 5};
  expect(() => readRoadHeight(row, new ArrayBuffer(100))).toThrow('100 bytes');
});
