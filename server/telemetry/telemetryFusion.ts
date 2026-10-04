import { DuckDbLapTelemetry, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../core/types.js';

const POINT_GEOMETRY_FIELDS = [
  'stationM', 'lateralOffsetM', 'leftRoadDistanceM', 'rightRoadDistanceM',
  'roadElevationM', 'roadGradePct', 'roadBankDeg', 'leftKerbWidthM', 'rightKerbWidthM',
  'leftKerbHeightM', 'rightKerbHeightM', 'leftKerbType', 'rightKerbType',
] as const satisfies readonly (keyof ReplayTrajectoryPoint)[];

/** New fused samples need their own projection; source annotations describe different points. */
function withoutPointGeometry(point: ReplayTrajectoryPoint): ReplayTrajectoryPoint {
  const copy = { ...point };
  for (const key of POINT_GEOMETRY_FIELDS) delete copy[key];
  return copy;
}

function withoutTrajectoryGeometry(trajectory: ReplayTrajectoryData): ReplayTrajectoryData {
  const copy = { ...trajectory };
  for (const key of [
    'geometryRevision', 'projectionRevision', 'lineCut', 'lineCutProjectionRevision',
    'stationSource', 'trackLengthM', 'timingGates', 'lapDistMeters',
  ] as const) delete copy[key];
  return copy;
}

/**
 * Normalizes an angle difference in radians to the range [-pi, pi].
 */
export function unwrapAngle(rad: number): number {
  let diff = rad;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

/**
 * Shortest-arc linear interpolation of angles in radians.
 * Prevents swinging 180 degrees through zero when crossing the [-pi, pi] wrap boundary.
 */
export function interpolateAngle(a0: number, a1: number, alpha: number): number {
  const diff = unwrapAngle(a1 - a0);
  return unwrapAngle(a0 + alpha * diff);
}

/**
 * VCR time at which the DuckDB lap clock starts: VCR samples carry session time, DuckDB samples
 * lap time. Explicit lap-relative recordings keep their clock. Retained native replay rows
 * without clock metadata use their first recorded sample, independent of the lap's duration.
 */
export function vcrLapBaseTime(trajectory: ReplayTrajectoryData): number {
  return trajectory.timeReference === 'lap' ? 0 : trajectory.lapStartTimeSec ?? trajectory.points[0]?.timeSec ?? 0;
}

/**
 * Fuses native 100 Hz DuckDB telemetry channels (pedals, steering, speed, RPM,
 * gear, 4-wheel dynamics) with the VCR replay trajectory's 2D world coordinates
 * (x, y, z, yaw) to provide pristine driving inputs with an intact GPS track map.
 */
export function fuseDuckDbWithVcrTrajectory(
  duckLap: DuckDbLapTelemetry,
  vcrTrajectory: ReplayTrajectoryData,
  duckdbFilename?: string
): ReplayTrajectoryData {
  const source = { ...withoutTrajectoryGeometry(vcrTrajectory), timeReference: 'lap' as const, lapStartTimeSec: undefined };
  const vcrPoints = vcrTrajectory.points;
  if (!vcrPoints || vcrPoints.length === 0) {
    return {
      ...source,
      source: 'duckdb',
      duckdbFilename,
      points: duckLap.points.map(withoutPointGeometry),
      pointsCount: duckLap.points.length,
      leadInPoints: undefined,
      leadOutPoints: undefined,
    };
  }

  const vcrBaseTime = vcrLapBaseTime(vcrTrajectory);
  const vcrMaxTime =
    ((vcrPoints[vcrPoints.length - 1].timeSec ?? duckLap.lapTimeSec) - vcrBaseTime) || duckLap.lapTimeSec;
  const duckPoints = duckLap.points;
  const fusedPoints: ReplayTrajectoryPoint[] = [];

  let vcrIdx = 0;

  const mapVcrFrameToDuckIndex = (vcrFrame: number): number => {
    const vcrPoint = vcrPoints[Math.max(0, Math.min(vcrPoints.length - 1, vcrFrame))];
    const targetTime = (vcrPoint?.timeSec ?? 0) - vcrBaseTime;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < duckPoints.length; i++) {
      const distance = Math.abs((duckPoints[i].timeSec ?? 0) - targetTime);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return bestIndex;
  };

  for (let i = 0; i < duckPoints.length; i++) {
    const dp = duckPoints[i];
    const t = dp.timeSec ?? 0;

    // Advance vcrIdx so that vcrPoints[vcrIdx].timeSec <= t <= vcrPoints[vcrIdx + 1].timeSec
    while (
      vcrIdx < vcrPoints.length - 2 &&
      ((vcrPoints[vcrIdx + 1].timeSec ?? 0) - vcrBaseTime) < t
    ) {
      vcrIdx++;
    }

    const p0 = vcrPoints[vcrIdx];
    const p1 = vcrPoints[vcrIdx + 1] || p0;
    const t0 = (p0.timeSec ?? 0) - vcrBaseTime;
    const t1 = (p1.timeSec ?? (vcrMaxTime + vcrBaseTime)) - vcrBaseTime;

    const span = t1 - t0;
    const alpha = span > 0.0001 ? Math.max(0, Math.min(1, (t - t0) / span)) : 0;

    const x = p0.x + alpha * (p1.x - p0.x);
    const y = p0.y + alpha * (p1.y - p0.y);
    const z = p0.z + alpha * (p1.z - p0.z);
    const rotX = p0.rotX !== undefined && p1.rotX !== undefined ? interpolateAngle(p0.rotX, p1.rotX, alpha) : p0.rotX;
    const rotY = p0.rotY !== undefined && p1.rotY !== undefined ? interpolateAngle(p0.rotY, p1.rotY, alpha) : p0.rotY;
    const rotZ = p0.rotZ !== undefined && p1.rotZ !== undefined ? interpolateAngle(p0.rotZ, p1.rotZ, alpha) : p0.rotZ;

    fusedPoints.push({
      ...withoutPointGeometry(dp),
      brakeTemps: dp.brakeTemps ?? p0.brakeTemps,
      rideHeight: dp.rideHeight,
      fuel: dp.fuel ?? p0.fuel,
      virtualEnergy: dp.virtualEnergy ?? p0.virtualEnergy,
      soc: dp.soc ?? p0.soc,
      regenRate: dp.regenRate ?? p0.regenRate,
      x: parseFloat(x.toFixed(3)),
      y: parseFloat(y.toFixed(3)),
      z: parseFloat(z.toFixed(3)),
      rotX: rotX !== undefined ? parseFloat(rotX.toFixed(3)) : undefined,
      rotY: rotY !== undefined ? parseFloat(rotY.toFixed(3)) : undefined,
      rotZ: rotZ !== undefined ? parseFloat(rotZ.toFixed(3)) : undefined,
    });
  }

  const hasWheelData = fusedPoints.some(
    (p) =>
      p.wheelSpeeds !== undefined ||
      p.brakeTemps !== undefined ||
      p.rideHeight !== undefined ||
      p.tirePressures !== undefined ||
      p.tireWear !== undefined ||
      p.tireTemps !== undefined
  );

  const hasEnergyData = fusedPoints.some(
    (p) =>
      p.fuel !== undefined ||
      p.virtualEnergy !== undefined ||
      p.soc !== undefined ||
      p.regenRate !== undefined
  );

  // The VCR recording either side of the lap, on the DuckDB lap clock, so the fused lap can be
  // cut at the line too (positions are what matters there; the inputs are the VCR ones).
  const firstDuckTime = fusedPoints[0]?.timeSec ?? 0;
  const lastDuckTime = fusedPoints[fusedPoints.length - 1]?.timeSec ?? 0;
  const onDuckClock = (edge: ReplayTrajectoryPoint[] | undefined, keep: (t: number) => boolean) => {
    const retimed = (edge ?? [])
      .map(p => ({ ...withoutPointGeometry(p), timeSec: Number(((p.timeSec ?? 0) - vcrBaseTime).toFixed(3)) }))
      .filter(p => keep(p.timeSec));
    return retimed.length > 0 ? retimed : undefined;
  };

  return {
    ...source,
    source: 'duckdb',
    duckdbFilename,
    points: fusedPoints,
    leadInPoints: onDuckClock(vcrTrajectory.leadInPoints, t => t < firstDuckTime),
    leadOutPoints: onDuckClock(vcrTrajectory.leadOutPoints, t => t > lastDuckTime),
    pointsCount: fusedPoints.length,
    rawPointsCount: fusedPoints.length,
    rawSampleRateHz: duckLap.sampleRateHz,
    isFullResolution: true,
    wheelTelemetryAvailable: Boolean(vcrTrajectory.wheelTelemetryAvailable || hasWheelData),
    energyTelemetryAvailable: Boolean(vcrTrajectory.energyTelemetryAvailable || hasEnergyData),
    sectors: vcrTrajectory.sectors
      ? {
          s1Frame: mapVcrFrameToDuckIndex(vcrTrajectory.sectors.s1Frame),
          s2Frame: mapVcrFrameToDuckIndex(vcrTrajectory.sectors.s2Frame),
        }
      : undefined,
  };
}
