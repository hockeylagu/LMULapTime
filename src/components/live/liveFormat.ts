import { formatTime } from '../../../shared/domain/formatters.js';
import type { LiveLapRecord } from '../../../shared/types/live.js';

export const UNKNOWN = '—';

export type DeltaTone = 'gain' | 'loss' | 'neutral';

/** Seconds rounded to the 3 decimals that are shown, so a value that reads 0.000 is neither gain nor loss. */
function rounded(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function deltaTone(seconds: number): DeltaTone {
  const value = rounded(seconds);
  if (value < 0) return 'gain';
  return value > 0 ? 'loss' : 'neutral';
}

/** `−0.184` (real minus sign) for a gain, `+0.426` for a loss, `0.000` for none. */
export function formatSignedDelta(seconds: number): string {
  const value = rounded(seconds);
  if (value < 0) return `−${Math.abs(value).toFixed(3)}`;
  return value > 0 ? `+${value.toFixed(3)}` : '0.000';
}

/** A lap time, or the unknown mark. */
export function formatLapTime(seconds: number | null | undefined): string {
  return seconds == null || !(seconds > 0) ? UNKNOWN : formatTime(seconds);
}

/** The running lap clock in tenths, cut (not rounded) so it never reads ahead: `1:05.3`; the unknown mark for null. */
export function formatRunningTime(seconds: number | null | undefined): string {
  if (seconds == null || !(seconds >= 0)) return UNKNOWN;
  const tenths = Math.floor(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return `${minutes}:${rest}`;
}

/** A sector time: `37.204` under a minute, a full lap time format above it, the unknown mark for null. */
export function formatSectorTime(seconds: number | null | undefined): string {
  if (seconds == null || !(seconds > 0)) return UNKNOWN;
  return seconds < 60 ? seconds.toFixed(3) : formatTime(seconds);
}

/** Index of the sector the lap lost the most in against the session's best sectors; -1 when it lost nowhere. */
export function worstSectorIndex(lap: LiveLapRecord, bestSectors: readonly (number | null)[]): number {
  let worst = -1;
  let worstLoss = 0;
  lap.sectors.forEach((sector, index) => {
    const best = bestSectors[index];
    if (sector == null || best == null) return;
    const loss = rounded(sector - best);
    if (loss > worstLoss) { worst = index; worstLoss = loss; }
  });
  return worst;
}

/** The most recent completed lap (the list is oldest first), or null before the first. */
export function lastLap(laps: readonly LiveLapRecord[]): LiveLapRecord | null {
  return laps[laps.length - 1] ?? null;
}
