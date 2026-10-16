import type { LiveLapRecord, LiveSessionInfo, LiveSnapshot, LiveTiming } from '../../shared/types/live.js';
import type { LiveStrategy } from '../../shared/types/liveStrategy.js';

export const liveSession = (patch: Partial<LiveSessionInfo> = {}): LiveSessionInfo => ({
  kind: 'race', sessionCode: 10, gamePhase: 5, inRealtime: true, trackName: 'Circuit de la Sarthe', vehicleName: 'Ferrari 499P',
  vehicleClass: 'Hypercar', elapsedSeconds: 0, endSeconds: 1200, playerLapsCompleted: 12, playerPlace: 3, ...patch,
});

/** A complete snapshot with every new field empty; override what a test is about. */
export const liveSnapshot = (patch: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  sequence: 1, receivedAt: 0, lifecycle: 'driving', paused: false, session: liveSession(),
  identity: null, lapsLeft: null, weather: null, recentLaps: [], sessionBest: null,
  loadingProgress: null, strategy: null, ...patch,
});

export const liveLap = (lapNumber: number, lapSeconds: number | null, sectors: LiveLapRecord['sectors'], valid = true): LiveLapRecord => ({
  lapNumber, lapSeconds, sectors, valid,
});

export const liveTiming = (patch: Partial<LiveTiming> = {}): LiveTiming => ({
  lapNumber: 13, sector: 3, lapElapsedSeconds: 88.4, sectors: [null, null, null], deltaSeconds: -0.184, sectorDeltas: [-0.12, -0.064, null], ...patch,
});

/** A GT3 race strategy mid-stint: 62% VE at 2.5%/lap measured, pit in 6 laps; override what a test is about. */
export const liveStrategy = (patch: Partial<LiveStrategy> = {}): LiveStrategy => ({
  resource: {
    kind: 've', unit: '%', amount: 62, capacity: 100, perLap: 2.5, perLapSource: 'measured', lapsMeasured: 5,
    reserveLaps: 0.5, lapsInTank: 24.3,
    race: { finishReachable: false, atFinish: null, pitInLaps: 6, pitLap: 19, sparePerLap: 0.2, neededAfterStop: 38, neededStopNow: 58, stopsAfterNext: 0 },
  },
  pit: {
    state: 'none', penalties: 0, serviceSeconds: 34, serviceMaxSeconds: 41, penaltySeconds: null,
    mfd: { resourceValue: 50, resourceText: '50% 20 laps', tyres: 'New Medium', repair: 'N/A' },
  },
  damage: null,
  tyres: { compound: 'Medium', worst: 0.91, worstCorner: 'FR', wearPerLap: 0.004, newSets: 52 },
  forecast: null,
  garage: null,
  ...patch,
});
