import type { CarReadout, CarReadoutFont, CarReadoutText } from '../../../../../shared/types/scenes/car.js';
import type { ReplayLapSummary, ReplayStandingsSnapshot, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { ReadoutQuad } from './readoutDraw.js';
import { readoutLapExtras } from './readoutLapExtras.js';

/**
 * The game's text fields of a wheel/dash readout (docs/PACKAGE_FORMAT.md#readouts in the pipeline repo, decoded from the game's
 * executable): the string each field shows and the glyph quads it draws in the readout canvas. Pure: the canvas is `readoutCanvas.ts`.
 */

/**
 * What the lap adds to its samples: its number, the session time it started at, the session's laps (lap times, sectors, pit stops),
 * the car's replay slot, the running order and the lap's samples. The delta and the previous lap's use come from `readoutLapExtras`,
 * registered for this object.
 */
export interface ReadoutLapContext {
  currentLap?: number;
  lapStartTimeSec?: number;
  timeReference?: 'session' | 'lap';
  laps?: ReplayLapSummary[];
  driverSlot?: number;
  standingsHistory?: ReplayStandingsSnapshot[];
  points?: ReplayTrajectoryPoint[];
}

/** The game's placeholder for a lap time it does not have. */
const NO_LAP_TIME = '-:--.---';
/** How long after the line the current-lap field still shows the lap just finished (the game's 10 s). */
const FINISHED_LAP_SHOWN_SEC = 10;
const KMH_TO_MPH = 1 / 1.609344, LITRES_TO_GALLONS = 0.26417204;

/** `%d:%02d.%03d` of a time in seconds, from its rounded milliseconds (the game's lap time format). */
export function lapTimeText(seconds: number): string {
  const ms = Math.round(seconds * 1000), minutes = Math.floor(ms / 60000), rest = ms - minutes * 60000;
  return `${minutes}:${String(Math.floor(rest / 1000)).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`;
}

/** `%.Nf` with the given decimals below `limit` (absolute) and `decimalsAbove` from it. */
const decimals = (value: number, below: number, above: number, limit = 10) => value.toFixed(Math.abs(value) < limit ? below : above);
const celsius = (value: number, units: number) => String(Math.round(units === 2 ? value * 1.8 + 32 : value));
const setting = (value: number | undefined) => value === undefined ? null : String(Math.round(value));
/** Litres, or gallons for `units` 2, with two decimals (the game's fuel use fields). */
const fuelText = (litres: number, units: number) => (units === 2 ? litres * LITRES_TO_GALLONS : litres).toFixed(2);
/** The game's `+%1d.%03d` / `-%1d.%03d` of a delta, capped at 9.999. */
const deltaText = (delta: number) => `${delta >= 0 ? '+' : '-'}${(Math.min(9999, Math.round(Math.abs(delta) * 1000)) / 1000).toFixed(3)}`;

/** The lap's first value and the one at this sample, for the used-this-lap fields; null where the lap carries none. */
function usedThisLap(context: ReadoutLapContext, point: ReplayTrajectoryPoint, value: (point: ReplayTrajectoryPoint) => number | undefined): number | null {
  const first = context.points?.find(sample => value(sample) !== undefined), now = value(point);
  return first === undefined || now === undefined ? null : Math.max(0, value(first)! - now);
}

/**
 * A sector field (1..3), the game's FUN_140d9c270: for 10 s after the line the sector of the lap just finished; else this lap's
 * finished sector, the running time of the sector the car is in, or `-:--.---` for one not reached yet. Null without timing.
 */
function sectorText(sector: 1 | 2 | 3, context: ReadoutLapContext, timeSec: number): string | null {
  const timing = lapTiming(context, timeSec);
  if (!timing) return null;
  if (timing.inLap < FINISHED_LAP_SHOWN_SEC && timing.previous) {
    const finished = [timing.previous.s1Sec, timing.previous.s2Sec, timing.previous.s3Sec][sector - 1];
    if (finished > 0) return lapTimeText(finished);
  }
  const own = (context.laps ?? []).find(lap => lap.lapNumber === context.currentLap);
  if (!own || own.s1Sec <= 0 || own.s2Sec <= 0 || timing.inLap < 0) return NO_LAP_TIME;
  const start = sector === 1 ? 0 : sector === 2 ? own.s1Sec : own.s1Sec + own.s2Sec, length = [own.s1Sec, own.s2Sec, own.s3Sec][sector - 1];
  if (timing.inLap < start) return NO_LAP_TIME;
  return lapTimeText(length > 0 && timing.inLap >= start + length ? length : timing.inLap - start);
}

/** The car's place in the running order at session time `sessionSec`: ` <place>/<cars>`; null without one. */
function placeText(context: ReadoutLapContext, sessionSec: number): string | null {
  const history = context.standingsHistory, slot = context.driverSlot;
  if (!history?.length || slot === undefined || !Number.isFinite(sessionSec)) return null;
  let snapshot: ReplayStandingsSnapshot | null = null;
  for (const row of history) { if (row.timeSec > sessionSec) break; snapshot = row; }
  const place = snapshot ? snapshot.order.indexOf(slot) : -1;
  return snapshot && place >= 0 ? ` ${place + 1}/${snapshot.order.length}` : null;
}

/**
 * The lap's timing at sample time `timeSec` (session time, or lap time on a lap clock): seconds into the lap (negative in the run-up
 * before the line), the laps finished before it and the best of them. Null when the lap carries no timing.
 */
function lapTiming(context: ReadoutLapContext, timeSec: number): {inLap: number; previous: ReplayLapSummary | null; best: number | null} | null {
  const start = context.timeReference === 'lap' ? 0 : context.lapStartTimeSec;
  if (context.currentLap === undefined || start === undefined) return null;
  const done = (context.laps ?? []).filter(lap => lap.lapNumber < context.currentLap! && lap.lapTimeSec > 0);
  const previous = done.find(lap => lap.lapNumber === context.currentLap! - 1) ?? null;
  const best = done.length ? Math.min(...done.map(lap => lap.lapTimeSec)) : null;
  return {inLap: timeSec - start, previous, best};
}

/**
 * The string the game writes for `field` at this sample, or null where the replay has no value for it: the field is not drawn (the game
 * would show its `defaultValue` or the player-only data the replay lacks; user decision 2026-11-24). `units` 0 (the player's setting)
 * reads as metric.
 */
export function readoutText(field: CarReadoutText, point: ReplayTrajectoryPoint, timeSec: number, context: ReadoutLapContext, index = -1): string | null {
  const units = field.units, extras = readoutLapExtras(context), delta = extras?.delta?.[index];
  const corner = (values: readonly number[] | undefined, names: readonly string[]) => values?.[names.indexOf(field.name)];
  switch (field.name) {
    case 'Gears': return point.gear === undefined ? null : point.gear === 0 ? 'N' : point.gear < 0 ? 'R' : String(point.gear);
    case 'Speed': return point.speedKmh === undefined ? null : String(Math.round(Math.abs(point.speedKmh) * (units === 2 ? KMH_TO_MPH : 1)));
    case 'RPM': return point.engineRpm === undefined ? null : String(Math.round(point.engineRpm));
    case 'TTempLF': case 'TTempRF': case 'TTempLR': case 'TTempRR': {
      const value = corner(point.tireTemps, ['TTempLF', 'TTempRF', 'TTempLR', 'TTempRR']);
      return value === undefined ? null : celsius(value, units);
    }
    case 'TPressLF': case 'TPressRF': case 'TPressLR': case 'TPressRR': {
      const value = corner(point.tirePressures, ['TPressLF', 'TPressRF', 'TPressLR', 'TPressRR']);
      return value === undefined ? null : String(Math.round(value));
    }
    case 'BTempLF': case 'BTempRF': case 'BTempLR': case 'BTempRR': {
      const value = corner(point.brakeTemps, ['BTempLF', 'BTempRF', 'BTempLR', 'BTempRR']);
      return value === undefined ? null : celsius(value, units);
    }
    // Litres rounded (the game gives one decimal only for a tank of at most 20 L, which no car has); gallons with one decimal.
    case 'FuelLevelDigit': return point.fuel === undefined ? null : units === 2 ? (point.fuel * LITRES_TO_GALLONS).toFixed(1) : String(Math.round(point.fuel));
    case 'VirtualEnergyLevelDigit': return point.virtualEnergy === undefined ? null : decimals(point.virtualEnergy, 1, 0);
    case 'CurrentLap': {
      const timing = lapTiming(context, timeSec);
      if (!timing) return null;
      if (timing.inLap < 0) return timing.previous ? lapTimeText(timing.previous.lapTimeSec + timing.inLap) : null;
      return lapTimeText(timing.inLap < FINISHED_LAP_SHOWN_SEC && timing.previous ? timing.previous.lapTimeSec : timing.inLap);
    }
    case 'LastLap': {
      const timing = lapTiming(context, timeSec);
      return timing ? timing.previous ? lapTimeText(timing.previous.lapTimeSec) : NO_LAP_TIME : null;
    }
    case 'BestLap': {
      const timing = lapTiming(context, timeSec);
      return timing ? timing.best === null ? NO_LAP_TIME : lapTimeText(timing.best) : null;
    }
    case 'OilTempDigit': return point.oilTemp === undefined ? null : celsius(point.oilTemp, units);
    case 'WaterTempDigit': return point.waterTemp === undefined ? null : celsius(point.waterTemp, units);
    // Setting indices as the game shows them (`%d`), from the telemetry recording of the player's laps.
    case 'TCMap': return setting(point.tcMap);
    case 'TCCut': return setting(point.tcCut);
    case 'TCSlip': return setting(point.tcSlip);
    case 'ABSMap': return setting(point.absMap);
    case 'EngineMixture': return setting(point.engineMixture);
    // Front share: 100 - the rear bias in whole percent, or with two decimals.
    case 'BrakeBias': return point.brakeBiasRear === undefined ? null : String(100 - Math.round(point.brakeBiasRear * 100));
    case 'BrakeBiasExact': return point.brakeBiasRear === undefined ? null : (100 - point.brakeBiasRear * 100).toFixed(2);
    case 'LapsCompleted': return context.currentLap === undefined ? null : String(Math.max(0, context.currentLap - 1));
    // Laps since the stint began: completed laps minus those completed when the car left the pits after its last pit-stop lap.
    case 'LapsInStint': {
      const current = context.currentLap;
      if (current === undefined) return null;
      const pitLaps = (context.laps ?? []).filter(lap => lap.isPitStop && lap.lapNumber < current).map(lap => lap.lapNumber);
      return String(Math.max(0, current - 1 - (pitLaps.length ? Math.max(...pitLaps) : 0)));
    }
    case 'LapTimeSector1': return sectorText(1, context, timeSec);
    case 'LapTimeSector2': return sectorText(2, context, timeSec);
    case 'LapTimeSector3': return sectorText(3, context, timeSec);
    // The delta to the reference lap draws in one of three fields: the neutral ` -.---` without a reference, else the + or - one.
    case 'DeltaNeutral': return !extras ? null : extras.delta ? '' : ' -.---';
    case 'DeltaPositive': return delta === undefined ? null : delta >= 0 ? deltaText(delta) : '';
    case 'DeltaNegative': return delta === undefined ? null : delta < 0 ? deltaText(delta) : '';
    case 'LapTimePredicted': return !extras ? null : delta === undefined || extras.referenceLapSec === null ? NO_LAP_TIME : lapTimeText(extras.referenceLapSec + delta);
    case 'FuelUsedThisLap': { const value = usedThisLap(context, point, sample => sample.fuel); return value === null ? null : fuelText(value, units); }
    case 'FuelLastLap': return extras?.previousFuelUsed == null ? null : fuelText(extras.previousFuelUsed, units);
    case 'VirtualEnergyUsedThisLap': { const value = usedThisLap(context, point, sample => sample.virtualEnergy); return value === null ? null : decimals(value, 2, 1); }
    case 'VirtualEnergyLastLap': return extras?.previousEnergyUsed == null ? null : decimals(extras.previousEnergyUsed, 2, 1);
    case 'BatteryLevelDigit': return point.soc === undefined ? null : decimals(point.soc, 1, 0);
    case 'Place': return placeText(context, context.timeReference === 'lap' ? (context.lapStartTimeSec ?? NaN) + timeSec : timeSec);
    // No replay or telemetry value, or a rule not decoded (only what the replay has, user decision 2026-11-24): motor temperature,
    // battery use, fuel and energy averages and use, the lap count (its race-type rule is not decoded), boost, motor and brake maps,
    // regen level, bias delta and migration, anti-roll bars, track state and the setting-change popup.
    case 'BoostMotorTempDigit': case 'FuelFinishAverage': case 'FuelUse': case 'BatteryLastLap': case 'BatteryUsedThisLap': case 'BatteryFinishAverage':
    case 'BatteryUse': case 'VirtualEnergyFinishAverage': case 'VirtualEnergyUse': case 'Laps': case 'BoostDigit': case 'BoostMap':
    case 'BatteryRegenLevel': case 'MotorMap': case 'MotorMapText': case 'BrakeMap': case 'BrakeBiasDelta': case 'BrakeBiasMigration':
    case 'AntiRollBarFront': case 'AntiRollBarRear': case 'TrackState': case 'SettingChangeTitle': case 'SettingChangeValue':
      return null;
  }
}

/**
 * The glyph quads of `text` in `field`'s font, in canvas units (0..1, v down), by the game's layout: anchor at `offset` x the canvas size
 * (whole pixels), width the sum of the glyph advances, height the cell height - 2, aligned by halving (integer) or subtracting them;
 * each glyph a cell-sized quad at (x + 0.5, y + 0.5) x scale showing texels x0 + 1 .. x0 + cell width (the same down).
 */
export function readoutGlyphQuads(field: CarReadoutText, font: CarReadoutFont, canvasSize: readonly [number, number], text: string): ReadoutQuad[] {
  const [cw, ch] = font.cell, [sheetW, sheetH] = font.size, [sx, sy] = field.scale, [canvasW, canvasH] = canvasSize;
  // The game draws the string byte by byte (characters 32 and up that its sheet holds).
  const glyphs = Array.from({length: text.length}, (_, i) => text.charCodeAt(i) - 32).filter(index => index >= 0 && index < font.advances.length);
  const width = glyphs.reduce((sum, index) => sum + font.advances[index], 0), height = ch - 2;
  let x = Math.trunc(field.offset[0] * canvasW), y = Math.trunc(field.offset[1] * canvasH);
  x -= field.alignW === 1 ? Math.trunc(width / 2) : field.alignW === 2 ? width : 0;
  y -= field.alignH === 1 ? Math.trunc(height / 2) : field.alignH === 2 ? height : 0;
  const argb = field.alphaColor ?? [255, 255, 255, 255];
  return glyphs.map(index => {
    const x0 = (index % font.columns) * cw, y0 = Math.floor(index / font.columns) * ch;
    const left = (x + 0.5) * sx, top = (y + 0.5) * sy;
    x += font.advances[index];
    return {
      x0: left / canvasW, y0: top / canvasH, x1: (left + cw * sx) / canvasW, y1: (top + ch * sy) / canvasH,
      u0: (x0 + 1) / sheetW, v0: (y0 + 1) / sheetH, u1: (x0 + cw) / sheetW, v1: (y0 + ch) / sheetH, argb,
    };
  });
}

/** Each text field's glyph quads for a lap sample (empty where it shows nothing), in the file's order; none without a canvas size. */
export function readoutTextQuads(readout: CarReadout, point: ReplayTrajectoryPoint, timeSec: number, context: ReadoutLapContext, index = -1): ReadoutQuad[][] {
  return readout.texts.map(field => {
    const text = readout.canvasSize ? readoutText(field, point, timeSec, context, index) : null;
    return text === null ? [] : readoutGlyphQuads(field, readout.fonts[field.font], readout.canvasSize!, text);
  });
}
