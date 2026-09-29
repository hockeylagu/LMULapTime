import { ReplayTrajectoryPoint } from '../../core/types.js';

/**
 * Channels whose shape the downsampler preserves, with the swing that counts as "one unit":
 * a full pedal stroke weighs the same as 100 km/h of speed.
 */
const FEATURE_CHANNELS: Array<{ read: (p: ReplayTrajectoryPoint) => number | undefined; scale: number }> = [
  { read: p => p.throttle, scale: 100 },
  { read: p => p.brake, scale: 100 },
  { read: p => p.speedKmh, scale: 100 },
];

/**
 * No two kept samples are further apart than this many times the even spacing: steady stretches
 * (a straight at full throttle) still keep enough samples for the map line and the timing.
 */
const MAX_GAP_FACTOR = 3;

/** Binary min-heap of sample indices keyed by removal cost. */
class CostHeap {
  private readonly items: Array<{ idx: number; cost: number }> = [];

  public push(idx: number, cost: number): void {
    const items = this.items;
    items.push({ idx, cost });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].cost <= items[i].cost) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  public pop(): { idx: number; cost: number } | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].cost < items[smallest].cost) smallest = l;
        if (r < items.length && items[r].cost < items[smallest].cost) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Chooses which `maxPoints` of the samples to keep, as ascending indices. The first and last
 * samples are kept whenever maxPoints allows two (a lap is cut at the start/finish line: they are
 * the crossings).
 *
 * Visvalingam-Whyatt over the pedal and speed traces: the sample whose removal changes the traces
 * least (the smallest triangle it forms with its kept neighbours, in time x value) is removed
 * first, until maxPoints remain. Samples go where the traces change - a brake tap, a lift, the
 * throttle pick-up, the apex - and the interpolated traces stay close to the full-resolution ones,
 * which is what pedal points and the time-weighted throttle hold are computed from. Keeping every
 * Nth sample instead keeps or drops a short event depending on where the stride falls, and aliases
 * chatter such as a quantised throttle alternating 33/100.
 */
export function selectFeatureSamples(points: ReplayTrajectoryPoint[], maxPoints: number): number[] {
  const n = points.length;
  if (maxPoints >= n) return points.map((_, i) => i);
  if (maxPoints <= 1) return [0];
  if (maxPoints === 2) return [0, n - 1];

  const hasTime = points.every(p => typeof p.timeSec === 'number' && Number.isFinite(p.timeSec));
  const t = hasTime ? points.map(p => p.timeSec as number) : points.map((_, i) => i);
  const values = FEATURE_CHANNELS.map(channel => points.map(p => (channel.read(p) ?? 0) / channel.scale));
  const maxGap = (MAX_GAP_FACTOR * (t[n - 1] - t[0])) / (maxPoints - 1);

  const prev = points.map((_, i) => i - 1);
  const next = points.map((_, i) => i + 1);
  const cost = new Array<number>(n).fill(Infinity);
  const costOf = (i: number): number => {
    const p = prev[i];
    const q = next[i];
    if (p < 0 || q >= n || t[q] - t[p] > maxGap) return Infinity;
    let area = 0;
    for (const channel of values) {
      area += Math.abs((t[i] - t[p]) * (channel[q] - channel[p]) - (t[q] - t[p]) * (channel[i] - channel[p]));
    }
    return area;
  };

  const heap = new CostHeap();
  for (let i = 1; i < n - 1; i++) {
    cost[i] = costOf(i);
    if (cost[i] !== Infinity) heap.push(i, cost[i]);
  }

  const removed = new Array<boolean>(n).fill(false);
  let remaining = n;
  while (remaining > maxPoints) {
    const top = heap.pop();
    if (!top) break;
    const i = top.idx;
    if (removed[i] || top.cost !== cost[i]) continue; // stale entry
    removed[i] = true;
    remaining--;
    const p = prev[i];
    const q = next[i];
    next[p] = q;
    prev[q] = p;
    for (const neighbour of [p, q]) {
      if (neighbour <= 0 || neighbour >= n - 1) continue;
      cost[neighbour] = costOf(neighbour);
      if (cost[neighbour] !== Infinity) heap.push(neighbour, cost[neighbour]);
    }
  }

  const selected: number[] = [];
  for (let i = 0; i < n; i++) if (!removed[i]) selected.push(i);
  return selected;
}

/** Index in `selected` (ascending sample indices) of the kept sample nearest to `index`. */
export function nearestSelectedIndex(selected: number[], index: number): number {
  let lo = 0;
  let hi = selected.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (selected[mid] < index) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && index - selected[lo - 1] < selected[lo] - index ? lo - 1 : lo;
}

/**
 * How many points give one every `spacingM` metres of the lap: over the track length when the
 * lap is on a known track, else over the distance the recording covers. A lap is then served at
 * the same density whatever the track - Le Mans (13.6 km) gets ~6,800 points at 2 m where a fixed
 * count would spread it three times thinner than Bahrain.
 */
export function pointBudgetForSpacing(points: ReplayTrajectoryPoint[], trackLengthM: number | undefined, spacingM: number): number {
  let lengthM = trackLengthM ?? 0;
  if (!(lengthM > 0)) {
    for (let i = 1; i < points.length; i++) lengthM += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return Math.max(2, Math.ceil(lengthM / spacingM));
}

/** The samples chosen by selectFeatureSamples. */
export function downsampleTrajectoryPoints(points: ReplayTrajectoryPoint[], maxPoints: number): ReplayTrajectoryPoint[] {
  return selectFeatureSamples(points, maxPoints).map(i => points[i]);
}
