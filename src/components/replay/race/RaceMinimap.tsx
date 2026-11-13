import React, { useMemo, useSyncExternalStore } from 'react';
import type { RaceReplayOverview } from '../../../../shared/types/index.js';
import { racePitSlots } from '../../../../shared/domain/raceReplay/poseWindow.js';
import { GpsCircuitMinimap } from '../map/GpsCircuitMinimap.js';
import { useTrackBoundaryGeometry } from '../map/useTrackBoundaryGeometry.js';
import { activeTrackBounds } from '../map/display/mapLayers.js';
import { computeTrackBoundaryPathD, projectBoundaryPoints } from '../map/replayMapUtils.js';
import { racePositionsAt, windowBounds } from './RaceMapScene.js';
import { raceClassTone } from './raceClassTone.js';
import type { RaceClock } from './raceClock.js';
import type { RacePoseCache } from './racePoseCache.js';

interface Props {
  overview: RaceReplayOverview;
  clock: RaceClock;
  poses: RacePoseCache;
  followSlot: number | null;
}

/** The 3D view's minimap: the circuit with every car in its class colour, the followed one as the lap view's car marker. */
export const RaceMinimap: React.FC<Props> = ({ overview, clock, poses, followSlot }) => {
  const { timeSec } = useSyncExternalStore(clock.subscribe, clock.getState);
  const { trackGeometry } = useTrackBoundaryGeometry({ layoutKey: overview.layoutKey, trackVenue: overview.trackVenue, trackCourse: overview.trackCourse });
  const window = poses.windowAt(timeSec);
  const trackBounds = useMemo(() => activeTrackBounds(trackGeometry), [trackGeometry]);
  const carBounds = useMemo(() => (trackBounds ? null : windowBounds(window)), [trackBounds, window]);
  const bounds = trackBounds ?? carBounds;
  const pathD = useMemo(() => {
    if (!bounds || !trackGeometry) return undefined;
    const project = (points: typeof trackGeometry.centerline) => (points ? projectBoundaryPoints(points, bounds, 800, 60) : []);
    return computeTrackBoundaryPathD(project(trackGeometry.centerline), project(trackGeometry.leftBoundary), project(trackGeometry.rightBoundary));
  }, [bounds, trackGeometry]);
  const classes = useMemo(() => new Map(overview.cars.map(car => [car.slot, car.carClass])), [overview.cars]);
  const pitted = racePitSlots(window, timeSec);
  // Only the race's cars (the windows also carry the pace car); the followed one draws on top as the current car.
  const positions = racePositionsAt(window, timeSec, bounds).filter(position => classes.has(position.slot));
  const followed = positions.find(position => position.slot === followSlot);
  const cars = positions.filter(position => position !== followed).map(position => ({
    key: position.slot, sx: position.sx, sy: position.sy, color: raceClassTone(classes.get(position.slot)).hex, dimmed: pitted.has(position.slot),
  }));
  return <GpsCircuitMinimap trackBoundaryPathD={pathD} currentPos={followed} cars={cars}
    className="rounded-xl border border-lmu-border bg-lmu-strip/70 p-2" />;
};
