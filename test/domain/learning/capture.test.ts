import { describe, expect, it } from 'vitest';
import { LiveLearningCapture } from '../../../shared/domain/learning/capture.js';
import type { ResourceForecast } from '../../../shared/domain/learning/capture.js';
import type { LiveUsageObservation } from '../../../shared/types/liveAudit.js';
import { liveSnapshot, liveStrategy } from '../../helpers/liveSnapshot.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

const predictions: Record<'fuel' | 've', ResourceForecast> = {
  fuel: { perLap: 2, perLapSource: 'measured' }, ve: { perLap: 3, perLapSource: 'game' },
};
const empty: LiveUsageObservation = { fuel: null, ve: null };
function reading(et: number, lap = 2, start = 100) {
  return scoringReading({ currentEt: et, player: vehicleReading({ totalLaps: lap - 1, lapStartEt: start }) });
}
const snapshot = () => liveSnapshot({ strategy: liveStrategy() });

describe('durable learning capture', () => {
  it('freezes both predictions once and emits asynchronous measured outcomes independently', () => {
    const capture = new LiveLearningCapture();
    const frozen = capture.update('one', snapshot(), reading(100), predictions, empty);
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
    const late = capture.update('one', snapshot(), reading(201, 3, 200), predictions, paired);
    expect(late).toHaveLength(1);
    expect(late[0].data).toMatchObject({ kind: 've', actual: 3.1 });
    expect(capture.update('one', snapshot(), reading(202, 3, 200), predictions, paired)).toEqual([]);
  });

  it('never manufactures a forecast when joining mid-lap, and separates recording attempts', () => {
    const capture = new LiveLearningCapture();
    expect(capture.update('one', snapshot(), reading(150), predictions, empty)).toEqual([]);
    expect(capture.update('two', snapshot(), reading(100), predictions, empty)).toHaveLength(2);
    expect(capture.update('two', snapshot(), reading(101), predictions, empty)).toHaveLength(0);
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
    ]) });
  });
});
