import type { LiveCorner, LiveResourceKind } from '../../../../shared/types/liveStrategy.js';
import { UNKNOWN } from '../liveFormat.js';

export const resourceName = (kind: LiveResourceKind): string => (kind === 've' ? 'VE' : 'FUEL');

/** An amount in the tank or to set: whole percent of VE, litres to one decimal. */
export function formatAmount(value: number | null | undefined, unit: '%' | 'L'): string {
  if (value == null || !Number.isFinite(value)) return UNKNOWN;
  return unit === '%' ? `${Math.round(value)}` : value.toFixed(1);
}

/** Use per lap: VE to one decimal, litres to two. */
export function formatPerLap(value: number | null | undefined, unit: '%' | 'L'): string {
  if (value == null || !Number.isFinite(value)) return UNKNOWN;
  return value.toFixed(unit === '%' ? 1 : 2);
}

/** A signed per-lap margin with a real minus sign: `+0.2`, `−0.3`. */
export function formatSignedPerLap(value: number | null | undefined, unit: '%' | 'L'): string {
  if (value == null || !Number.isFinite(value)) return UNKNOWN;
  const text = formatPerLap(Math.abs(value), unit);
  return Number(text) === 0 ? text : `${value < 0 ? '−' : '+'}${text}`;
}

/** Whole seconds, or a range `33–38` when the top differs. */
export function formatSecondsRange(low: number | null, high: number | null): string {
  if (low === null) return UNKNOWN;
  return high !== null && Math.round(high) > Math.round(low) ? `${Math.round(low)}–${Math.round(high)}` : `${Math.round(low)}`;
}

export const CORNER_NAMES: Record<LiveCorner, string> = { FL: 'FRONT LEFT', FR: 'FRONT RIGHT', RL: 'REAR LEFT', RR: 'REAR RIGHT' };

/** The MFD's tyre text in the dashboard's voice: `NEW MEDIUM`, `NO CHANGE`. */
export const tyreCallText = (setting: string | null): string => (setting ? setting.trim().toUpperCase() : UNKNOWN);

/** A wet compound or tyre call reads blue; everything else stays plain. */
export const isWetTyre = (text: string | null): boolean => text !== null && /wet|rain/i.test(text);
