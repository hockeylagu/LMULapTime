import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReplayTrajectoryData, TrackTimingGates } from './types.js';
import { resolveTrackLayoutKey } from '../src/utils/trackLayout.js';
import { buildCenterlineSpatialIndex, projectTrajectoryToCenterline, CenterlineSpatialIndex } from './trackProjection.js';

interface CachedTrackDefinition {
  layoutKey: string;
  lengthM: number;
  timingGates?: TrackTimingGates;
  centerline: Array<[number, number]>;
  spatialIndex: CenterlineSpatialIndex;
}

const trackCache = new Map<string, CachedTrackDefinition | null>();

function getTracksDir(): string {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidate = path.join(currentDir, 'data', 'tracks');
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // Fallback if import.meta.url is not available
  }
  return path.join(process.cwd(), 'server', 'data', 'tracks');
}

/**
 * Loads and caches a track definition and its pre-computed spatial index by layoutKey.
 */
export function getTrackDefinition(layoutKey: string): CachedTrackDefinition | null {
  if (trackCache.has(layoutKey)) {
    return trackCache.get(layoutKey) || null;
  }

  try {
    const tracksDir = getTracksDir();
    const filePath = path.join(tracksDir, `${layoutKey}.json`);
    if (!fs.existsSync(filePath)) {
      trackCache.set(layoutKey, null);
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.centerline || !Array.isArray(parsed.centerline) || parsed.centerline.length < 2) {
      trackCache.set(layoutKey, null);
      return null;
    }

    const spatialIndex = buildCenterlineSpatialIndex(parsed.centerline);
    const def: CachedTrackDefinition = {
      layoutKey,
      lengthM: parsed.lengthM || spatialIndex.totalLengthM,
      timingGates: parsed.timingGates,
      centerline: parsed.centerline,
      spatialIndex,
    };

    trackCache.set(layoutKey, def);
    return def;
  } catch (err) {
    console.warn(`[serverTrackSync] Failed to load track geometry for ${layoutKey}:`, err);
    trackCache.set(layoutKey, null);
    return null;
  }
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
  replayName?: string | null
): ReplayTrajectoryData {
  if (!trajectory || !trajectory.points || trajectory.points.length === 0) {
    return trajectory;
  }

  const resolvedKey = resolveTrackLayoutKey(venue, course, replayName);
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

function applyCanonicalProjection(
  trajectory: ReplayTrajectoryData,
  trackDef: CachedTrackDefinition
): void {
  const { stations, lateralOffsets } = projectTrajectoryToCenterline(
    trajectory.points,
    trackDef.spatialIndex
  );

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
    pt.stationM = Number((stations[i] ?? 0).toFixed(2));
    pt.lateralOffsetM = Number((lateralOffsets[i] ?? 0).toFixed(2));
  }

  trajectory.layoutKey = trackDef.layoutKey;
  trajectory.trackLengthM = Number(trackDef.lengthM.toFixed(2));
  trajectory.lapDistMeters = Number(runningDist.toFixed(2));
  trajectory.timingGates = trackDef.timingGates;
}

function applyOdometerFallback(trajectory: ReplayTrajectoryData): void {
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
  }

  const totalLength = Number(runningDist.toFixed(2));
  trajectory.trackLengthM = totalLength;
  trajectory.lapDistMeters = totalLength;
  trajectory.layoutKey = undefined;

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
  trackCache.clear();
}
