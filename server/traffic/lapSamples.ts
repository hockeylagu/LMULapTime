import { decodeLapColumns, type LapColumn, type LapValue, type StoredLapColumns } from '../core/replay/lapColumnsCodec.js';
import { buildCenterlineSpatialIndex } from '../tracks/trackProjection.js';
import { buildDriverPositions, LapSamples, POSITION_SAMPLE_HZ, RACE_POSITIONS_VERSION, RacePositions } from './racePositions.js';

/** One cached lap row: the blob of replay_trajectories. */
export interface StoredLapBlob {
  slot: number;
  lapNumber: number;
  blob: Uint8Array;
}

interface StoredLap extends StoredLapColumns {
  vcrRawSampleRateHz?: number;
  constants?: Record<string, LapValue>;
}

const SAMPLE_KEYS = ['timeSec', 'x', 'z', 'inPit', 'inGarage', 'isTeleport'];

/** A channel of a stored lap as a column, whether it varies (a column) or not (a constant). */
function channel(stored: StoredLap, key: string): LapColumn {
  const column = stored.columns[key];
  if (column) return column;
  const constant = stored.constants?.[key];
  return new Array<LapValue | null>(stored.pointsLength).fill(constant ?? null);
}

/**
 * Reads only time, position and on-track state from a cached lap, one sample every
 * 1/POSITION_SAMPLE_HZ seconds. Only those columns are decoded, and they are not turned into
 * point objects: that is most of the cost of a full decode.
 */
export function readLapSamples(lapNumber: number, blob: Uint8Array): LapSamples {
  const stored = decodeLapColumns<StoredLap>(blob, SAMPLE_KEYS);
  const [time, x, z, inPit, inGarage, teleport] = SAMPLE_KEYS.map(key => channel(stored, key));
  const step = Math.max(1, Math.round((stored.vcrRawSampleRateHz || 50) / POSITION_SAMPLE_HZ));

  const samples: LapSamples = { lapNumber, times: [], x: [], z: [], onTrack: [] };
  for (let i = 0; i < stored.pointsLength; i += step) {
    const t = time[i];
    const px = x[i];
    const pz = z[i];
    if (typeof t !== 'number' || typeof px !== 'number' || typeof pz !== 'number') continue;
    samples.times.push(t);
    samples.x.push(px);
    samples.z.push(pz);
    // The drive out of the garage is stored as in the pit lane (applyGarageState).
    samples.onTrack.push(inPit[i] !== true && inGarage[i] !== true && teleport[i] !== true);
  }
  return samples;
}

/** The whole race's positions index from its cached laps (the work the worker thread does). */
export function buildRacePositions(laps: StoredLapBlob[], centerline: Array<[number, number]>): RacePositions {
  const index = buildCenterlineSpatialIndex(centerline);
  const bySlot = new Map<number, LapSamples[]>();
  for (const lap of laps) {
    const samples = readLapSamples(lap.lapNumber, lap.blob);
    const list = bySlot.get(lap.slot) ?? [];
    list.push(samples);
    bySlot.set(lap.slot, list);
  }
  const drivers = [...bySlot].map(([slot, samples]) => buildDriverPositions(slot, samples, index));
  return { version: RACE_POSITIONS_VERSION, trackLengthM: index.totalLengthM, drivers };
}
