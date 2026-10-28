import { describe, expect, it } from 'vitest';
import { FORECAST_WAIT_SECONDS, LiveLearningCapture } from '../../../shared/domain/learning/capture.js';
import type { ResourceForecast } from '../../../shared/domain/learning/capture.js';
import type { LiveUsageObservation } from '../../../shared/types/liveAudit.js';
import { liveSnapshot, liveStrategy } from '../../helpers/liveSnapshot.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

const predictions: Record<'fuel' | 've', ResourceForecast> = {
  fuel: { perLap: 2, perLapSource: 'measured' }, ve: { perLap: 3, perLapSource: 'game' },
};
const empty: LiveUsageObservation = { fuel: null, ve: null };
/** The lap before lap 2 is measured: the forecast freezes at once. */
const lapOneMeasured: LiveUsageObservation = { fuel: { lap: 1, et: 99, amount: 2 }, ve: { lap: 1, et: 99, amount: 3 } };
function reading(et: number, lap = 2, start = 100) {
  return scoringReading({ currentEt: et, player: vehicleReading({ totalLaps: lap - 1, lapStartEt: start }) });
}
const snapshot = () => liveSnapshot({ strategy: liveStrategy() });

describe('durable learning capture', () => {
  it('freezes both predictions once and emits asynchronous measured outcomes independently', () => {
    const capture = new LiveLearningCapture();
    const frozen = capture.update('one', snapshot(), reading(100), predictions, lapOneMeasured)
      .filter(event => event.kind === 'learning-forecast');
    expect(frozen.map(event => event.kind)).toEqual(['learning-forecast', 'learning-forecast']);
    for (let et = 101; et < 200; et++) capture.update('one', snapshot(), reading(et),
      { fuel: { perLap: 99, perLapSource: 'measured' }, ve: predictions.ve }, empty);
    const fuel: LiveUsageObservation = { fuel: { lap: 2, et: 200, amount: 2.2 }, ve: null };
    const end = capture.update('one', snapshot(), reading(200, 3, 200), predictions, fuel);
    const measured = end.filter(event => event.kind === 'learning-outcome');
    expect(measured).toHaveLength(1);
    expect(measured[0].data).toMatchObject({ actual: 2.2, exclusions: [] });
    expect(frozen[0].data).toMatchObject({ predicted: 2 });
    const paired = { ...fuel, ve: { lap: 2, et: 200, amount: 3.1 } };
    const late = capture.update('one', snapshot(), reading(201, 3, 200), predictions, paired)
      .filter(event => event.kind === 'learning-outcome');
    expect(late).toHaveLength(1);
    expect(late[0].data).toMatchObject({ kind: 've', actual: 3.1 });
    expect(capture.update('one', snapshot(), reading(202, 3, 200), predictions, paired)).toEqual([]);
  });

  it('never manufactures a forecast when joining mid-lap, and separates recording attempts', () => {
    const capture = new LiveLearningCapture();
    expect(capture.update('one', snapshot(), reading(150), predictions, empty)).toEqual([]);
    expect(capture.update('two', snapshot(), reading(100), predictions, empty)).toHaveLength(0);
    expect(capture.update('two', snapshot(), reading(110), predictions, empty)).toHaveLength(2);
    expect(capture.update('two', snapshot(), reading(111), predictions, empty)).toHaveLength(0);
  });

  it('waits for the lap just ended before freezing (Silverstone race 2026-10-28, lap 19)', () => {
    // Laps 13-15 were tow laps (1.74, 1.74, 1.72 L); laps 16-18 used 1.81, 1.79, 1.82 L. At the line the meter still
    // read 1.77 L (laps 14-17); once lap 18 was measured it read 1.79 L, which the driver saw.
    const capture = new LiveLearningCapture();
    const lap18 = { fuel: { lap: 18, et: 1261.9, amount: 1.817 }, ve: { lap: 18, et: 1261.9, amount: 2.032 } };
    const stale = { fuel: { perLap: 1.77, perLapSource: 'measured' }, ve: { perLap: 1.97, perLapSource: 'measured' } } as const;
    const fresh = { fuel: { perLap: 1.79, perLapSource: 'measured' }, ve: { perLap: 2.01, perLapSource: 'measured' } } as const;
    const before = capture.update('one', snapshot(), reading(1262, 19, 1261.9), stale,
      { fuel: { lap: 17, et: 1198.2, amount: 1.793 }, ve: { lap: 17, et: 1198.2, amount: 2.001 } });
    expect(before.filter(event => event.kind === 'learning-forecast')).toEqual([]);
    const frozen = capture.update('one', snapshot(), reading(1263.5, 19, 1261.9), fresh, lap18)
      .filter(event => event.kind === 'learning-forecast');
    expect(frozen.map(event => event.data)).toMatchObject([{ kind: 'fuel', predicted: 1.79 }, { kind: 've', predicted: 2.01 }]);
  });

  it('freezes by the wait limit when the lap just ended has no measured use (pit or caution lap)', () => {
    const capture = new LiveLearningCapture();
    expect(capture.update('one', snapshot(), reading(105), predictions, empty)).toEqual([]);
    const frozen = capture.update('one', snapshot(), reading(100 + FORECAST_WAIT_SECONDS - 1), predictions, empty);
    expect(frozen.map(event => event.data)).toMatchObject([{ kind: 'fuel', forecastSeconds: 100 + FORECAST_WAIT_SECONDS - 1 }, { kind: 've' }]);
  });

  it('retains lap exclusion evidence across gaps, changing conditions, cautions and refuelling', () => {
    const capture = new LiveLearningCapture();
    capture.update('one', snapshot(), reading(100), predictions, { ...empty, fuelNowLitres: 50 });
    const changed = reading(110);
    changed.raining = 1;
    changed.gamePhase = 6;
    changed.player!.inPits = true;
    capture.update('one', snapshot(), changed, predictions, { ...empty, fuelNowLitres: 60 });
    const events = capture.update('one', snapshot(), reading(200, 3, 200), predictions,
      { fuel: { lap: 2, et: 200, amount: 2.2 }, ve: null });
    const outcome = events.find(event => event.kind === 'learning-outcome');
    expect(outcome?.data).toMatchObject({ exclusions: expect.arrayContaining([
      'capture-gap', 'resource-increased', 'context-changed', 'pit-lap', 'caution-or-start',
    ]) as unknown });
  });
});
