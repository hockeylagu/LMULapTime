import { describe, it, expect } from 'vitest';
import { computeLapSegmentComparisons, CornerSegmentComparison } from '../../src/utils/cornerAnalysis.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../src/utils/lapAlignment.js';
import {
  buildEffectiveBaselinePoints,
  computePedalMarkerPoints,
  projectTrajectoryPoints,
} from '../../src/components/replay/map/replayMapUtils.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

// Straight road along +x where track station == x. Speed peaks at station 200 (corner entry),
// bottoms out at 300 (apex) and peaks again at 400 (exit).
const TRACK_LENGTH_M = 5000;
const speedAt = (s: number) => (s < 200 ? 150 + s * 0.5 : s < 300 ? 250 - (s - 200) * 1.5 : s < 400 ? 100 + (s - 300) * 1.5 : 250 - (s - 400));
// Brake ramps 6 %/m from the onset, so it crosses the 10% brake-on threshold 1.67 m after it.
const brakeAt = (s: number, onset: number) => (s >= onset && s < 300 ? Math.min(60, (s - onset) * 6) : 0);
// Throttle is lifted from the brake onset and ramps back 10 %/m from its own onset, so it
// crosses the 90% throttle-on threshold 9 m after it. A null brake onset = corner taken flat.
const throttleAt = (s: number, brakeOnset: number | null, throttleOnset: number) =>
  brakeOnset === null || s < brakeOnset ? 100 : s >= throttleOnset ? Math.min(100, (s - throttleOnset) * 10) : 0;

/**
 * `firstStation`: where the recording was trimmed (after the S/F line).
 * `lineLengthFactor`: own driven distance per metre of station (a longer/wider line > 1).
 */
function buildLap(
  firstStation: number,
  brakeOnsetStation: number | null,
  lineLengthFactor: number,
  throttleOnsetStation = 300
): ReplayTrajectoryPoint[] {
  const points: ReplayTrajectoryPoint[] = [];
  let timeSec = 0;
  for (let s = firstStation; s <= 450; s += 2) {
    if (points.length > 0) timeSec += 2 / (speedAt(s) / 3.6);
    points.push({
      x: s, y: 0, z: 0,
      stationM: s,
      distM: (s - firstStation) * lineLengthFactor,
      timeSec,
      speedKmh: speedAt(s),
      brake: brakeOnsetStation === null ? 0 : brakeAt(s, brakeOnsetStation),
      throttle: throttleAt(s, brakeOnsetStation, throttleOnsetStation),
      steerYaw: 0,
    });
  }
  return points;
}

// Primary: recorded from the line, brakes at station 200 (its own speed peak).
// Baseline: trimmed 11 m after the line, drives a 5% longer line, and brakes 10 m EARLIER
// (station 190) - before the primary's corner entry.
const primary = buildLap(0, 200, 1);
const baseline = buildLap(11, 190, 1.05);

describe('pedal point alignment between two laps', () => {
  it('expresses the baseline in the primary frame by track station, not its own drifting distance', () => {
    const own = getTrajectoryDistances(baseline, TRACK_LENGTH_M);
    const inPrimaryFrame = getDistancesInReferenceFrame(baseline, primary, TRACK_LENGTH_M);
    const k = baseline.findIndex(p => p.stationM === 201);
    expect(own[k]).toBeCloseTo(211.05, 1); // 5% longer line: 10 m of drift by station 201
    expect(inPrimaryFrame[k]).toBeCloseTo(201, 1);
  });

  it('reports brake points at the same physical spot as the telemetry channels, without clipping', () => {
    const corner = computeLapSegmentComparisons(primary, baseline, 6, TRACK_LENGTH_M)
      .find((s): s is CornerSegmentComparison => s.type === 'corner');
    if (!corner) throw new Error('expected a corner');

    expect(corner.entryDistM).toBe(200);
    expect(corner.primaryBrakingDistM).toBe(202); // 200 + 1.67
    // Braked before the primary's entry: found by looking back, not pinned to the window start.
    expect(corner.baselineBrakingDistM).toBe(192); // 190 + 1.67
    expect(corner.brakingPointDeltaM).toBe(10);
  });

  it('keeps the map baseline in the same frame, so its brake marker lands on the baseline brake point', () => {
    const effectiveBaseline = buildEffectiveBaselinePoints(baseline, TRACK_LENGTH_M);
    // The synthetic S/F point must not shift the baseline's own S/F-zeroed distances.
    expect(getTrajectoryDistances(effectiveBaseline, TRACK_LENGTH_M).slice(1)[0])
      .toBeCloseTo(getTrajectoryDistances(baseline, TRACK_LENGTH_M)[0], 1);

    const bounds = { minX: 0, maxX: 450, spanX: 450, minZ: -225, maxZ: 225, spanZ: 450 };
    const primarySvg = projectTrajectoryPoints(primary, bounds, 800, 60);
    const baselineSvg = projectTrajectoryPoints(effectiveBaseline, bounds, 800, 60);
    const [marker] = computePedalMarkerPoints(
      true,
      [{ cornerNumber: 1, distM: 192, kind: 'brake', isBaseline: true }],
      getTrajectoryDistances(primary, TRACK_LENGTH_M),
      getDistancesInReferenceFrame(effectiveBaseline, primary, TRACK_LENGTH_M),
      primarySvg,
      baselineSvg,
      effectiveBaseline
    );
    const [expected] = projectTrajectoryPoints([{ x: 192, y: 0, z: 0 }], bounds, 800, 60);
    expect(marker.sx).toBeCloseTo(expected.sx, 1);
    expect(marker.sy).toBeCloseTo(expected.sy, 1);
  });

  it("reports throttle pick-up where it happens, even before the other lap's apex", () => {
    // Primary picks up the throttle at its apex (station 300); the baseline is back on it 20 m
    // earlier (station 280), before the primary's apex where the throttle window opens.
    const earlyThrottleBaseline = buildLap(11, 190, 1.05, 280);
    const corner = computeLapSegmentComparisons(primary, earlyThrottleBaseline, 6, TRACK_LENGTH_M)
      .find((s): s is CornerSegmentComparison => s.type === 'corner');
    if (!corner) throw new Error('expected a corner');

    expect(corner.minDistM).toBe(300);
    expect(corner.primaryThrottleOnDistM).toBe(309); // 300 + 9
    expect(corner.baselineThrottleOnDistM).toBe(289); // 280 + 9, not pinned to the apex
    expect(corner.throttleOnDeltaM).toBe(20);
    expect(corner.baselineInitialThrottleDistM).toBe(282); // 15% at 280 + 1.5
  });

  it('keeps throttle-on at the apex for a corner taken flat, instead of reaching into the straight', () => {
    const flatBaseline = buildLap(11, null, 1.05);
    const corner = computeLapSegmentComparisons(primary, flatBaseline, 6, TRACK_LENGTH_M)
      .find((s): s is CornerSegmentComparison => s.type === 'corner');
    if (!corner) throw new Error('expected a corner');

    expect(corner.baselineBrakingDistM).toBeNull();
    expect(corner.baselineThrottleOnDistM).toBe(corner.minDistM);
  });
});
