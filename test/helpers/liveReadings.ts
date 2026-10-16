import type { LiveScoringReading, LiveVehicleReading } from '../../shared/domain/live/liveLifecycle.js';

/** A scoring entry on a clean lap: sentinels (-1) for times the game has not set yet. */
export function vehicleReading(overrides: Partial<LiveVehicleReading> = {}): LiveVehicleReading {
  return {
    id: 3, place: 4, totalLaps: 7, vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3',
    lapDist: 500, sector: 1, lastLapTime: -1, bestLapTime: -1, lastSector1: -1, lastSector2: -1,
    bestSector1: -1, bestSector2: -1, curSector1: -1, curSector2: -1, bestLapSector1: -1, bestLapSector2: -1,
    lapStartEt: 100, timeIntoLap: 20, estimatedLapTime: 100, inPits: false, countLapFlag: 2,
    lapsBehindLeader: 0, finishStatus: 0,
    ...overrides,
  };
}

export function scoringReading(overrides: Partial<LiveScoringReading> = {}): LiveScoringReading {
  const player = vehicleReading();
  return {
    trackName: 'Circuit de la Sarthe', sessionCode: 10, currentEt: 120, endEt: 3600, maxLaps: 2147483647,
    numVehicles: 20, inRealtime: true, gamePhase: 5, trackLength: 10_000, trackTempC: 31.2, raining: 0, avgPathWetness: 0,
    player, leader: vehicleReading({ id: 1, place: 1 }),
    ...overrides,
  };
}
