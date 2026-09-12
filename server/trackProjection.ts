import { ReplayTrajectoryPoint } from './types.js';

export interface CenterlineSpatialIndex {
  points: Array<[number, number]>;
  segmentLengths: number[];
  cumulativeStations: number[];
  tangents: Array<{ x: number; z: number }>;
  normals: Array<{ x: number; z: number }>;
  totalLengthM: number;
}

export interface ProjectedTrajectory {
  stations: number[];
  lateralOffsets: number[];
  trackLengthM: number;
}

/**
 * Pre-computes segment lengths, cumulative stations, unit tangents, and unit normals
 * for a closed 2D circuit centerline.
 */
export function buildCenterlineSpatialIndex(centerline: Array<[number, number]>): CenterlineSpatialIndex {
  const m = centerline.length;
  if (m < 2) {
    return {
      points: centerline,
      segmentLengths: [],
      cumulativeStations: [0],
      tangents: [],
      normals: [],
      totalLengthM: 0,
    };
  }

  const segmentLengths: number[] = [];
  const cumulativeStations: number[] = [0];
  const tangents: Array<{ x: number; z: number }> = [];
  const normals: Array<{ x: number; z: number }> = [];

  let runningDist = 0;
  for (let i = 0; i < m; i++) {
    const p1 = centerline[i];
    const p2 = centerline[(i + 1) % m];
    const dx = p2[0] - p1[0];
    const dz = p2[1] - p1[1];
    const len = Math.hypot(dx, dz) || 1e-6;

    segmentLengths.push(len);
    runningDist += len;
    if (i < m - 1) {
      cumulativeStations.push(runningDist);
    }

    const tx = dx / len;
    const tz = dz / len;
    tangents.push({ x: tx, z: tz });
    // Normal pointing to the right (+d = right, -d = left)
    normals.push({ x: tz, z: -tx });
  }

  return {
    points: centerline,
    segmentLengths,
    cumulativeStations,
    tangents,
    normals,
    totalLengthM: runningDist,
  };
}

/**
 * Projects raw trajectory points onto the canonical circuit centerline using an
 * O(1) amortized sliding-window local search with vehicle heading alignment.
 *
 * Coordinates:
 * - station (s): Curvilinear distance along centerline in meters [0, L_track].
 * - lateralOffset (d_perp): Signed distance in meters (+ = right of center, - = left of center).
 */
export function projectTrajectoryToCenterline(
  points: ReplayTrajectoryPoint[],
  centerline: Array<[number, number]> | CenterlineSpatialIndex
): ProjectedTrajectory {
  if (!points || points.length === 0) {
    return { stations: [], lateralOffsets: [], trackLengthM: 0 };
  }

  const index: CenterlineSpatialIndex = Array.isArray(centerline)
    ? buildCenterlineSpatialIndex(centerline)
    : centerline;

  const m = index.points.length;
  if (m < 2) {
    return {
      stations: points.map(() => 0),
      lateralOffsets: points.map(() => 0),
      trackLengthM: 0,
    };
  }

  const totalLength = index.totalLengthM;
  const stations: number[] = [];
  const lateralOffsets: number[] = [];

  // Helper to project point P onto segment k
  const projectOntoSegment = (
    px: number,
    pz: number,
    k: number
  ): { distSq: number; s: number; lateralOffset: number; t: number } => {
    const p1 = index.points[k];
    const len = index.segmentLengths[k];
    const tx = index.tangents[k].x;
    const tz = index.tangents[k].z;
    const nx = index.normals[k].x;
    const nz = index.normals[k].z;

    const wx = px - p1[0];
    const wz = pz - p1[1];

    // Projection scalar along tangent
    const dot = wx * tx + wz * tz;
    const t = Math.max(0, Math.min(len, dot));

    const projX = p1[0] + t * tx;
    const projZ = p1[1] + t * tz;
    const distSq = (px - projX) ** 2 + (pz - projZ) ** 2;

    const station = index.cumulativeStations[k] + t;
    const lateralOffset = wx * nx + wz * nz;

    return { distSq, s: station, lateralOffset, t: t / len };
  };

  let lastBestK = 0;

  // For the first point, perform global search prioritizing heading alignment
  let initialHeadingX = 0;
  let initialHeadingZ = 0;
  if (points.length > 1) {
    const dx = points[1].x - points[0].x;
    const dz = points[1].z - points[0].z;
    const hLen = Math.hypot(dx, dz);
    if (hLen > 0.05) {
      initialHeadingX = dx / hLen;
      initialHeadingZ = dz / hLen;
    }
  }

  let minGlobalDistSq = Infinity;
  // Start searching around segment 0 (the Start/Finish line)
  for (let k = 0; k < m; k++) {
    const proj = projectOntoSegment(points[0].x, points[0].z, k);
    let penalty = 0;
    if (initialHeadingX !== 0 || initialHeadingZ !== 0) {
      const headingDot = initialHeadingX * index.tangents[k].x + initialHeadingZ * index.tangents[k].z;
      if (headingDot < 0) {
        penalty = 10000; // Penalize opposite-direction track segments
      }
    }
    const score = proj.distSq + penalty;
    if (score < minGlobalDistSq) {
      minGlobalDistSq = score;
      lastBestK = k;
    }
  }

  // Sliding window search parameters:
  // Racing cars advance forward monotonically. We search in a local forward window
  // [-8, +30] segments around last best segment.
  const lookback = 8;
  const lookahead = 30;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    let bestProj: { distSq: number; s: number; lateralOffset: number; t: number } | null = null;
    let bestK = lastBestK;

    // Determine instantaneous heading from trajectory if available
    let headingX = 0;
    let headingZ = 0;
    if (i < points.length - 1) {
      const dx = points[i + 1].x - pt.x;
      const dz = points[i + 1].z - pt.z;
      const hLen = Math.hypot(dx, dz);
      if (hLen > 0.1) {
        headingX = dx / hLen;
        headingZ = dz / hLen;
      }
    } else if (i > 0) {
      const dx = pt.x - points[i - 1].x;
      const dz = pt.z - points[i - 1].z;
      const hLen = Math.hypot(dx, dz);
      if (hLen > 0.1) {
        headingX = dx / hLen;
        headingZ = dz / hLen;
      }
    }

    // Local sliding window search
    for (let offset = -lookback; offset <= lookahead; offset++) {
      const k = (((lastBestK + offset) % m) + m) % m;
      const proj = projectOntoSegment(pt.x, pt.z, k);

      // Verify heading alignment to prevent snapping across hairpins/parallel straights
      let headingPenalty = 0;
      if (headingX !== 0 || headingZ !== 0) {
        const dot = headingX * index.tangents[k].x + headingZ * index.tangents[k].z;
        if (dot < -0.2) {
          headingPenalty = 5000;
        }
      }

      const score = proj.distSq + headingPenalty;
      const isTie = bestProj && Math.abs(score - bestProj.distSq) < 1e-4;
      if (!bestProj || score < bestProj.distSq || (isTie && i === 0 && proj.s < bestProj.s)) {
        bestProj = { ...proj, distSq: score };
        bestK = k;
      }
    }

    // If local window didn't find a close segment (e.g. major teleport / pit cut), fallback to global search
    if (bestProj && bestProj.distSq > 2500) {
      for (let k = 0; k < m; k++) {
        const proj = projectOntoSegment(pt.x, pt.z, k);
        let headingPenalty = 0;
        if (headingX !== 0 || headingZ !== 0) {
          const dot = headingX * index.tangents[k].x + headingZ * index.tangents[k].z;
          if (dot < 0) headingPenalty = 10000;
        }
        const score = proj.distSq + headingPenalty;
        const isTie = Math.abs(score - bestProj.distSq) < 1e-4;
        if (score < bestProj.distSq || (isTie && i === 0 && proj.s < bestProj.s)) {
          bestProj = { ...proj, distSq: score };
          bestK = k;
        }
      }
    }

    lastBestK = bestK;

    let s = bestProj ? Math.max(0, Math.min(totalLength, bestProj.s)) : 0;
    // Round to millimeter precision
    s = Number(s.toFixed(2));
    const lat = bestProj ? Number(bestProj.lateralOffset.toFixed(2)) : 0;

    stations.push(s);
    lateralOffsets.push(lat);
  }

  // Ensure monotonicity around the start/finish seam for flying laps near the finish line
  for (let i = 1; i < stations.length; i++) {
    // If the car has progressed past 80% of the lap, do not let station wrap backwards prematurely
    if (i > points.length * 0.5 && stations[i - 1] > totalLength * 0.85 && stations[i] < totalLength * 0.15) {
      stations[i] = Number(totalLength.toFixed(2));
    }
  }

  return {
    stations,
    lateralOffsets,
    trackLengthM: Number(totalLength.toFixed(1)),
  };
}
