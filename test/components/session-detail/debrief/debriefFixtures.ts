import { vi } from 'vitest';
import type { ComparableLap, DetailedSession, DriverData, ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import type { CornerPass, CornerPassCar, CornerPassLap, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';

export const MY_REPLAY = 'Daytona International Speedway Road Course R1 10.Vcr';
export const REF_REPLAY = 'Daytona International Speedway Road Course Q1 7.Vcr';
export const ME = 'Samuel Lague';

/**
 * The analysed lap as telemetry: 200 km/h down to 100 at 70 m and back up (the detected corner 1 runs
 * 30-110 m), on stations equal to its distance so the official turn at 70 m falls in it.
 */
function cornerLap(): ReplayTrajectoryPoint[] {
  const speeds = [100, 150, 200, 200, 180, 150, 100, 100, 150, 180, 200, 200, 180, 150, 100];
  return speeds.map((speedKmh, i) => ({ x: i * 10, y: 0, z: 0, stationM: i * 10, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: i * 0.3 }));
}

function lap(lapNumber: number, lapTime: number) {
  return { lapNumber, lapTime, position: 3, s1: null, s2: null, s3: null, topSpeed: null, fCompound: '', rCompound: '', isPitStop: false, isValid: true };
}

export const me = {
  name: ME,
  carType: 'Peugeot 9x8',
  carClass: 'Hyper',
  bestLapNumber: 20,
  bestLapTime: 95.894,
  laps: [lap(1, 106.0), lap(16, 95.961), lap(18, 96.088), lap(20, 95.894)],
} as unknown as DriverData;

export const session = {
  id: 'R1',
  trackVenue: 'Daytona International Speedway',
  trackCourse: 'Road Course',
  matchingReplayFile: { name: MY_REPLAY, path: '', fileSizeBytes: 0 },
  drivers: [me],
} as unknown as DetailedSession;

export const referenceLap = {
  id: 'ref', sessionId: 'Q1', driverOrdinal: 0, lapOrdinal: 0, sessionType: 'Qualifying', timeString: '2026/08/05 13:23:53', driverName: 'Davide Catani',
  carType: 'Peugeot 9x8', carClass: 'Hyper', lapNumber: 3, lapTime: 93.974,
  s1: null, s2: null, s3: null, topSpeed: null, isValid: true, matchingReplayFile: REF_REPLAY,
} as ComparableLap;

/**
 * A lap about 0.5% faster than the analysed 95.894 (target 95.415): the realistic reference.
 * It is 0.24 s faster than the analysed lap through T1; Catani's lap is 0.4 s faster.
 */
export const realisticLap = {
  ...referenceLap, id: 'near', lapOrdinal: 1, driverName: 'Near Rival', lapNumber: 5, lapTime: 95.41,
} as ComparableLap;

/** T1 (30-110 m) on the lap: the analysed lap 20 takes 2.8 s, laps 16 and 18 2.72 and 2.4 s. */
function pass(slot: number, lapNumber: number, sec: number, extra: Partial<CornerPass> = {}): CornerPass {
  const entrySec = lapNumber * 100;
  return {
    slot, lapNumber, segment: 1, entrySec, minSpeedSec: entrySec + sec / 2, exitSec: entrySec + sec,
    entrySpeedKmh: 200, minSpeedKmh: 100, exitSpeedKmh: 180, minSpeedM: 70, brakeM: 40, turnInM: 50, throttleM: 80,
    aheadSlot: null, aheadGapSec: null, behindSlot: null, behindGapSec: null, ...extra,
  };
}

/** Each passed lap's flags as the route serves them: a valid dry racing lap, unless `flags` says otherwise. */
function built(cars: CornerPassCar[], passes: CornerPass[], flags: Record<number, Partial<CornerPassLap>> = {}): SessionCornerPasses {
  const laps = passes.map((item): CornerPassLap => ({
    slot: item.slot, lapNumber: item.lapNumber, startSec: item.lapNumber * 100, endSec: item.lapNumber * 100 + 100,
    isValid: true, isPitStop: false, isOutLap: false, wet: false, ...(item.slot === 0 ? flags[item.lapNumber] : {}),
  }));
  return {
    available: true, layoutKey: 'daytona_road', startStationM: 0, trackLengthM: 5000,
    turns: [{ id: 1, label: 'T1', title: 'Turn 1', apexM: 70, startM: 30, endM: 110 }],
    cars, passes, laps, contacts: [],
  };
}

export interface DebriefServerOptions {
  /** The analysed driver's laps run with Vinicius Ares close in front through T1. */
  trafficLaps?: number[];
  /** The analysed driver's lap flags, by lap number (others are valid dry racing laps). */
  lapFlags?: Record<number, Partial<CornerPassLap>>;
  /** What the session's corner passes answer instead (e.g. not built). */
  passes?: SessionCornerPasses;
}

/** The corner passes of the two sessions: R1 (the driver, Enzo Syl when in the session, and a traffic car) and Q1 (the references). */
function sessionPasses(sessionId: string, trafficLaps: number[], lapFlags: Record<number, Partial<CornerPassLap>>): SessionCornerPasses {
  if (sessionId === 'Q1') {
    // Catani's lap 3 and the near rival's lap 5 are both under driver 0 (referenceLap, realisticLap).
    return built([{ slot: 0, name: 'Davide Catani', sessionDriverOrdinal: 0 }], [pass(0, 3, 2.4), pass(0, 5, 2.56)]);
  }
  const close = (lapNumber: number) => (trafficLaps.includes(lapNumber) ? { aheadSlot: 2, aheadGapSec: 0.4 } : {});
  return built(
    [
      { slot: 0, name: ME, carClass: 'Hyper', sessionDriverOrdinal: 0 },
      { slot: 1, name: 'Enzo Syl', carClass: 'Hyper', sessionDriverOrdinal: 1 },
      { slot: 2, name: 'Vinicius Ares', carClass: 'Hyper' },
    ],
    [
      pass(0, 16, 2.72, close(16)), pass(0, 18, 2.4, close(18)), pass(0, 20, 2.8, close(20)),
      pass(1, 2, 2.6), pass(1, 3, 2.5),
      ...trafficLaps.map(lapNumber => pass(2, lapNumber, 2.8, { entrySec: lapNumber * 100 - 0.4 })),
    ],
    lapFlags,
  );
}

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

/** Serves comparable laps, the sessions' corner passes, and the analysed lap's telemetry. */
export function mockDebriefServer(compareLaps: ComparableLap[] = [referenceLap], options: DebriefServerOptions = {}) {
  const fetchMock = vi.fn((input: string) => {
    const url = decodeURIComponent(String(input));
    if (url.startsWith('/api/compare/laps')) return ok({ laps: compareLaps });
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const passesMatch = /\/api\/session\/([^/]+)\/corner-passes/.exec(url);
    if (passesMatch) {
      const all = options.passes ?? sessionPasses(passesMatch[1], options.trafficLaps ?? [], options.lapFlags ?? {});
      const ordinal = params.get('driverOrdinal');
      if (!all.available || ordinal === null) return ok(all);
      const slot = all.cars.find(car => car.sessionDriverOrdinal === Number(ordinal))?.slot;
      return ok({ ...all, passes: all.passes.filter(item => item.slot === slot) });
    }
    if (url.startsWith('/api/session/R1/telemetry?') && params.get('lapOrdinal') === '3') {
      return ok({ sessionId: 'R1', driverOrdinal: 0, lapOrdinal: 3, replayName: MY_REPLAY, currentLap: 20, stationSource: 'track', geometryRevision: 'synthetic-canonical-track-v1', points: cornerLap() });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Not found' }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
