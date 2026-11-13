import { decodeLapColumns, type LapColumn, type LapValue, type StoredLapColumns } from '../core/replay/lapColumnsCodec.js';
import { RACE_POSE_CHANNELS, RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../shared/domain/raceReplay/poseWindow.js';

/** Race replay pose samples per second, and seconds per window the client fetches. */
export const RACE_POSE_HZ = 10;
export const RACE_POSE_WINDOW_SEC = 60;

/** Raw samples further apart than this are a recording gap (pits, garage): no pose is drawn across it. */
const MAX_SAMPLE_GAP_SEC = 1.5;

/** One stored lap of one car resampled on the replay clock: sample k is at (firstTick + k) / hz. */
export interface LapPoses {
  firstTick: number;
  count: number;
  /** Sample, then channel (RACE_POSE_CHANNELS); NaN where the car is in the garage or a gap. */
  data: Float32Array;
}

interface StoredLap extends StoredLapColumns {
  constants?: Record<string, LapValue>;
}

const KEYS = ['timeSec', ...RACE_POSE_CHANNELS, 'inGarage', 'isTeleport'];
const ANGLE = new Set(['rotX', 'rotY', 'rotZ']);

function channel(stored: StoredLap, key: string): LapColumn {
  return stored.columns[key] ?? new Array<LapValue | null>(stored.pointsLength).fill(stored.constants?.[key] ?? null);
}

const finite = (value: LapValue | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

/** Resamples a cached lap blob to `hz` samples per second (linear, angles the short way round). */
export function resampleLapPoses(blob: Uint8Array, hz = RACE_POSE_HZ): LapPoses {
  const stored = decodeLapColumns<StoredLap>(blob, KEYS);
  const time = channel(stored, 'timeSec');
  const values = RACE_POSE_CHANNELS.map(key => channel(stored, key));
  const garage = channel(stored, 'inGarage');
  const teleport = channel(stored, 'isTeleport');
  const n = stored.pointsLength;
  let first = 0;
  while (first < n && !finite(time[first])) first++;
  let last = n - 1;
  while (last > first && !finite(time[last])) last--;
  if (first >= n || !finite(time[first]) || !finite(time[last])) return { firstTick: 0, count: 0, data: new Float32Array(0) };

  const firstTick = Math.ceil((time[first] as number) * hz - 1e-6);
  const lastTick = Math.floor((time[last] as number) * hz + 1e-6);
  const count = Math.max(0, lastTick - firstTick + 1);
  const data = new Float32Array(count * RACE_POSE_CHANNEL_COUNT).fill(NaN);
  const usable = (i: number) => finite(time[i]) && garage[i] !== true && teleport[i] !== true && finite(values[0][i]) && finite(values[2][i]);
  let i = first;
  for (let k = 0; k < count; k++) {
    const t = (firstTick + k) / hz;
    while (i < last && (!finite(time[i + 1]) || (time[i + 1] as number) <= t)) i++;
    const j = Math.min(i + 1, last);
    const t0 = time[i] as number;
    const t1 = finite(time[j]) ? time[j] : t0;
    if (!usable(i) || (j !== i && (!usable(j) || t1 - t0 > MAX_SAMPLE_GAP_SEC))) continue;
    const f = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
    RACE_POSE_CHANNELS.forEach((key, c) => {
      const a = values[c][i];
      const b = values[c][j];
      if (!finite(a)) return;
      const to = finite(b) ? b : a;
      data[k * RACE_POSE_CHANNEL_COUNT + c] = ANGLE.has(key)
        ? a + Math.atan2(Math.sin(to - a), Math.cos(to - a)) * f
        : a + (to - a) * f;
    });
  }
  return { firstTick, count, data };
}

/** The window that holds replay time `timeSec`. */
export const racePoseWindowIndex = (timeSec: number, windowSec = RACE_POSE_WINDOW_SEC) => Math.max(0, Math.floor(timeSec / windowSec));

/**
 * Window `index` of every car: its laps' samples copied onto one grid. `laps` holds each car's
 * resampled laps that overlap the window; on the sample two laps share, the later lap's wins.
 */
export function assembleRacePoseWindow(index: number, slots: number[], laps: Map<number, LapPoses[]>,
  hz = RACE_POSE_HZ, windowSec = RACE_POSE_WINDOW_SEC): RacePoseWindow {
  const fromTick = index * windowSec * hz;
  const count = windowSec * hz + 1;
  const data = new Float32Array(slots.length * count * RACE_POSE_CHANNEL_COUNT).fill(NaN);
  slots.forEach((slot, car) => {
    const carLaps = [...laps.get(slot) ?? []].sort((a, b) => a.firstTick - b.firstTick);
    for (const lap of carLaps) {
      const start = Math.max(fromTick, lap.firstTick);
      const end = Math.min(fromTick + count, lap.firstTick + lap.count);
      if (end <= start) continue;
      data.set(lap.data.subarray((start - lap.firstTick) * RACE_POSE_CHANNEL_COUNT, (end - lap.firstTick) * RACE_POSE_CHANNEL_COUNT),
        (car * count + start - fromTick) * RACE_POSE_CHANNEL_COUNT);
    }
  });
  return { fromSec: fromTick / hz, hz, count, slots, data };
}
