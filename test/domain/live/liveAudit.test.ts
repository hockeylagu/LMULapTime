import { describe, expect, it } from 'vitest';
import { LiveAuditTracker } from '../../../shared/domain/live/liveAudit.js';
import type { LiveAuditRecord, LiveUsageObservation } from '../../../shared/types/liveAudit.js';
import { liveSession, liveSnapshot, liveStrategy } from '../../helpers/liveSnapshot.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

const empty: LiveUsageObservation = { fuel: null, ve: null };
function setup() {
  const records: LiveAuditRecord[] = [];
  let count = 0;
  const tracker = new LiveAuditTracker(() => `run-${++count}`, record => records.push(record));
  function update(et: number, lap: number, observation = empty, options: { wet?: boolean; start?: number; code?: number } = {}) {
    const reading = scoringReading({ currentEt: et, sessionCode: options.code ?? 10, raining: options.wet ? 1 : 0,
      player: vehicleReading({ totalLaps: lap, lapStartEt: options.start ?? et, vehicleName: 'Car' }) });
    const snapshot = liveSnapshot({ session: liveSession({ elapsedSeconds: et, playerLapsCompleted: lap, sessionCode: options.code ?? 10 }), strategy: liveStrategy() });
    tracker.update(snapshot, reading, observation, et * 1000);
    return snapshot;
  }
  return { tracker, records, update };
}

describe('immutable live strategy history', () => {
  it('compares the forecast from before the lap, not the updated rolling estimate', () => {
    const { records, update } = setup();
    const original = update(0, 0);
    original.strategy!.resource!.perLap = 99;
    update(120, 1, { ve: { lap: 1, et: 120, amount: 3 }, fuel: { lap: 1, et: 120, amount: 2.4 } });
    expect(records[0].snapshot.strategy?.resource?.perLap).toBe(2.5);
    expect(records[records.length - 1]?.comparison).toMatchObject({ lap: 1, predictedPerLap: 2.5, actualPerLap: 3, errorPerLap: 0.5, errorPercent: 20 });
    expect(records[records.length - 1]?.comparison?.actualRatio).toBeCloseTo(0.8);
  });

  it('waits for paired measurements and counts each lap only once', () => {
    const { records, update } = setup();
    update(0, 0);
    update(120, 1, { fuel: null, ve: { lap: 1, et: 120, amount: 3 } });
    expect(records[records.length - 1]?.comparison).toBeNull();
    const paired = { fuel: { lap: 1, et: 120, amount: 2.4 }, ve: { lap: 1, et: 120, amount: 3 } };
    update(121, 1, paired, { start: 120 });
    update(122, 1, { ...paired, fuel: { lap: 1, et: 120, amount: 2.5 } }, { start: 120 });
    expect(records.filter(record => record.comparison)).toHaveLength(1);
  });

  it('keeps partial captures but does not create retrospective or cross-condition comparisons', () => {
    const { records, update } = setup();
    update(50, 0, empty, { start: 0 });
    update(120, 1, { ve: { lap: 1, et: 120, amount: 3 }, fuel: { lap: 1, et: 120, amount: 2.4 } });
    expect(records[records.length - 1]?.comparison).toBeNull();
    update(180, 1, empty, { start: 120, wet: true });
    update(240, 2, { ve: { lap: 2, et: 240, amount: 3 }, fuel: { lap: 2, et: 240, amount: 2.4 } });
    expect(records[records.length - 1]?.comparison).toBeNull();
  });

  it('records event checkpoints only, finalises interrupted runs and separates restarts', () => {
    const { tracker, records, update } = setup();
    update(0, 0);
    // An unchanged session adds no periodic checkpoint, however long it runs.
    for (let et = 1; et <= 60; et++) update(et, 0, empty, { start: 0 });
    expect(records.map(record => record.reason)).toEqual(['start']);
    update(0, 0);
    expect(records.slice(-2).map(record => [record.reason, record.runId])).toEqual([['end', 'run-1'], ['start', 'run-2']]);
    tracker.update(liveSnapshot({ session: null, lifecycle: 'offline' }), null, empty, 20_000);
    expect(records[records.length - 1]?.reason).toBe('end');
    tracker.end(30_000);
    expect(records.filter(record => record.reason === 'end')).toHaveLength(2);
  });
});


it('checkpoints crossover changes immediately without logging every wetness fluctuation', () => {
  const { tracker, records } = setup();
  const snapshot = liveSnapshot({ strategy: liveStrategy() });
  const reading = scoringReading();
  snapshot.session!.playerLapsCompleted = reading.player!.totalLaps;
  tracker.update(snapshot, reading, empty, 0);
  snapshot.strategy!.crossover = { action: 'wets', compound: 'Wet', when: 'now', reason: 'slightly-wet', wetness: 0.125 };
  tracker.update(snapshot, reading, empty, 1000);
  expect(records.at(-1)).toMatchObject({ reason: 'settings', recordedAt: 1000, snapshot: { strategy: { crossover: { action: 'wets' } } } });
  const count = records.length;
  snapshot.strategy!.crossover!.wetness = 0.4;
  tracker.update(snapshot, reading, empty, 2000);
  expect(records).toHaveLength(count);
  snapshot.strategy!.crossover = null;
  tracker.update(snapshot, reading, empty, 3000);
  expect(records.at(-1)?.snapshot.strategy?.crossover).toBeNull();
  expect(records).toHaveLength(count + 1);
});
