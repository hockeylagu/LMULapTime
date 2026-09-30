import { describe, it, expect } from 'vitest';
import { boardLapTelemetryRef, boardLapToComparable } from '../../../../src/components/leaderboard/board/leaderboardLaps.js';
import { entry } from './leaderboardFixtures.js';

describe('boardLapToComparable', () => {
  it('gives the board lap the id the server gives the same lap, with its replay and times', () => {
    const lap = boardLapToComparable(entry(2, 'Rival', 100.5), 'LMGT3', 'P2 Rival');
    expect(lap).toMatchObject({
      id: 's-Rival_Rival_lap_3',
      driverName: 'Rival',
      carClass: 'LMGT3',
      lapNum: 3,
      lapTime: 100.5,
      lapTimeString: '1:40.500',
      matchingReplayFile: 'Rival.Vcr',
      isValid: true,
      tag: 'P2 Rival',
    });
  });
});

describe('boardLapTelemetryRef', () => {
  it('opens a lap from its replay, and cannot without one', () => {
    expect(boardLapTelemetryRef(entry(1, 'Rival', 100))).toEqual({
      replayName: 'Rival.Vcr', sessionId: 's-Rival', driverName: 'Rival', lapNum: 3,
    });
    const noReplay = entry(1, 'Rival', 100);
    noReplay.bestLap.replayName = null;
    expect(boardLapTelemetryRef(noReplay)).toBeNull();
  });
});
