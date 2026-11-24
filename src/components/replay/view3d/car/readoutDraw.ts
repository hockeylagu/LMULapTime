import type { CarReadout, CarReadoutElement } from '../../../../../shared/types/scenes/car.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';

/**
 * The game's draw rules for a wheel/dash readout (docs/PACKAGE_FORMAT.md#readouts in the pipeline repo, decoded from the game's
 * executable): an element's input becomes one quad in the readout canvas. Pure: the canvas itself is `readoutCanvas.ts`.
 */

/** A quad in canvas units (0..1, y down from the top), its texture rectangle and its colour `[a, r, g, b]` 0..255. */
export interface ReadoutQuad { x0: number; y0: number; x1: number; y1: number; u0: number; v0: number; u1: number; v1: number; argb: readonly number[] }

/** The game's colour when the file leaves one out: white, opaque. */
const WHITE = [255, 255, 255, 255] as const;

/** A TC bar flashes at this rate while TC intervenes (the one rate the game passes to an element). */
export const TC_FLASH_HZ = 10;

/**
 * An element's input from the lap's sample, and the flash rate the game gives it; null where the replay carries nothing the game
 * reads for it: the element is not drawn (wheel slip, flags, tyre temperatures and pressures, fuel, battery; user decision
 * 2026-11-24). A TC bar's input is wheel slip, so it is drawn only while TC intervenes (full and flashing); an ABS bar only while
 * ABS is active (full). `delta` is the lap delta at this sample (`readoutLapExtras`), undefined while unknown.
 */
export function readoutInput(element: CarReadoutElement, readout: CarReadout, point: ReplayTrajectoryPoint, delta?: number): {x: number; flashHz: number | null} | null {
  const flag = (value: boolean | undefined) => value === undefined ? null : {x: value ? 1 : 0, flashHz: null};
  switch (element.name) {
    case 'RPMBar': return point.engineRpm === undefined ? null : {x: rpmInput(point.engineRpm, readout.rpm.min, readout.rpm.max, readout.revLimitRpm), flashHz: null};
    case 'RPMAltBar': return point.engineRpm === undefined ? null : {x: rpmInput(point.engineRpm, readout.rpm.altMin, readout.rpm.altMax, readout.revLimitRpm), flashHz: null};
    case 'PitLimiterIcon': case 'PitLimiterAltIcon': return flag(point.pitLimiter);
    case 'HeadlightsIcon': return flag(point.headlights);
    case 'TCActiveBar': return flag(point.tcActive);
    case 'TCLeftBar': case 'TCRightBar': return point.tcActive === true ? {x: 1, flashHz: TC_FLASH_HZ} : null;
    // The game fills an ABS bar from a per-axle value the replay lacks; its ABS-active flag shows when ABS works, so the bars are full
    // then and not drawn otherwise. The locked-wheel icons need that value too.
    case 'ABSLeftBar': case 'ABSRightBar': return point.absActive === true ? {x: 1, flashHz: null} : null;
    case 'VirtualEnergyBar': return point.virtualEnergy === undefined ? null : {x: point.virtualEnergy / 100, flashHz: null};
    case 'BrakeTempFLIcon': case 'BrakeTempFRIcon': case 'BrakeTempRLIcon': case 'BrakeTempRRIcon': {
      const temperature = point.brakeTemps?.[['BrakeTempFLIcon', 'BrakeTempFRIcon', 'BrakeTempRLIcon', 'BrakeTempRRIcon'].indexOf(element.name)];
      return temperature === undefined ? null : {x: temperature, flashHz: null};
    }
    // The game passes a constant 0 for a pending pit request.
    case 'PitPendingIcon': return {x: 0, flashHz: null};
    // The lap delta, positive on one bar and negated on the other (a negative input draws the bar off).
    case 'DeltaPositiveBar': return delta === undefined ? null : {x: delta, flashHz: null};
    case 'DeltaNegativeBar': return delta === undefined ? null : {x: -delta, flashHz: null};
    // No replay input: locked wheels, fuel and battery, launch control, tyres, pit and flag state, overheating, settings.
    case 'FuelBar': case 'FuelUsageBar': case 'BatteryBar': case 'BatteryUsageBar': case 'BatteryRegenBar': case 'VirtualEnergyUsageBar':
    case 'LCCountdownLeft': case 'LCCountdownRight': case 'ABSLockedLeftIcon': case 'ABSLockedRightIcon':
    case 'ABSLockedRearLeftIcon': case 'ABSLockedRearRightIcon': case 'TyreTempFLIcon': case 'TyreTempFRIcon': case 'TyreTempRLIcon':
    case 'TyreTempRRIcon': case 'TyrePressFLIcon': case 'TyrePressFRIcon': case 'TyrePressRLIcon': case 'TyrePressRRIcon':
    case 'PitAcceptedIcon': case 'BlueFlagIcon': case 'YellowFlagIcon': case 'BlackFlagIcon': case 'FuelLowIcon':
    case 'OverheatingIcon': case 'SettingChangeIcon':
      return null;
  }
}

/**
 * The rpm bar's input: `top` is the display maximum when it lies between 0 and the rev limit, else the rev limit (-1 is unset);
 * `clamp((rpm - min) / max(top - min, 1), 0, 1)`.
 */
export function rpmInput(rpm: number, min: number, max: number, revLimitRpm: number): number {
  const top = max >= 0 && max <= revLimitRpm ? max : revLimitRpm;
  return Math.min(1, Math.max(0, (rpm - min) / Math.max(top - min, 1)));
}

/**
 * The element's value at `timeSec` for input `x`: 1 or -1 (off) for the threshold orientations 3..8, the input over `maxValue` for
 * 0..2; off during the first half of each flash period (orientations 4 and 7 at 5 Hz, 5 and 8 at 1 Hz, or the input's own rate).
 */
export function readoutValue(element: CarReadoutElement, x: number, flashHz: number | null, timeSec: number): number {
  const threshold = element.threshold ?? 0, maxValue = element.maxValue ?? 1, o = element.orientation;
  let value = o >= 3 && o <= 5 ? (x > threshold ? 1 : -1) : o >= 6 ? (x < threshold ? 1 : -1) : maxValue > 0 && maxValue !== 1 ? x / maxValue : x;
  const rate = flashHz ?? (o === 4 || o === 7 ? 5 : o === 5 || o === 8 ? 1 : 0);
  if (rate > 0 && timeSec * rate - Math.floor(timeSec * rate) < 0.5) value = -1;
  return value;
}

/**
 * The quad an element draws for `value`: below 0 the whole quad in its off colour; else `q = round(min(value, 1) * elements) /
 * elements` fills from the left (orientation 0), from the bottom (1), picks one cell (2) or shows the whole quad, in the alternate
 * colour and texture offset below `altValue`.
 */
export function readoutQuad(element: CarReadoutElement, value: number): ReadoutQuad {
  const [ox, oy] = element.offset, [sx, sy] = element.scale;
  let [u0, v0] = element.uvMin, [u1, v1] = element.uvMax, x1 = ox + sx, y0 = oy;
  if (value < 0) return {x0: ox, y0: oy, x1, y1: oy + sy, u0, v0, u1, v1, argb: element.offAlphaColor};
  const cells = element.elements, q = Math.round(Math.min(value, 1) * cells) / cells;
  if (element.orientation === 0) { x1 = ox + sx * q; u1 = u0 + (u1 - u0) * q; }
  else if (element.orientation === 1) { y0 = oy + (1 - q) * sy; v0 = v1 - (v1 - v0) * q; }
  else if (element.orientation === 2) { const width = u1 - u0; u1 = u0 + width * Math.min(1, q + 1 / cells); u0 += width * q; }
  let argb: readonly number[] = element.alphaColor ?? WHITE;
  if (q < (element.altValue ?? 0)) {
    argb = element.altAlphaColor ?? WHITE;
    const [du, dv] = element.altUvOffset ?? [0, 0];
    u0 += du; u1 += du; v0 += dv; v1 += dv;
  }
  return {x0: ox, y0, x1, y1: oy + sy, u0, v0, u1, v1, argb};
}

/** The quads of every drawn element of a readout for a lap sample, in the file's order (the game's draw order). */
export function readoutQuads(readout: CarReadout, point: ReplayTrajectoryPoint, timeSec: number, delta?: number): Array<ReadoutQuad | null> {
  return readout.elements.map(element => {
    const input = readoutInput(element, readout, point, delta);
    return input === null ? null : readoutQuad(element, readoutValue(element, input.x, input.flashHz, timeSec));
  });
}
