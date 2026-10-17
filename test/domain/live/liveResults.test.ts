import { describe, expect, it } from 'vitest';
import { LiveResultTracker } from '../../../shared/domain/live/liveResults.js';
import { deriveLiveState } from '../../../shared/domain/live/liveLifecycle.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';
import { liveLap, liveStrategy } from '../../helpers/liveSnapshot.js';

describe('live result summaries', () => {
  it('retains qualifying through loading and delayed layout resolution, but clears for a new practice cycle', () => {
    const tracker = new LiveResultTracker();
    const quali = scoringReading({ sessionCode: 5, currentEt: 301, endEt: 300, gamePhase: 8,
      allDriversFinished: true, player: vehicleReading({ finishStatus: 1 }) });
    const done = tracker.update(quali, deriveLiveState(quali, 'driving'), null, null, null, 'bahrain_wec');
    expect(done.qualifyingResult?.settled).toBe(true);
    tracker.update(quali, deriveLiveState(quali, 'finished', 'loading'), null, null, null, null);
    const race = scoringReading({ sessionCode: 10, currentEt: 0, inRealtime: false });
    const update = (layout: string | null) => tracker.update(race, deriveLiveState(race, 'loading'), null, null, null, layout);
    expect(update(null).qualifyingResult).toEqual(done.qualifyingResult);
    expect(update('bahrain_wec').qualifyingResult).toEqual(done.qualifyingResult);
    const practice = scoringReading({ sessionCode: 1, currentEt: 0, inRealtime: false });
    expect(tracker.update(practice, deriveLiveState(practice, 'garage'), null, null, null, 'bahrain_wec').qualifyingResult).toBeNull();
  });

  it('clears qualifying on leaving the event even when the game retains its scoring buffer', () => {
    const tracker = new LiveResultTracker();
    const frame = scoringReading({ sessionCode: 5, gamePhase: 8, player: vehicleReading({ finishStatus: 1 }) });
    tracker.update(frame, deriveLiveState(frame, 'driving'), null, null, null, null);
    tracker.update(frame, deriveLiveState(frame, 'finished', 'menu'), null, null, null, null);
    const race = scoringReading({ sessionCode: 10, currentEt: 500 });
    expect(tracker.update(race, deriveLiveState(race, 'menu'), null, null, null, null).qualifyingResult).toBeNull();
  });
  it('settles qualifying only after timer expiry and the complete field finishes', () => {
    const tracker = new LiveResultTracker();
    const frame = scoringReading({ sessionCode: 5, currentEt: 299, endEt: 300, gamePhase: 8,
      allDriversFinished: true, player: vehicleReading({ finishStatus: 1 }) });
    const update = () => tracker.update(frame, deriveLiveState(frame, 'garage'), null, null, null, 'bahrain_wec');
    expect(update().qualifyingResult?.settled).toBe(false);
    frame.currentEt = 300; frame.allDriversFinished = false;
    expect(update().qualifyingResult?.settled).toBe(false);
    frame.allDriversFinished = null;
    expect(update().qualifyingResult?.settled).toBe(false);
    frame.allDriversFinished = true;
    expect(update().qualifyingResult?.settled).toBe(true);
    frame.allDriversFinished = null;
    expect(update().qualifyingResult?.settled).toBe(true);
  });

  it('records the player final qualifying lap while the field is still finishing', () => {
    const tracker = new LiveResultTracker();
    const frame = scoringReading({ sessionCode: 5, currentEt: 300, endEt: 300, gamePhase: 8,
      allDriversFinished: false, player: vehicleReading({ totalLaps: 2, finishStatus: 0 }) });
    const update = (lap: number) => tracker.update(frame, deriveLiveState(frame, 'driving'), liveLap(lap, 100, [30,30,40]), null, null, 'bahrain_wec');
    expect(update(2).result).toMatchObject({ settled: false, cleanLaps: 1 });
    frame.currentEt = 330; frame.player = vehicleReading({ totalLaps: 3, finishStatus: 1 });
    expect(update(3).result).toMatchObject({ settled: false, cleanLaps: 2 });
    frame.allDriversFinished = true;
    expect(update(3).result).toMatchObject({ settled: true, cleanLaps: 2 });
  });
  it('keeps recording the player final lap after the overall leader takes the flag', () => {
    const tracker = new LiveResultTracker();
    const frame = scoringReading({ gamePhase: 8, player: vehicleReading({ totalLaps: 10, finishStatus: 0 }) });
    expect(tracker.update(frame, deriveLiveState(frame,'driving'), liveLap(10,100,[30,30,40]), null, liveStrategy(), null).result).toBeNull();
    frame.currentEt += 100;
    frame.player = vehicleReading({ totalLaps: 11, finishStatus: 1 });
    expect(tracker.update(frame, deriveLiveState(frame,'driving'), liveLap(11,102,[30,30,42]), null, liveStrategy(), null).result).toMatchObject({ cleanLaps: 2, cleanAverage: 101 });
  });
  it('keeps only clean captured laps, freezes at the flag and carries qualifying into race preparation', () => {
    const tracker = new LiveResultTracker();
    const reading = (et: number, laps: number, sessionCode = 5, finishStatus = 0) => scoringReading({ currentEt: et, endEt: sessionCode === 5 ? 300 : 3600, allDriversFinished: finishStatus > 0, sessionCode, gamePhase: finishStatus ? 8 : 5,
      playerClassPlace: 2, player: vehicleReading({ totalLaps: laps, finishStatus, pitStops: 1 }) });
    const update = (et: number, laps: number, valid: boolean, sessionCode = 5, finishStatus = 0) => {
      const frame = reading(et, laps, sessionCode, finishStatus);
      return tracker.update(frame, deriveLiveState(frame, 'driving'), laps > 0 ? liveLap(laps, laps === 1 ? 100 : 102, [30,30,40], valid) : null,
        { lapSeconds: 100, lapSectors: [30,30,40], bestSectors: [30,30,40], bestPossibleSeconds: 100 }, liveStrategy(), 'bahrain_wec');
    };
    update(0,0,true); update(100,1,true); update(200,2,false);
    const done = update(300,3,true,5,1);
    expect(done.result).toMatchObject({ classPlace: 2, cleanAverage: 101, cleanLaps: 2, completeHistory: true, pitStops: 1 });
    expect(update(400,4,true,5,1).result).toEqual(done.result);
    const race = update(0,0,true,10);
    expect(race.result).toBeNull();
    expect(race.qualifyingResult).toEqual(done.result);
    const other = reading(0,0,10);
    expect(tracker.update(other, deriveLiveState(other,'garage'), null, null, null, 'bahrain_outer').qualifyingResult).toBeNull();
  });
  it('marks a mid-session capture partial and clears results on game close', () => {
    const tracker = new LiveResultTracker();
    const frame = scoringReading({ gamePhase: 8, player: vehicleReading({ totalLaps: 7, finishStatus: 1 }) });
    expect(tracker.update(frame, deriveLiveState(frame,'driving'), liveLap(7,100,[30,30,40]), null, null, null).result).toMatchObject({ completeHistory: false, cleanLaps: 1, cleanAverage: 100 });
    expect(tracker.update(null, { lifecycle: 'offline', paused: false, session: null }, null, null, null, null)).toEqual({ result: null, qualifyingResult: null });
  });
});
