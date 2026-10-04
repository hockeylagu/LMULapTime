import { describe, expect, it } from 'vitest';
import { computeBaselineChartSamples, computeLapComparisons } from '../../../src/utils/replayComparison.js';
import { getMonotonicStations } from '../../../src/utils/lapAlignment.js';
import { LAP_PAIRS, loadLapPair } from './lapPairFixture.js';

const BRAKE_ON = 10;

/** Stations where the brake goes past BRAKE_ON %, interpolated between the two samples. */
function brakeOnsets(stations: number[], brake: number[]): number[] {
  const onsets: number[] = [];
  for (let i = 1; i < brake.length; i++) {
    if (brake[i - 1] < BRAKE_ON && brake[i] >= BRAKE_ON) {
      const t = (BRAKE_ON - brake[i - 1]) / (brake[i] - brake[i - 1]);
      onsets.push(stations[i - 1] + t * (stations[i] - stations[i - 1]));
    }
  }
  return onsets;
}

if (process.env.LMU_PERSONAL_FIXTURES) describe.each(LAP_PAIRS)('%s: baseline traces in compare mode', name => {
  const { primary, baseline, trackLengthM } = loadLapPair(name);
  const axis = getMonotonicStations(primary.points, trackLengthM);
  const baselineStations = getMonotonicStations(baseline.points, trackLengthM);
  const samples = computeBaselineChartSamples(primary.points, baseline.points, trackLengthM, axis);

  it('draws every baseline sample at its own track station', () => {
    const inRange = baselineStations.filter(s => s >= axis[0] && s <= axis[axis.length - 1]);
    expect(samples).toHaveLength(inRange.length);
    samples.forEach((sample, k) => expect(sample.distance).toBeCloseTo(inRange[k], 6));
  });

  it("puts each baseline brake application where that lap has it, not where the primary's samples fall", () => {
    const own = brakeOnsets(baselineStations, baseline.points.map(p => p.brake ?? 0));
    const drawn = brakeOnsets(samples.map(s => s.distance), samples.map(s => s.point.brake));
    expect(drawn).toHaveLength(own.length);
    drawn.forEach((s, k) => expect(Math.abs(s - own[k])).toBeLessThan(0.01));

    // Read at the primary's samples (the previous drawing) they moved, up to 2.3 m at 2 m spacing.
    const comparisons = computeLapComparisons(primary.points, baseline.points, trackLengthM);
    const resampled = brakeOnsets(axis, comparisons.map(c => c.baseline.brake));
    const worst = Math.max(...own.map(s => Math.min(...resampled.map(r => Math.abs(r - s)))));
    expect(worst).toBeGreaterThan(0.01);
  });
});

else describe.skip('Private recording regressions',()=>{it('requires LMU_PERSONAL_FIXTURES',()=>{});});
