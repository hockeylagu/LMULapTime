/**
 * Every car's pose over a stretch of a session replay, sampled at a fixed rate on the replay clock:
 * what the race replay draws. The server builds windows from the stored laps, the client
 * interpolates between samples.
 */
/** `inPit` is 1 in the pit lane or the garage, else 0; it is set even where the car has no pose (stopped in its box). */
export const RACE_POSE_CHANNELS = ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'speedKmh', 'inPit'] as const;
export type RacePoseChannel = typeof RACE_POSE_CHANNELS[number];
export const RACE_POSE_CHANNEL_COUNT = RACE_POSE_CHANNELS.length;
const ANGLE_CHANNELS = new Set<number>([3, 4, 5]);

export interface RacePoseWindow {
  /** Replay time of the first sample, seconds. */
  fromSec: number;
  hz: number;
  /** Samples per car: the window's seconds × hz, plus the next window's first sample. */
  count: number;
  slots: number[];
  /** Car, then sample, then channel; NaN where a car is not on the track (garage, recording gap), but for `inPit`. */
  data: Float32Array;
}

const MAGIC = 0x50524d4c; // "LMRP" little endian
const VERSION = 2;
const HEADER_BYTES = 28;

export function encodeRacePoseWindow(window: RacePoseWindow): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + window.slots.length * 4 + window.data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setFloat64(8, window.fromSec, true);
  view.setFloat32(16, window.hz, true);
  view.setUint32(20, window.count, true);
  view.setUint32(24, window.slots.length, true);
  window.slots.forEach((slot, i) => view.setInt32(HEADER_BYTES + i * 4, slot, true));
  const data = new Float32Array(bytes.buffer, HEADER_BYTES + window.slots.length * 4, window.data.length);
  data.set(window.data);
  return bytes;
}

export function decodeRacePoseWindow(buffer: ArrayBuffer): RacePoseWindow {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES || view.getUint32(0, true) !== MAGIC) throw new Error('Not a race pose window');
  if (view.getUint32(4, true) !== VERSION) throw new Error('Unsupported race pose window version');
  const count = view.getUint32(20, true);
  const slotCount = view.getUint32(24, true);
  const slots = Array.from({ length: slotCount }, (_, i) => view.getInt32(HEADER_BYTES + i * 4, true));
  const dataOffset = HEADER_BYTES + slotCount * 4;
  const length = slotCount * count * RACE_POSE_CHANNEL_COUNT;
  if (buffer.byteLength < dataOffset + length * 4) throw new Error('Truncated race pose window');
  return {
    fromSec: view.getFloat64(8, true),
    hz: view.getFloat32(16, true),
    count,
    slots,
    data: new Float32Array(buffer, dataOffset, length),
  };
}

const IN_PIT = RACE_POSE_CHANNELS.indexOf('inPit');

/** The cars in the pit lane or the garage at `timeSec` (at the nearest sample), drawn or not. */
export function racePitSlots(window: RacePoseWindow | null, timeSec: number): Set<number> {
  const slots = new Set<number>();
  const sample = window ? Math.round((timeSec - window.fromSec) * window.hz) : -1;
  if (!window || sample < 0 || sample >= window.count) return slots;
  window.slots.forEach((slot, car) => {
    if (window.data[(car * window.count + sample) * RACE_POSE_CHANNEL_COUNT + IN_PIT] === 1) slots.add(slot);
  });
  return slots;
}

const lerpAngle = (a: number, b: number, f: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;

/**
 * One car's pose at `timeSec`, interpolated between the two samples around it into `out`
 * (channel order). False, leaving `out` alone, when the car is not on the track then or the time
 * is outside the window.
 */
export function sampleRacePose(window: RacePoseWindow, carIndex: number, timeSec: number, out: Float32Array | number[]): boolean {
  const position = (timeSec - window.fromSec) * window.hz;
  if (!(position >= 0) || position > window.count - 1 || carIndex < 0 || carIndex >= window.slots.length) return false;
  const i = Math.min(Math.floor(position), window.count - 2);
  const f = position - i;
  const base = (carIndex * window.count + i) * RACE_POSE_CHANNEL_COUNT;
  const next = base + RACE_POSE_CHANNEL_COUNT;
  const { data } = window;
  if (Number.isNaN(data[base]) || Number.isNaN(data[next])) {
    // The car appears or leaves between the samples: show it only at its own sample.
    const own = f < 0.5 ? base : next;
    if (Number.isNaN(data[own])) return false;
    for (let c = 0; c < RACE_POSE_CHANNEL_COUNT; c++) out[c] = data[own + c];
    return true;
  }
  for (let c = 0; c < RACE_POSE_CHANNEL_COUNT; c++) {
    out[c] = ANGLE_CHANNELS.has(c) ? lerpAngle(data[base + c], data[next + c], f) : data[base + c] + (data[next + c] - data[base + c]) * f;
  }
  return true;
}
