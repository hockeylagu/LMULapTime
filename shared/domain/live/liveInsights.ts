import type { LiveFuelRatio, LiveSavingPlan, LiveTyreCoverage } from '../../types/liveInsights.js';
import type { LivePerLapSource } from '../../types/liveStrategy.js';

const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;
/** Driver's minimum planned tread, not a universal grip/safety threshold. */
export const LIVE_TYRE_TREAD_FLOOR = 0.4;

/** A mathematical no-stop scenario to the flag (no reserve: the finish needs none), not a claim that the driver can achieve the saving. */
export function savingToFinish(amount: number, perLap: number, laps: number, source: LivePerLapSource): LiveSavingPlan | null {
  if (![amount, perLap, laps].every(Number.isFinite) || amount < 0 || perLap <= 0 || laps <= 0) return null;
  const target = amount / laps;
  const settable = Math.floor(target * 100 + 1e-9) / 100;
  return { targetPerLap: settable, savePerLap: round(Math.max(0, perLap - settable), 3),
    savePercent: round(Math.max(0, 1 - settable / perLap) * 100, 1), shortfall: round(Math.max(0, laps * perLap - amount), 2), source };
}

export interface FuelRatioInput {
  ratios: readonly number[];
  fuelPerLap: number | null;
  vePerLap: number | null;
  garageSetting: number | null;
  mfdSetting: number | null;
  options: readonly number[];
  veTarget: number | null;
  fuelNow: number | null;
  veNow: number | null;
}

/**
 * Highest paired clean-lap ratio, then the next available setting. No margin beyond the VE reserve. Before three
 * paired laps the game's estimate leads, but never below a lap already measured (its first estimate runs low).
 */
export function planFuelRatio(input: FuelRatioInput): LiveFuelRatio | null {
  const measured = input.ratios.filter(value => Number.isFinite(value) && value > 0);
  const fallback = input.fuelPerLap !== null && input.vePerLap !== null && input.fuelPerLap > 0 && input.vePerLap > 0
    ? input.fuelPerLap / input.vePerLap : null;
  const candidates = measured.length >= 3 ? measured : fallback === null ? measured : [fallback, ...measured];
  const required = candidates.length > 0 ? Math.max(...candidates) : null;
  if (required === null || !Number.isFinite(required)) return null;
  const rounded = Math.ceil(required * 100 - 1e-9) / 100;
  const recommended = [...input.options].filter(value => Number.isFinite(value) && value >= rounded).sort((a, b) => a - b)[0] ?? null;
  const setting = input.mfdSetting ?? input.garageSetting;
  return { recommended, source: measured.length >= 3 ? 'measured' : 'game', pairedLaps: measured.length,
    garageSetting: input.garageSetting, mfdSetting: input.mfdSetting,
    excessLitres: setting !== null && recommended !== null && input.veTarget !== null
      ? round(Math.max(0, setting - recommended) * input.veTarget, 2) : null,
    fuelBiasLaps: input.fuelNow !== null && input.veNow !== null && input.fuelPerLap !== null && input.vePerLap !== null && input.fuelPerLap > 0 && input.vePerLap > 0
      ? round(input.fuelNow / input.fuelPerLap - input.veNow / input.vePerLap, 1) : null };
}

/** Extrapolates tread only. A positive estimate does not guarantee useful grip. */
export function tyreCoverage(worst: number | null, wear: number | null, lapsToTarget: number, raceLaps: number, target: 'pit' | 'finish', newSets: number | null): LiveTyreCoverage | null {
  if (worst === null || wear === null || ![worst, wear, lapsToTarget, raceLaps].every(Number.isFinite) || worst < 0 || worst > 1 || wear <= 0 || lapsToTarget < 0 || raceLaps <= 0) return null;
  const usable = Math.max(0, worst - LIVE_TYRE_TREAD_FLOOR);
  const setsNeeded = Math.max(0, Math.ceil(Math.max(0, raceLaps * wear - usable) / (1 - LIVE_TYRE_TREAD_FLOOR) - 1e-9));
  return { target, projectedTread: round(Math.max(0, worst - lapsToTarget * wear), 3),
    setsNeeded, availableSetsCover: newSets === null ? null : newSets >= setsNeeded };
}
