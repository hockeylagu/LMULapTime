import type { PitLaneEnds } from '../../../shared/domain/live/radio/field/fieldTrack.js';
import { getTrackDefinition } from '../../tracks/serverTrackSync.js';

type PitLaneTrack = {
  centerline: Array<[number, number]>;
  pitLane?: { centerline: Array<[number, number]> };
  timingGates?: { startFinish?: { stationM?: number } };
};
export type PitLaneLoader = (layoutKey: string) => PitLaneTrack | null;

/**
 * Metres along a closed centre line to the point on it nearest `point`, and the point's side of it: metres left
 * (positive) or right, as the track projection signs it (`server/tracks/trackProjection.ts`, ISO 8855).
 */
function stationOf(point: readonly [number, number], centerline: ReadonlyArray<readonly [number, number]>): { station: number; left: number } {
  let best = Infinity;
  let station = 0;
  let left = 0;
  let along = 0;
  for (let i = 0; i < centerline.length; i += 1) {
    const [ax, az] = centerline[i];
    const [bx, bz] = centerline[(i + 1) % centerline.length];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const share = length > 0 ? Math.min(1, Math.max(0, ((point[0] - ax) * dx + (point[1] - az) * dz) / (length * length))) : 0;
    const distance = Math.hypot(ax + share * dx - point[0], az + share * dz - point[1]);
    if (distance < best && length > 0) {
      best = distance;
      station = along + share * length;
      left = ((point[0] - ax) * -dz + (point[1] - az) * dx) / length;
    }
    along += length;
  }
  return { station, left };
}

/**
 * The layout's pit lane ends from the track package: its centre line's two ends projected onto the track's, the entry
 * the end the lane is driven from (the lane runs forward along the lap from it), and the side of the track it runs on
 * (most of its points). Null without a pit lane.
 */
export function layoutPitLane(layoutKey: string, load: PitLaneLoader = getTrackDefinition): PitLaneEnds | null {
  const track = load(layoutKey);
  const lane = track?.pitLane?.centerline;
  if (!track || !lane || lane.length < 3 || track.centerline.length < 3) return null;
  let lengthM = 0;
  for (let i = 0; i < track.centerline.length; i += 1) {
    const [ax, az] = track.centerline[i];
    const [bx, bz] = track.centerline[(i + 1) % track.centerline.length];
    lengthM += Math.hypot(bx - ax, bz - az);
  }
  if (lengthM <= 0) return null;
  const start = track.timingGates?.startFinish?.stationM ?? 0;
  const projected = lane.map(point => stationOf(point, track.centerline));
  const share = (station: number) => ((((station - start) % lengthM) + lengthM) % lengthM) / lengthM;
  // The lane's points in order: forward along the lap means its first point is the entry.
  const step = (from: number, to: number) => { const delta = to - from; return delta > 0.5 ? delta - 1 : delta < -0.5 ? delta + 1 : delta; };
  const shares = projected.map(point => share(point.station));
  const side = projected.filter(point => point.left > 0).length * 2 > projected.length ? 'left' : 'right';
  const forward = shares.slice(1).reduce((sum, value, index) => sum + step(shares[index], value), 0) > 0;
  const first = shares[0];
  const last = shares[shares.length - 1];
  return forward ? { entry: first, exit: last, side } : { entry: last, exit: first, side };
}
