import zlib from 'node:zlib';
import { applySurfaceEvent, readReplaySurfaceEvents, SURFACE_CHANNELS } from '../decode/replaySurface.js';

/**
 * Seeking in a replay's track surface state (docs/VCR_FORMAT.md §4.21). A whole session's state is too large to keep per second (Le
 * Mans: 604,484 elements, about 680 KB a compressed state), so the index keeps a bounded number of states, each with the file offset
 * of the slice it was taken before; the state at any time is the nearest earlier one plus the events read again from its offset.
 * Events are end states, so reading one again over a state that already holds it changes nothing.
 */
export interface SurfaceSnapshot { time: number; offset: number; state: Buffer }
export interface ReplaySurfaceIndex { elements: number; snapshots: SurfaceSnapshot[]; end: number }

/** The first spacing between kept states, and how many an index keeps at most: past it, every other one goes and the spacing doubles. */
export const SNAPSHOT_STEP_S = 60, MAX_SNAPSHOTS = 120;

const pack = (state: Uint8Array) => zlib.deflateRawSync(state, {level: 1});
const unpack = (snapshot: SurfaceSnapshot) => new Uint8Array(zlib.inflateRawSync(snapshot.state));

/** Reads the replay's surface events once, keeping a state every `step` seconds of session time (`step` doubling to stay bounded). */
export function buildReplaySurfaceIndex(filePath: string, elements: number): ReplaySurfaceIndex {
  const state = new Uint8Array(elements * SURFACE_CHANNELS), snapshots: SurfaceSnapshot[] = [];
  let step = SNAPSHOT_STEP_S, next = 0, end = 0;
  for (const event of readReplaySurfaceEvents(filePath)) {
    if (event.time >= next) {
      snapshots.push({time: event.time, offset: event.offset, state: pack(state)});
      if (snapshots.length > MAX_SNAPSHOTS) {
        const kept = snapshots.filter((_, i) => i % 2 === 0);
        snapshots.length = 0; snapshots.push(...kept); step *= 2;
      }
      next = snapshots[snapshots.length - 1].time + step;
    }
    applySurfaceEvent(state, elements, event.op, event.payload);
    end = event.time;
  }
  return {elements, snapshots, end};
}

/**
 * The surface state at session time `time` (every event at or before it applied), `elements` × 4 bytes: rubber laid, loose
 * material, surface water, surface temperature. Before the first event every byte is 0.
 */
export function replaySurfaceAt(filePath: string, index: ReplaySurfaceIndex, time: number): Uint8Array {
  let at = -1;
  for (let i = 0; i < index.snapshots.length && index.snapshots[i].time <= time; i++) at = i;
  if (at < 0) return new Uint8Array(index.elements * SURFACE_CHANNELS);
  const snapshot = index.snapshots[at], state = unpack(snapshot);
  for (const event of readReplaySurfaceEvents(filePath, snapshot.offset)) {
    if (event.time > time) break;
    applySurfaceEvent(state, index.elements, event.op, event.payload);
  }
  return state;
}
