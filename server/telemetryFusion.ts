import { DuckDbLapTelemetry, ReplayTrajectoryData, ReplayTrajectoryPoint } from './types.js';

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
  const vcrPoints = vcrTrajectory.points;
  if (!vcrPoints || vcrPoints.length === 0) {
    return {
      ...vcrTrajectory,
      source: 'duckdb',
      duckdbFilename,
      points: duckLap.points,
      pointsCount: duckLap.points.length,
    };
  }

  const vcrMaxTime = vcrPoints[vcrPoints.length - 1].timeSec || duckLap.lapTimeSec;
  const duckPoints = duckLap.points;
  const fusedPoints: ReplayTrajectoryPoint[] = [];

  let vcrIdx = 0;

  for (let i = 0; i < duckPoints.length; i++) {
    const dp = duckPoints[i];
    const t = dp.timeSec ?? 0;

    // Advance vcrIdx so that vcrPoints[vcrIdx].timeSec <= t <= vcrPoints[vcrIdx + 1].timeSec
    while (vcrIdx < vcrPoints.length - 2 && (vcrPoints[vcrIdx + 1].timeSec ?? 0) < t) {
      vcrIdx++;
    }

    const p0 = vcrPoints[vcrIdx];
    const p1 = vcrPoints[vcrIdx + 1] || p0;
    const t0 = p0.timeSec ?? 0;
    const t1 = p1.timeSec ?? vcrMaxTime;

    const span = t1 - t0;
    const alpha = span > 0.0001 ? Math.max(0, Math.min(1, (t - t0) / span)) : 0;

    const x = p0.x + alpha * (p1.x - p0.x);
    const y = p0.y + alpha * (p1.y - p0.y);
    const z = p0.z + alpha * (p1.z - p0.z);
    const rotX = p0.rotX !== undefined && p1.rotX !== undefined ? p0.rotX + alpha * (p1.rotX - p0.rotX) : p0.rotX;
    const rotY = p0.rotY !== undefined && p1.rotY !== undefined ? p0.rotY + alpha * (p1.rotY - p0.rotY) : p0.rotY;
    const rotZ = p0.rotZ !== undefined && p1.rotZ !== undefined ? p0.rotZ + alpha * (p1.rotZ - p0.rotZ) : p0.rotZ;

    fusedPoints.push({
      ...dp,
      brakeTemps: dp.brakeTemps ?? p0.brakeTemps,
      suspPos: dp.suspPos ?? p0.suspPos,
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
      p.suspPos !== undefined ||
      p.tirePressures !== undefined ||
      p.tireWear !== undefined ||
      p.tireTemps !== undefined
  );

  return {
    ...vcrTrajectory,
    source: 'duckdb',
    duckdbFilename,
    points: fusedPoints,
    pointsCount: fusedPoints.length,
    rawSampleRateHz: duckLap.sampleRateHz,
    wheelTelemetryAvailable: Boolean(vcrTrajectory.wheelTelemetryAvailable || hasWheelData),
  };
}
