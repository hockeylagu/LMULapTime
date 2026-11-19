import type { LapColumn, LapValue, StoredLapColumns } from '../core/replay/lapColumnsCodec.js';

/** One cached lap row: the blob of replay_trajectories. */
export interface StoredLapBlob {
  slot: number;
  lapNumber: number;
  blob: Uint8Array;
}

export interface StoredLap extends StoredLapColumns {
  vcrRawSampleRateHz?: number;
  constants?: Record<string, LapValue>;
}

/** A channel of a stored lap as a column, whether it varies (a column) or not (a constant). */
export function channel(stored: StoredLap, key: string): LapColumn {
  const column = stored.columns[key];
  if (column) return column;
  const constant = stored.constants?.[key];
  return new Array<LapValue | null>(stored.pointsLength).fill(constant ?? null);
}
