import zlib from 'zlib';
import { ReplayPitEvent } from '../core/types.js';
import { garageSpells, garageState } from '../replay/decode/garageState.js';
import { buildCenterlineSpatialIndex } from '../tracks/trackProjection.js';
import { buildDriverPositions, LapSamples, POSITION_SAMPLE_HZ, RACE_POSITIONS_VERSION, RacePositions } from './racePositions.js';

/** One cached lap row: the brotli blob of replay_trajectories. */
export interface StoredLapBlob {
  slot: number;
  lapNumber: number;
  blob: Uint8Array;
}

type Column = Array<number | boolean | null>;

interface StoredLapColumns {
  rawSampleRateHz?: number;
  driverSlot?: number;
  pitEvents?: ReplayPitEvent[];
  pointsLength?: number;
  constants?: Record<string, unknown>;
  columns?: Record<string, Column>;
  points?: Array<Record<string, unknown>>;
}

/** A channel of a stored lap as a column, whether it varies (a column) or not (a constant). */
function channel(stored: StoredLapColumns, key: string, length: number): Column {
  const column = stored.columns?.[key];
  if (column) return column;
  const constant = stored.constants?.[key];
  const value = typeof constant === 'number' || typeof constant === 'boolean' ? constant : null;
  return new Array<number | boolean | null>(length).fill(value);
}

/**
 * Reads only time, position and on-track state from a cached lap, one sample every
 * 1/POSITION_SAMPLE_HZ seconds. The blob is not turned into point objects: that is most of the
 * cost of a full decode.
 */
export function readLapSamples(lapNumber: number, blob: Uint8Array): LapSamples {
  const stored = JSON.parse(zlib.brotliDecompressSync(blob).toString('utf8')) as StoredLapColumns;
  const length = stored.pointsLength ?? stored.points?.length ?? 0;
  const pick = (key: string): Column => (stored.points
    ? stored.points.map((p) => (typeof p[key] === 'number' || typeof p[key] === 'boolean' ? p[key] as number | boolean : null))
    : channel(stored, key, length));
  const time = pick('timeSec');
  const x = pick('x');
  const z = pick('z');
  const inPit = pick('inPit');
  const speed = pick('speedKmh');
  const teleport = pick('isTeleport');
  // The stored garage flag is not read: it is recomputed from the pit events, as a full read does.
  const garage = garageState({
    length,
    timeSec: i => (typeof time[i] === 'number' ? time[i] as number : undefined),
    speedKmh: i => (typeof speed[i] === 'number' ? speed[i] as number : undefined),
    inPit: i => inPit[i] === true,
  }, garageSpells((stored.pitEvents ?? []).filter(e => e.driverSlot === stored.driverSlot)));
  const step = Math.max(1, Math.round((stored.rawSampleRateHz || 50) / POSITION_SAMPLE_HZ));

  const samples: LapSamples = { lapNumber, times: [], x: [], z: [], onTrack: [] };
  for (let i = 0; i < length; i += step) {
    const t = time[i];
    const px = x[i];
    const pz = z[i];
    if (typeof t !== 'number' || typeof px !== 'number' || typeof pz !== 'number') continue;
    samples.times.push(t);
    samples.x.push(px);
    samples.z.push(pz);
    samples.onTrack.push(inPit[i] !== true && !garage.inGarage[i] && !garage.leavingGarage[i] && teleport[i] !== true);
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
