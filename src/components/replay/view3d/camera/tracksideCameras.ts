import { Vector3 } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { nativeToScene } from '../scene/replayPose.js';

/**
 * TV-style spots: one every SPACING_M along the lap, each LEAD_M ahead of the start of the stretch it covers, so a shot follows the
 * car in from far, past the camera and away (driver, 2026-11-28: cuts every 160 m from either side of the road gave headaches).
 */
const SPACING_M = 320, LEAD_M = 200;
/**
 * Where a spot's camera may stand, in order of preference: metres beside the line and metres up, on the spot's side first and on
 * the other side only when every place there is blocked (`tracksideSight.ts`), so the cars keep crossing the screen one way. Raised
 * and back from the road, as a TV camera on a tower or bank: the view clears the barriers and the pan stays slow.
 */
const PLACEMENTS: ReadonlyArray<readonly [offsetM: number, heightM: number]> = [[30, 9], [45, 15], [22, 6], [65, 25]];
/** Where along its stretch a spot must see the car (shares of the stretch), and the car's height looked at, metres. */
const STRETCH_SHARES = [0.03, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.98], CAR_HEIGHT_M = 0.8;

/**
 * The side every spot prefers (1 left of travel, −1 right): the outside of the lap's loop, where a circuit's TV cameras stand.
 * The shoelace sign tells the loop's turn; left of travel is inside a loop turning left. A lap with no loop (a straight) keeps the left.
 */
function outsideSide(points: readonly ReplayTrajectoryPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area > 0 ? -1 : 1;
}

/**
 * Fixed trackside camera spots by lap station (scene coordinates). Each spot sits ahead of the stretch it covers, so the car drives
 * towards it and past; the next spot takes over once the car is through. Positions come from the recorded lap, not track furniture.
 */
export interface TracksideSpots {
  readonly count: number;
  /** The spot covering a lap station; −1 without spots. */
  indexAt(stationM: number): number;
  /** The spot's camera places, in order of preference (`PLACEMENTS`, the outside's first). */
  candidates(spot: number): readonly Vector3[];
  /** Points along the spot's stretch at the car's height: where a camera place must see the car. */
  stretch(spot: number): readonly Vector3[];
}

export function createTracksideCameras(points: ReplayTrajectoryPoint[], distances: number[], origin: Vector3): TracksideSpots {
  const total = distances[distances.length - 1] ?? 0;
  /** The sample at or after a station (its neighbours give the direction of travel). */
  const sampleAt = (stationM: number) => {
    let i = 1;
    while (i < points.length - 2 && distances[i] < stationM) i++;
    return i;
  };
  const places: Vector3[][] = [], stretches: Vector3[][] = [], outside = outsideSide(points);
  for (let at = LEAD_M; at < total && points.length > 2; at += SPACING_M) {
    const i = sampleAt(at), a = points[i - 1], b = points[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(length > 0)) { places.push(places[places.length - 1] ?? [new Vector3()]); }
    else {
      // Native +X is the car's left when travelling -Z; the left normal of (dx, dz) is (-dz, dx) in native axes.
      const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length, p = points[i];
      places.push([outside, -outside].flatMap(side => PLACEMENTS.map(([offset, height]) => new Vector3(...nativeToScene(
        {x: p.x + nx * offset * side, y: p.y + height, z: p.z + nz * offset * side}, origin)))));
    }
    const from = at - LEAD_M;
    stretches.push(STRETCH_SHARES.map(share => {
      const p = points[sampleAt(Math.min(total, from + share * SPACING_M))];
      return new Vector3(...nativeToScene({x: p.x, y: p.y + CAR_HEIGHT_M, z: p.z}, origin));
    }));
  }
  return {
    count: places.length,
    indexAt: stationM => (places.length ? Math.min(places.length - 1, Math.max(0, Math.floor(stationM / SPACING_M))) : -1),
    candidates: spot => places[spot] ?? [],
    stretch: spot => stretches[spot] ?? [],
  };
}
