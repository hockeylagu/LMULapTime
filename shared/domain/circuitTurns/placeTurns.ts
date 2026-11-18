import type { LayoutTurnList, TurnDirection, TurnLabelSource } from './turnLists.js';

/**
 * Places a layout's turns on its centre line (docs/plans/proposed/CORNER_INSIGHT.md, layer 1).
 *
 * The centre line's bends are found from its curvature; each bend is one lobe of curvature in one
 * direction, split where a long bend has two apexes. With an official list, the list decides which
 * bends are turns: its entries are matched to bends in driving order, a bend's direction must agree
 * with an entry that states one, an entry with a map position takes the bend nearest it, and the
 * others take the largest bends left between them (kinks are left over). An entry no bend fits, whose map position
 * lies between its neighbours' apexes, sits at that position: the map numbers a turn inside another's bend there.
 * Without a list, every bend of at least MIN_UNLISTED_TURN_DEG is a turn.
 * Segment boundaries sit midway between two turns' apexes, except across the start line, which is
 * a boundary itself so a segment never spans two laps.
 */

/** Sampling step along the centre line (metres). */
const STEP_M = 2;
/** Heading is taken over a chord of twice this (metres), smoothing the polyline's corners. */
const HEADING_HALF_CHORD_M = 5;
/** Curvature is averaged over twice this (metres). */
const SMOOTH_HALF_WINDOW_M = 10;
/** Below this curvature (1/m: a 600 m radius) the centre line counts as straight. */
const STRAIGHT_CURVATURE = 1 / 600;
/** A bend turning less than this is not a bend (degrees). */
const MIN_BEND_DEG = 8;
/** A long bend splits at a dip below this share of the smaller of its two apexes' curvature. */
const APEX_SPLIT_RATIO = 0.5;
/** A bend further than this from where the map puts a turn is not that turn (metres). */
const MAP_WINDOW_M = 250;
/** A bend at the map's position scores this, more than any bend's angle. */
const MAP_FIT_SCORE = 2000;
/** Score lost per metre away from the map's position: 20 m costs more than a 90° bend gains elsewhere. */
const MAP_DISTANCE_WEIGHT = 5;
/**
 * What an entry with a map position scores at that position, taking no bend: a bend further than about half
 * MAP_WINDOW_M scores less, so a flat kink the map numbers does not pull its neighbours onto the wrong bends.
 */
const MAP_POSITION_SCORE = MAP_FIT_SCORE - MAP_DISTANCE_WEIGHT * MAP_WINDOW_M / 2;
/** Without an official list, a bend turning less than this is a kink, not a turn (degrees). */
export const MIN_UNLISTED_TURN_DEG = 20;
/** Version of this rule; it is part of the corner passes' version key. */
export const TURN_PLACEMENT_VERSION = 1;

export interface CenterlineBend {
  /** Metres from the start line along the centre line. */
  apexM: number;
  direction: TurnDirection;
  /** How far the bend turns (degrees, positive). */
  angleDeg: number;
  /** Tightest radius (metres). */
  minRadiusM: number;
}

export interface PlacedTurn {
  /** Stable within a layout's list version: the turn's place in driving order, from 0. */
  id: number;
  number?: number;
  suffix?: string;
  numberSource?: TurnLabelSource;
  name?: string;
  direction: TurnDirection;
  apexM: number;
  /** The segment the turn times: [startM, endM) from the start line. */
  startM: number;
  endM: number;
  /** The bend's turning and tightest radius; absent for a turn placed at its map position, inside another's bend. */
  angleDeg?: number;
  minRadiusM?: number;
}

export interface TurnPlacement {
  lengthM: number;
  turns: PlacedTurn[];
  /** List entries no bend fits and no map position places (in list order); the list or the rule needs a fix. */
  unplaced: number[];
}

/** The centre line's bends, in driving order from the start line. */
export function findCenterlineBends(centerline: ReadonlyArray<readonly [number, number]>, startStationM = 0): { lengthM: number; bends: CenterlineBend[] } {
  const count = centerline.length;
  const cumulative = new Float64Array(count + 1);
  for (let i = 1; i <= count; i++) {
    const a = centerline[i - 1], b = centerline[i % count];
    cumulative[i] = cumulative[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const lengthM = cumulative[count];
  const samples = Math.floor(lengthM / STEP_M);
  if (count < 3 || samples < 8) return { lengthM, bends: [] };

  let segment = 0;
  const pointAt = (station: number): [number, number] => {
    const s = ((station % lengthM) + lengthM) % lengthM;
    if (s < cumulative[segment] || s >= cumulative[segment + 1]) {
      let lo = 0, hi = count;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cumulative[mid] <= s) lo = mid; else hi = mid; }
      segment = lo;
    }
    const a = centerline[segment], b = centerline[(segment + 1) % count];
    const f = (s - cumulative[segment]) / Math.max(1e-9, cumulative[segment + 1] - cumulative[segment]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };

  // Sample i sits at startStationM + i * STEP_M, so positions come out from the start line.
  const heading = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const at = startStationM + i * STEP_M;
    const p = pointAt(at - HEADING_HALF_CHORD_M), q = pointAt(at + HEADING_HALF_CHORD_M);
    heading[i] = Math.atan2(q[1] - p[1], q[0] - p[0]);
  }
  const raw = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    let d = heading[(i + 1) % samples] - heading[i];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    raw[i] = d / STEP_M;
  }
  const half = Math.round(SMOOTH_HALF_WINDOW_M / STEP_M);
  const curvature = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += raw[(i + k + samples) % samples];
    curvature[i] = sum / (2 * half + 1);
  }

  // Start the walk on a straight sample, so no bend is cut in two by the array's ends.
  const firstStraight = curvature.findIndex(value => Math.abs(value) < STRAIGHT_CURVATURE);
  if (firstStraight < 0) return { lengthM, bends: [] };
  const bends: CenterlineBend[] = [];
  for (let k = 0; k < samples; k++) {
    const i = (firstStraight + k) % samples;
    if (Math.abs(curvature[i]) < STRAIGHT_CURVATURE) continue;
    const sign = Math.sign(curvature[i]);
    const run: number[] = [];
    while (k < samples) {
      const j = (firstStraight + k) % samples;
      if (Math.abs(curvature[j]) < STRAIGHT_CURVATURE || Math.sign(curvature[j]) !== sign) break;
      run.push(j); k++;
    }
    k--;
    for (const lobe of splitAtApexes(run, curvature)) {
      let angle = 0, peak = 0;
      for (const j of lobe) {
        const value = Math.abs(curvature[j]);
        angle += value * STEP_M;
        peak = Math.max(peak, value);
      }
      const angleDeg = angle * 180 / Math.PI;
      if (angleDeg < MIN_BEND_DEG) continue;
      // The apex is where half the bend's turning is done: the corner's middle. The sharpest point is not used,
      // because a vertex of the centre line can make it sit near the bend's end.
      let turned = 0, apexAt = lobe[0];
      for (const j of lobe) {
        turned += Math.abs(curvature[j]) * STEP_M;
        if (turned >= angle / 2) { apexAt = j; break; }
      }
      // Heading grows counter-clockwise in the track's x/z frame, so a positive curvature turns left.
      bends.push({ apexM: apexAt * STEP_M, direction: sign > 0 ? 'left' : 'right', angleDeg, minRadiusM: 1 / peak });
    }
  }
  bends.sort((a, b) => a.apexM - b.apexM);
  return { lengthM, bends };
}

/** Splits one direction's run of curvature where it dips well below both neighbouring apexes. */
function splitAtApexes(run: number[], curvature: Float64Array): number[][] {
  const value = (index: number) => Math.abs(curvature[run[index]]);
  const peaks: number[] = [];
  for (let i = 0; i < run.length; i++) {
    const left = i > 0 ? value(i - 1) : -Infinity, right = i < run.length - 1 ? value(i + 1) : -Infinity;
    if (value(i) >= left && value(i) > right) peaks.push(i);
  }
  const cuts: number[] = [];
  let kept = peaks[0];
  for (let p = 1; p < peaks.length; p++) {
    let dip = kept;
    for (let i = kept; i <= peaks[p]; i++) if (value(i) < value(dip)) dip = i;
    if (value(dip) < APEX_SPLIT_RATIO * Math.min(value(kept), value(peaks[p]))) { cuts.push(dip); kept = peaks[p]; }
    else if (value(peaks[p]) > value(kept)) kept = peaks[p];
  }
  const lobes: number[][] = [];
  let from = 0;
  for (const cut of cuts) { lobes.push(run.slice(from, cut)); from = cut; }
  lobes.push(run.slice(from));
  return lobes.filter(lobe => lobe.length > 0);
}

/**
 * How well a bend fits a list entry: never when the directions disagree or the bend is further from
 * the map's position than MAP_WINDOW_M; nearer the map's position is better; without a position,
 * a larger bend is better.
 */
function entryScore(entry: LayoutTurnList['turns'][number], bend: CenterlineBend): number {
  if (entry.direction && entry.direction !== bend.direction) return -Infinity;
  if (entry.mapM === undefined) return bend.angleDeg;
  const away = Math.abs(bend.apexM - entry.mapM);
  // Between two bends about as near, the larger one is the turn a map labels.
  return away > MAP_WINDOW_M ? -Infinity : MAP_FIT_SCORE - MAP_DISTANCE_WEIGHT * away + bend.angleDeg / 2;
}

/** Matches the list's entries to bends in order, taking the largest bends; entries no bend fits stay unplaced. */
function matchList(list: LayoutTurnList, bends: CenterlineBend[]): { matched: Array<number | null> } {
  const entries = list.turns, n = entries.length, m = bends.length;
  // An entry without a map position takes a bend between its nearest neighbours' map positions.
  const bounds = entries.map((entry, index) => entry.mapM !== undefined ? null : {
    after: entries.slice(0, index).findLast(other => other.mapM !== undefined)?.mapM ?? -Infinity,
    before: entries.slice(index + 1).find(other => other.mapM !== undefined)?.mapM ?? Infinity,
  });
  const score = (i: number, bend: CenterlineBend) => {
    const bound = bounds[i];
    return bound && (bend.apexM <= bound.after || bend.apexM >= bound.before) ? -Infinity : entryScore(entries[i], bend);
  };
  // An entry without a map position left without a bend costs more than any bend can give, so as many as possible
  // take one; an entry with a map position may instead sit at that position (MAP_POSITION_SCORE).
  const UNPLACED = -1e6;
  const best = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(-Infinity));
  const step = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
  for (let j = 0; j <= m; j++) best[0][j] = 0;
  for (let i = 1; i <= n; i++) {
    const noBend = entries[i - 1].mapM === undefined ? UNPLACED : MAP_POSITION_SCORE;
    best[i][0] = best[i - 1][0] + noBend; step[i][0] = 2;
    for (let j = 1; j <= m; j++) {
      const skipBend = best[i][j - 1];
      const skipEntry = best[i - 1][j] + noBend;
      const take = best[i - 1][j - 1] + score(i - 1, bends[j - 1]);
      if (take >= skipBend && take >= skipEntry) { best[i][j] = take; step[i][j] = 1; }
      else if (skipBend >= skipEntry) { best[i][j] = skipBend; step[i][j] = 0; }
      else { best[i][j] = skipEntry; step[i][j] = 2; }
    }
  }
  const matched: Array<number | null> = new Array<number | null>(n).fill(null);
  for (let i = n, j = m; i > 0;) {
    if (step[i][j] === 1) { matched[i - 1] = j - 1; i--; j--; }
    else if (step[i][j] === 0 && j > 0) j--;
    else i--;
  }
  return { matched };
}

/** The layout's turns and their segments, from its official list when it has one. */
export function placeTurns(centerline: ReadonlyArray<readonly [number, number]>, list: LayoutTurnList | null, startStationM = 0): TurnPlacement {
  const { lengthM, bends } = findCenterlineBends(centerline, startStationM);
  const turns: Array<Omit<PlacedTurn, 'startM' | 'endM'>> = [];
  const unplaced: number[] = [];
  if (list) {
    const { matched } = matchList(list, bends);
    const apexes = matched.map(bendIndex => bendIndex === null ? null : bends[bendIndex].apexM);
    matched.forEach((bendIndex, entryIndex) => {
      const entry = list.turns[entryIndex];
      const label = { id: entryIndex, number: entry.number, suffix: entry.suffix, name: entry.name,
        numberSource: entry.number === undefined ? undefined : entry.numberSource ?? list.numberSource };
      if (bendIndex !== null) {
        const { apexM, direction, angleDeg, minRadiusM } = bends[bendIndex];
        turns.push({ ...label, direction, apexM, angleDeg, minRadiusM });
        return;
      }
      // A turn the map numbers inside another turn's bend (a steady arc after a hairpin has no curvature peak of its
      // own) sits at its map position, when that keeps the turns in driving order.
      const mapM = entry.mapM;
      const before = apexes.slice(0, entryIndex).findLast(apex => apex !== null) ?? 0;
      const after = apexes.slice(entryIndex + 1).find(apex => apex !== null) ?? lengthM;
      if (mapM === undefined || mapM <= before || mapM >= after || !bends.length) { unplaced.push(entryIndex); return; }
      const nearest = bends.reduce((a, b) => Math.abs(b.apexM - mapM) < Math.abs(a.apexM - mapM) ? b : a);
      apexes[entryIndex] = mapM;
      turns.push({ ...label, direction: entry.direction ?? nearest.direction, apexM: mapM });
    });
  } else {
    bends.filter(bend => bend.angleDeg >= MIN_UNLISTED_TURN_DEG).forEach((bend, index) => turns.push({ id: index, ...bend }));
  }
  return {
    lengthM,
    turns: turns.map((turn, index) => ({
      ...turn,
      startM: index === 0 ? 0 : (turns[index - 1].apexM + turn.apexM) / 2,
      endM: index === turns.length - 1 ? lengthM : (turn.apexM + turns[index + 1].apexM) / 2,
    })),
    unplaced,
  };
}
