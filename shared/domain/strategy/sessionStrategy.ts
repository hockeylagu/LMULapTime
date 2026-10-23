import type { LapData, SessionStrategy, SessionStrategyStop, StrategyCorner, StrategyLapState } from '../../types/index.js';
import { selectCleanLapCandidates } from '../lapComparison.js';

const CORNERS: StrategyCorner[] = ['FL', 'FR', 'RL', 'RR'];
/** A rise in tread above this is a new tyre, not noise. */
const NEW_TYRE_RISE = 0.005;

const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;
const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const rounded = (value: number | null, digits: number): number | null => (value === null ? null : round(value, digits));

/**
 * The strategy a race measured, for the debrief and for learning: the laps' end states from the native telemetry,
 * the laps as the parser classified them. Use per lap and wear come from clean laps only (the canonical selector:
 * no start lap, in-lap, out-lap or non-representative lap), so a flat, a slow lap or a stop never bends them.
 * A stop's load is the rise over its lap plus one lap of use; its tyres are the corners whose tread rose.
 */
export function measureSessionStrategy(states: readonly StrategyLapState[], laps: readonly LapData[]): SessionStrategy | null {
  const byLap = new Map(states.map(state => [state.lap, state]));
  const completed = laps.filter(lap => lap.lapTime !== null && lap.lapTime > 0);
  const raceLaps = completed.reduce((most, lap) => Math.max(most, lap.lapNumber), 0);
  const start = byLap.get(0);
  if (!start || raceLaps === 0) return null;
  const kind = start.ve !== null && start.ve > 0 ? 've' : 'fuel';
  const clean = selectCleanLapCandidates([...completed]);

  // The use over each clean lap: the end of the lap before it minus its own end.
  const lapUse = (pick: (state: StrategyLapState) => number | null) => clean.flatMap(lap => {
    const before = byLap.get(lap.lapNumber - 1);
    const after = byLap.get(lap.lapNumber);
    const from = before ? pick(before) : null;
    const to = after ? pick(after) : null;
    return from !== null && to !== null && from > to ? [from - to] : [];
  });
  const fuelUse = lapUse(state => state.fuel);
  const veUse = kind === 've' ? lapUse(state => state.ve) : [];
  const fuelPerLap = median(fuelUse);
  const vePerLap = median(veUse);
  const ratios = kind === 've' ? clean.flatMap(lap => {
    const before = byLap.get(lap.lapNumber - 1);
    const after = byLap.get(lap.lapNumber);
    if (!before || !after || before.fuel === null || after.fuel === null || before.ve === null || after.ve === null) return [];
    const fuel = before.fuel - after.fuel;
    const ve = before.ve - after.ve;
    return fuel > 0 && ve > 0 ? [fuel / ve] : [];
  }) : [];

  const flag = byLap.get(raceLaps) ?? null;
  const left = kind === 've' ? flag?.ve ?? null : flag?.fuel ?? null;
  const perLap = kind === 've' ? vePerLap : fuelPerLap;

  // The tyres: the corner most worn at the flag, and its loss over the clean laps.
  const tread = flag?.tread ?? null;
  const worst = tread ? tread.indexOf(Math.min(...tread)) : -1;
  const wear = worst < 0 ? [] : lapUse(state => state.tread?.[worst] ?? null);

  const stops: SessionStrategyStop[] = completed.filter(lap => lap.isPitStop).map(lap => {
    const before = byLap.get(lap.lapNumber);
    const after = byLap.get(lap.lapNumber + 1);
    const added = (pick: (state: StrategyLapState) => number | null, perLapUse: number | null) => {
      const from = before ? pick(before) : null;
      const to = after ? pick(after) : null;
      return from === null || to === null ? null : round(Math.max(0, to - from + (perLapUse ?? 0)), 1);
    };
    const tyres = before?.tread && after?.tread
      ? CORNERS.filter((_, index) => after.tread![index] > before.tread![index] + NEW_TYRE_RISE) : [];
    const veAdded = kind === 've' ? added(state => state.ve, vePerLap) : null;
    const fuelAdded = added(state => state.fuel, fuelPerLap);
    const level = kind === 've' ? before?.ve ?? null : before?.fuel ?? null;
    const add = kind === 've' ? veAdded : fuelAdded;
    // The added lap of use is a median: VE can read past full, never be.
    return { lap: lap.lapNumber, fuelAdded, veAdded,
      levelAfter: level === null || add === null ? null : round(kind === 've' ? Math.min(100, level + add) : level + add, 1), tyres };
  });

  const times = clean.map(lap => lap.lapTime!);
  const compound = completed.at(-1)?.flCompound || completed.at(-1)?.fCompound || null;
  return {
    kind,
    laps: raceLaps,
    start: { fuel: rounded(start.fuel, 1), ve: kind === 've' ? rounded(start.ve, 1) : null },
    flag: { fuel: rounded(flag?.fuel ?? null, 1), ve: kind === 've' ? rounded(flag?.ve ?? null, 1) : null,
      laps: left !== null && perLap ? round(left / perLap, 1) : null },
    perLap: { fuel: rounded(fuelPerLap, 2), ve: rounded(vePerLap, 2), laps: kind === 've' ? veUse.length : fuelUse.length },
    fuelRatio: {
      set: kind === 've' && start.fuel !== null && start.ve ? round(start.fuel / start.ve, 2) : null,
      // The same rule as the live recommendation: the highest lap's ratio, up to the hundredth.
      needed: ratios.length ? Math.ceil(Math.max(...ratios) * 100 - 1e-9) / 100 : null,
    },
    tyres: { compound, corner: worst < 0 ? null : CORNERS[worst], wearPerLap: rounded(median(wear), 4),
      treadAtFlag: tread ? round(Math.min(...tread), 3) : null },
    stops,
    pace: { clean: rounded(median(times), 3), first: rounded(median(times.slice(0, 3)), 3),
      last: rounded(median(times.slice(-3)), 3), laps: times.length },
  };
}
