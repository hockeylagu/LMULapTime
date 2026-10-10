import { describe, it, expect } from 'vitest';
import { boardLapTelemetryRef, boardLapToComparable } from '../../../../src/components/leaderboard/board/leaderboardLaps.js';
import { entry } from './leaderboardFixtures.js';

describe('boardLapToComparable', () => {
  it('gives the board lap the id the server gives the same locator, with its times', () => {
    const lap = boardLapToComparable(entry(2, 'Rival', 100.5), 'LMGT3', 'P2 Rival');
    expect(lap).toMatchObject({
      id: 's-Rival_driver_2_lap_4',
      driverName: 'Rival',
      carClass: 'LMGT3',
      lapNum: 3,
      lapTime: 100.5,
      lapTimeString: '1:40.500',
      isValid: true,
      tag: 'P2 Rival',
    });
  });
});

describe('boardLapTelemetryRef', () => {
  it('opens a lap from its stable session and source-order locator', () => {
    expect(boardLapTelemetryRef(entry(1, 'Rival', 100))).toEqual({
      sessionId: 's-Rival', driverOrdinal: 2, lapOrdinal: 4, driverName: 'Rival', lapNum: 3,
    });
    const noRecording = entry(1, 'Rival', 100);
    noRecording.bestLap.telemetryAvailable = false;
    expect(boardLapTelemetryRef(noRecording)).not.toBeNull();
    const noLocator = entry(1, 'Rival', 100);
    delete noLocator.bestLap.driverOrdinal;
    expect(boardLapTelemetryRef(noLocator)).toBeNull();
  });
});
