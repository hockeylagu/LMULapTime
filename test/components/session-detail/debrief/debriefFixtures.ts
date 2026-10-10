import { vi } from 'vitest';
import type { ComparableLap, DetailedSession, DriverData, ReplayTrafficResponse, ReplayTrajectoryPoint } from '../../../../shared/types/index.js';

export const MY_REPLAY = 'Daytona International Speedway Road Course R1 10.Vcr';
export const REF_REPLAY = 'Daytona International Speedway Road Course Q1 7.Vcr';
export const ME = 'Samuel Lague';

/**
 * One corner lap: 200 km/h down to 100 at 70 m and back up (corner window 30-110 m, eight 10 m
 * steps). `stepSecInCorner` is the time per step through the corner; 0.3 s everywhere else.
 */
export function cornerLap(stepSecInCorner: number): ReplayTrajectoryPoint[] {
  const speeds = [100, 150, 200, 200, 180, 150, 100, 100, 150, 180, 200, 200, 180, 150, 100];
  let t = 0;
  return speeds.map((speedKmh, i) => {
    const distM = i * 10;
    t += distM > 30 && distM <= 110 ? stepSecInCorner : 0.3;
    return { x: distM, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: t } as ReplayTrajectoryPoint;
  });
}

function lap(lapNum: number, lapTime: number) {
  return { lapNum, lapTime, lapTimeString: '', position: 3, s1: null, s2: null, s3: null, topSpeed: null, fCompound: '', rCompound: '', isPitStop: false, isValid: true };
}

export const me = {
  name: ME,
  carType: 'Peugeot 9x8',
  carClass: 'Hyper',
  bestLapNum: 20,
  bestLapTime: 95.894,
  laps: [lap(1, 106.0), lap(16, 95.961), lap(18, 96.088), lap(20, 95.894)],
} as unknown as DriverData;

export const session = {
  id: 'R1',
  trackVenue: 'Daytona International Speedway',
  trackCourse: 'Road Course',
  matchingReplayFile: { name: MY_REPLAY, path: '', sizeBytes: 0 },
  drivers: [me],
} as unknown as DetailedSession;

export const referenceLap = {
  id: 'ref', sessionId: 'Q1', driverOrdinal: 0, lapOrdinal: 0, sessionType: 'Qualifying', dateString: '2026/08/05 13:23:53', driverName: 'Davide Catani',
  carType: 'Peugeot 9x8', carClass: 'Hyper', lapNum: 3, lapTime: 93.974, lapTimeString: '1:33.974',
  s1: null, s2: null, s3: null, topSpeed: null, isValid: true, matchingReplayFile: REF_REPLAY,
} as ComparableLap;

/**
 * A lap about 0.5% faster than the analysed 95.894 (target 95.415): the realistic reference.
 * It is 0.24 s faster than the analysed lap through the corner; Catani's lap is 0.4 s faster.
 */
export const realisticLap = {
  ...referenceLap, id: 'near', lapOrdinal: 1, driverName: 'Near Rival', lapNum: 5, lapTime: 95.41, lapTimeString: '1:35.410',
} as ComparableLap;

const NO_TRAFFIC: ReplayTrafficResponse = { available: false, reason: 'This layout has no track centreline to place the cars on.', laps: [] };

/** Serves comparable laps, session-addressed telemetry, and session traffic. */
export function mockDebriefServer(compareLaps: ComparableLap[] = [referenceLap], traffic: ReplayTrafficResponse = NO_TRAFFIC) {
  const stepByLocator: Record<string, number> = {
    'R1|3': 0.35, 'R1|1': 0.34, 'R1|2': 0.3, 'Q1|0': 0.3, 'Q1|1': 0.32,
  };
  const fetchMock = vi.fn((input: string) => {
    const url = decodeURIComponent(String(input));
    if (url.startsWith('/api/compare/laps')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ laps: compareLaps }) });
    }
    if (url.includes('/traffic?')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(traffic) });
    }
    const match = /\/api\/session\/([^/]+)\/telemetry\?/.exec(url);
    const params = new URLSearchParams(url.split('?')[1]);
    const sessionId = match?.[1];
    const lapOrdinal = params.get('lapOrdinal');
    const step = sessionId && lapOrdinal ? stepByLocator[`${sessionId}|${lapOrdinal}`] : undefined;
    if (step === undefined) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Lap not found' }) });
    const lapNumber = sessionId === 'R1' ? [1, 16, 18, 20][Number(lapOrdinal)] : [3, 5][Number(lapOrdinal)];
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionId, driverOrdinal: Number(params.get('driverOrdinal')), lapOrdinal: Number(lapOrdinal), replayName: sessionId === 'R1' ? MY_REPLAY : REF_REPLAY, currentLap: lapNumber, points: cornerLap(step) }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
