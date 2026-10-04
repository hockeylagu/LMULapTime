import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../core/types.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { sampleTrackSurfaceProfile } from '../../shared/domain/trackGeometry.js';
import { projectTrajectoryToCenterline } from './trackProjection.js';
import { cutLapAtLine } from './lapLineCut.js';
import { TrackGeometryStore, type CachedTrackDefinition } from './trackGeometryStore.js';

import { dataPlugin } from '../plugins/dataPlugin.js';

const trackStore = new TrackGeometryStore(key=>dataPlugin.track(key)?.geometry??null);

/**
 * Loads and caches a track definition and its pre-computed spatial index by layoutKey.
 */
export function getTrackDefinition(layoutKey: string): CachedTrackDefinition | null {
  return trackStore.get(layoutKey);
}

/**
 * Enriches trajectory points with canonical centerline coordinates (stationM, lateralOffsetM)
 * and attaches timingGates and trackLengthM.
 *
 * If the circuit layout is not recognized or not available in the database, falls back to
 * cumulative Euclidean odometer distance with lateralOffsetM = 0 and synthetic timingGates.
 */
export function enrichTrajectoryWithTrackGeometry(
  trajectory: ReplayTrajectoryData,
  venue?: string | null,
  course?: string | null,
  replayName?: string | null,
  sceneDesc?: string | null,
  trackLengthMeters?: number | null
): ReplayTrajectoryData {
  if (!trajectory || !trajectory.points || trajectory.points.length === 0) {
    return trajectory;
  }

  // Serving must never rewrite retained samples, child laps, or four-corner channel arrays.
  trajectory = structuredClone(trajectory);

  const spec = getCircuitSpecification(venue, course, sceneDesc, replayName, null, trackLengthMeters);
  const resolvedKey = spec.layoutKey !== 'unknown' ? spec.layoutKey : null;
  const trackDef = resolvedKey ? getTrackDefinition(resolvedKey) : null;

  if (trackDef) {
    // Canonical projection branch
    applyCanonicalProjection(trajectory, trackDef);

    // Also enrich any allLapsData child trajectories if present
    if (Array.isArray(trajectory.allLapsData)) {
      for (const childLap of trajectory.allLapsData) {
        if (childLap && Array.isArray(childLap.points) && childLap.points.length > 0) {
          applyCanonicalProjection(childLap, trackDef);
        }
      }
    }
  } else {
    // Fallback branch: cumulative Euclidean odometer distance
    applyOdometerFallback(trajectory);

    if (Array.isArray(trajectory.allLapsData)) {
      for (const childLap of trajectory.allLapsData) {
        if (childLap && Array.isArray(childLap.points) && childLap.points.length > 0) {
          applyOdometerFallback(childLap);
        }
      }
    }
  }

  return trajectory;
}

export function applyCanonicalProjection(
  trajectory: ReplayTrajectoryData,
  trackDef: CachedTrackDefinition
): void {
  // A recorded cut is authoritative: after a route update its seam context may be gone.
  // Reprojection changes annotations only, never its XYZ, clocks, channels or sector frames.
  const leadIn = trajectory.leadInPoints ?? [];
  const samples = [...leadIn, ...trajectory.points, ...(trajectory.leadOutPoints ?? [])];
  const hasContext = leadIn.length > 0 || (trajectory.leadOutPoints?.length ?? 0) > 0;
  const alreadyAnnotated = trajectory.stationSource === 'track' || trajectory.projectionRevision !== undefined;
  const canCut = !trajectory.lineCut && !alreadyAnnotated && hasContext;
  // Wrapped stations locate a first cut; retained laps keep the existing seam continuity rule.
  const { stations, lateralOffsets } = projectTrajectoryToCenterline(samples, trackDef.spatialIndex, { clampSeam: !canCut });
  if (canCut) {
    const cut = cutLapAtLine(
      samples, stations, lateralOffsets, trackDef.spatialIndex.totalLengthM,
      leadIn.length, leadIn.length + trajectory.points.length - 1,
    );
    trajectory.points = cut.points;
    trajectory.lineCut = { start: cut.start, end: cut.end };
    trajectory.lineCutProjectionRevision = trackDef.projectionRevision;
    if (trajectory.sectors) {
      const shifted = (frame: number) => Math.max(0, Math.min(cut.points.length - 1, frame + cut.indexShift));
      trajectory.sectors = { s1Frame: shifted(trajectory.sectors.s1Frame), s2Frame: shifted(trajectory.sectors.s2Frame) };
    }
  } else {
    for (let i = 0; i < trajectory.points.length; i++) {
      trajectory.points[i].stationM = Number(stations[leadIn.length + i].toFixed(2));
      trajectory.points[i].lateralOffsetM = Number(lateralOffsets[leadIn.length + i].toFixed(2));
    }
    trajectory.lineCut ??= { start: 'none', end: 'none' };
    // Station zero remains anchored to the recorded timing line during the initial migration.
    if (trajectory.lineCut.start !== 'none') trajectory.points[0].stationM = 0;
    if (trajectory.lineCut.end !== 'none') trajectory.points[trajectory.points.length - 1].stationM =
      Number(trackDef.spatialIndex.totalLengthM.toFixed(2));
  }
  stripLapEdgeSamples(trajectory);

  const n = trajectory.points.length;
  let runningDist = 0;
  for (let i = 0; i < n; i++) {
    const pt = trajectory.points[i];
    if (i > 0) {
      const prev = trajectory.points[i - 1];
      const dx = pt.x - prev.x;
      const dz = pt.z - prev.z;
      const d = Math.hypot(dx, dz);
      runningDist += (d < 1000 ? d : 0);
    }
    pt.distM = Number(runningDist.toFixed(2));
    annotateRoadProfile(pt, trackDef);
  }

  trajectory.layoutKey = trackDef.layoutKey;
  trajectory.geometryRevision = trackDef.geometryRevision;
  trajectory.projectionRevision = trackDef.projectionRevision;
  trajectory.pointsCount = trajectory.points.length;
  // Use the centerline's measured closure length for station wrapping and cut endpoints;
  // published lengthM may use a different rounding precision.
  trajectory.trackLengthM = Number(trackDef.spatialIndex.totalLengthM.toFixed(2));
  trajectory.lapDistMeters = Number(runningDist.toFixed(2));
  trajectory.timingGates = trackDef.timingGates;
  trajectory.stationSource = 'track';
}

function annotateRoadProfile(point: ReplayTrajectoryPoint, definition: CachedTrackDefinition | null): void {
  if (!definition?.surfaceProfile) {
    delete point.leftRoadDistanceM;
    delete point.rightRoadDistanceM;
    delete point.roadElevationM;
    delete point.roadGradePct;
    delete point.roadBankDeg;
    delete point.leftKerbWidthM;
    delete point.rightKerbWidthM;
    delete point.leftKerbHeightM;
    delete point.rightKerbHeightM;
    delete point.leftKerbType;
    delete point.rightKerbType;
    return;
  }
  const profile = definition ? sampleTrackSurfaceProfile(definition, point.stationM ?? NaN) : null;
  const offset = point.lateralOffsetM;
  point.leftRoadDistanceM = profile?.leftWidthM != null && offset !== undefined ? profile.leftWidthM + offset : null;
  point.rightRoadDistanceM = profile?.rightWidthM != null && offset !== undefined ? profile.rightWidthM - offset : null;
  point.roadElevationM = profile?.elevationM ?? null;
  point.roadGradePct = profile?.gradePct ?? null;
  point.roadBankDeg = profile?.bankDeg ?? null;
  point.leftKerbWidthM = profile?.leftKerbWidthM ?? null;
  point.rightKerbWidthM = profile?.rightKerbWidthM ?? null;
  point.leftKerbHeightM = profile?.leftKerbHeightM ?? null;
  point.rightKerbHeightM = profile?.rightKerbHeightM ?? null;
  point.leftKerbType = profile?.leftKerbType ?? null;
  point.rightKerbType = profile?.rightKerbType ?? null;
}

/** Drops the server-internal recording either side of the lap (see ReplayTrajectoryData.leadInPoints). */
export function stripLapEdgeSamples(trajectory: ReplayTrajectoryData): void {
  delete trajectory.leadInPoints;
  delete trajectory.leadOutPoints;
}

function applyOdometerFallback(trajectory: ReplayTrajectoryData): void {
  stripLapEdgeSamples(trajectory);
  const points = trajectory.points;
  const n = points.length;
  let runningDist = 0;

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const prev = points[i - 1];
      const curr = points[i];
      const dx = curr.x - prev.x;
      const dz = curr.z - prev.z;
      const d = Math.hypot(dx, dz);
      runningDist += (d < 1000 ? d : 0);
    }
    const dist = Number(runningDist.toFixed(2));
    points[i].distM = dist;
    points[i].stationM = dist;
    points[i].lateralOffsetM = 0;
    annotateRoadProfile(points[i], null);
  }

  const totalLength = Number(runningDist.toFixed(2));
  trajectory.trackLengthM = totalLength;
  trajectory.lapDistMeters = totalLength;
  trajectory.layoutKey = undefined;
  trajectory.geometryRevision = undefined;
  trajectory.projectionRevision = undefined;
  trajectory.stationSource = 'odometer';
  trajectory.lineCut ??= { start: 'none', end: 'none' };

  // Build synthetic timingGates from sector frame markers or third-splits
  const s1Idx = trajectory.sectors?.s1Frame !== undefined && trajectory.sectors.s1Frame >= 0 && trajectory.sectors.s1Frame < n
    ? trajectory.sectors.s1Frame
    : Math.floor(n / 3);
  const s2Idx = trajectory.sectors?.s2Frame !== undefined && trajectory.sectors.s2Frame >= 0 && trajectory.sectors.s2Frame < n
    ? trajectory.sectors.s2Frame
    : Math.floor((2 * n) / 3);

  const p0 = points[0] || { x: 0, z: 0 };
  const pS1 = points[s1Idx] || points[0] || { x: 0, z: 0 };
  const pS2 = points[s2Idx] || points[n - 1] || { x: 0, z: 0 };

  const s1Station = points[s1Idx]?.stationM ?? Number((totalLength / 3).toFixed(2));
  const s2Station = points[s2Idx]?.stationM ?? Number(((2 * totalLength) / 3).toFixed(2));

  trajectory.timingGates = {
    startFinish: {
      name: 'Start/Finish',
      center: [p0.x, p0.z],
      left: [p0.x, p0.z],
      right: [p0.x, p0.z],
      stationM: 0,
    },
    sector1: {
      name: 'Sector 1',
      center: [pS1.x, pS1.z],
      left: [pS1.x, pS1.z],
      right: [pS1.x, pS1.z],
      stationM: s1Station,
    },
    sector2: {
      name: 'Sector 2',
      center: [pS2.x, pS2.z],
      left: [pS2.x, pS2.z],
      right: [pS2.x, pS2.z],
      stationM: s2Station,
    },
  };
}

/** Clear cache (useful for testing or hot reloads) */
export function clearTrackDefinitionCache(): void {
  trackStore.clear();
}
