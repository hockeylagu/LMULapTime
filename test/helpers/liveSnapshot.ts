import type { LiveLapRecord, LiveSessionInfo, LiveSnapshot, LiveTiming } from '../../shared/types/live.js';

export const liveSession = (patch: Partial<LiveSessionInfo> = {}): LiveSessionInfo => ({
  kind: 'race', sessionCode: 10, gamePhase: 5, inRealtime: true, trackName: 'Circuit de la Sarthe', vehicleName: 'Ferrari 499P',
  vehicleClass: 'Hypercar', elapsedSeconds: 0, endSeconds: null, maxLaps: 26, playerLapsCompleted: 12, playerPlace: 3, ...patch,
});

/** A complete snapshot with every new field empty; override what a test is about. */
export const liveSnapshot = (patch: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  sequence: 1, receivedAt: 0, lifecycle: 'driving', paused: false, session: liveSession(),
  identity: null, lapsLeft: null, weather: null, recentLaps: [], sessionBest: null, ...patch,
});

export const liveLap = (lapNumber: number, lapSeconds: number | null, sectors: LiveLapRecord['sectors'], valid = true): LiveLapRecord => ({
  lapNumber, lapSeconds, sectors, valid,
});

export const liveTiming = (patch: Partial<LiveTiming> = {}): LiveTiming => ({
  lapNumber: 13, sector: 3, deltaSeconds: -0.184, sectorDeltas: [-0.12, -0.064, null], ...patch,
});
