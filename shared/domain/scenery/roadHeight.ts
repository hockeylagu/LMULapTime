import { roadHeightBytes, type SceneryRoadHeight } from '../../packageContract/scenery.js';
import type { RoadHeightLookup } from '../../types/scenes/scenery.js';

const NO_TILE = 0xFFFFFFFF;
/** A gap between cells whose height change departs from its neighbours' by more than this is a step (a kerb edge), not a slope. */
const STEP_M = 0.1;

/**
 * Reads a layout's grid file (format in the package contract's `SceneryRoadHeight`): bilinear between the four surrounding cell
 * centres when all have data and none of the four gaps between them is a step, else the nearest of them with data (the wheel stays
 * on one side of a step), else null. A steep smooth bank changes by the same amount gap after gap, so it is no step. Allocation free:
 * it runs per wheel per sample.
 */
export function readRoadHeight(grid: SceneryRoadHeight, bytes: ArrayBuffer): RoadHeightLookup {
  const {cellM, tileCells: T, tilesX, tilesZ, tiles, heightOffsetM, heightStepM} = grid, [originX, originZ] = grid.originM;
  if (bytes.byteLength !== grid.byteLength || bytes.byteLength !== roadHeightBytes(grid)) throw Error(`Road height file: ${bytes.byteLength} bytes, the layout states ${grid.byteLength}`);
  const index = new Uint32Array(bytes, 0, tilesX * tilesZ), perTile = T * T;
  const heights = new Uint16Array(bytes, 4 * tilesX * tilesZ, tiles * perTile);
  const columns = tilesX * T, rows = tilesZ * T;
  const code = (i: number, j: number): number => {
    if (i < 0 || j < 0 || i >= columns || j >= rows) return 0;
    const tx = Math.floor(i / T), tz = Math.floor(j / T), k = index[tz * tilesX + tx];
    return k === NO_TILE ? 0 : heights[k * perTile + (j - tz * T) * T + (i - tx * T)];
  };
  const value = (c: number) => heightOffsetM + (c - 1) * heightStepM;
  /**
   * Whether the gap from cell (i, j) to (i + di, j + dj), both with data, is a step: its height change differs by more than STEP_M
   * from that of every gap in line beside it with data at both ends (the one before and the one after); with neither, whether the
   * change itself exceeds STEP_M.
   */
  const isStep = (i: number, j: number, di: number, dj: number): boolean => {
    const a = value(code(i, j)), b = value(code(i + di, j + dj)), change = b - a;
    const before = code(i - di, j - dj), after = code(i + 2 * di, j + 2 * dj);
    if (!before && !after) return Math.abs(change) > STEP_M;
    return (!before || Math.abs(change - (a - value(before))) > STEP_M) && (!after || Math.abs(change - (value(after) - b)) > STEP_M);
  };
  return (x, z) => {
    const fx = (x - originX) / cellM - 0.5, fz = (z - originZ) / cellM - 0.5;
    if (!Number.isFinite(fx) || !Number.isFinite(fz)) return null;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const c00 = code(i, j), c10 = code(i + 1, j), c01 = code(i, j + 1), c11 = code(i + 1, j + 1);
    if (c00 && c10 && c01 && c11 && !isStep(i, j, 1, 0) && !isStep(i, j + 1, 1, 0) && !isStep(i, j, 0, 1) && !isStep(i + 1, j, 0, 1)) {
      return value(c00) * (1 - u) * (1 - v) + value(c10) * u * (1 - v) + value(c01) * (1 - u) * v + value(c11) * u * v;
    }
    // The nearest corner with data: the largest bilinear weight.
    let best = 0, weight = -1;
    if (c00 && (1 - u) * (1 - v) > weight) { best = c00; weight = (1 - u) * (1 - v); }
    if (c10 && u * (1 - v) > weight) { best = c10; weight = u * (1 - v); }
    if (c01 && (1 - u) * v > weight) { best = c01; weight = (1 - u) * v; }
    if (c11 && u * v > weight) best = c11;
    return best ? value(best) : null;
  };
}
