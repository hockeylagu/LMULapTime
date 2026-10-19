import { expect, it } from 'vitest';
import fixture from '../../fixtures/live-timing/bahrain-outer-clock.json';
import { LiveLapTiming } from '../../../shared/domain/live/liveLapTiming.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

it('replays the recorded Bahrain clocks with changing estimates instead of distance-derived near-zero deltas', () => {
  const timing = new LiveLapTiming();
  let previousAnchor = 0;
  let previousLaps = 0;
  let lastLapTime = -1;
  const deltas: number[] = [];
  let atRecordedPoint: ReturnType<LiveLapTiming['timing']> = null;
  for (const [currentEt, lapStartEt, lapDist, totalLaps, sector, timeIntoLap] of fixture.samples) {
    // The fixture preserves source clocks/positions. Reconstruct completed durations from consecutive
    // line anchors; this is a deterministic timing replay, not a claim to reproduce original SSE delivery.
    if (totalLaps > previousLaps) lastLapTime = lapStartEt - previousAnchor;
    previousAnchor = lapStartEt;
    previousLaps = totalLaps;
    timing.update(scoringReading({ sessionCode: 1, trackName: 'Bahrain Outer', currentEt,
      trackLength: getCircuitSpecification('bahrain_outer').officialLengthMeters,
      player: vehicleReading({ totalLaps, lapStartEt, lapDist, sector: sector === 3 ? 0 : sector,
        lastLapTime, timeIntoLap, inPits: totalLaps === 0 }),
    }));
    const event = timing.timing();
    if (totalLaps >= 2 && event?.deltaSeconds != null) deltas.push(event.deltaSeconds);
    if (totalLaps === 4 && lapDist === 2987.881591796875) atRecordedPoint = event;
  }
  expect(deltas).toHaveLength(324);
  expect(Math.min(...deltas)).toBeLessThan(-1);
  expect(Math.max(...deltas)).toBeGreaterThan(4);
  expect(atRecordedPoint).toMatchObject({ lapElapsedSeconds: 62.342, deltaSeconds: 0.655,
    lapEstimate: { seconds: 74.674, source: 'distance' } });
});
