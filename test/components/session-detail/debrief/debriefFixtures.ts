import { vi } from 'vitest';
import type { ComparableLap, DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { clearLayoutCornersCache } from '../../../../src/api/cornerSequenceApi.js';
import type { CornerPass, CornerPassCar, CornerPassLap, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';

const MY_REPLAY = 'Daytona International Speedway Road Course R1 10.Vcr';
const REF_REPLAY = 'Daytona International Speedway Road Course Q1 7.Vcr';
export const ME = 'Samuel Lague';

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

const TURNS = [{ id: 1, label: 'T1', title: 'Turn 1', apexM: 70, startM: 30, endM: 110 }];

/** The class sequences (`?segments=sequences`): the Hyper map takes T1 and T2 together; a GT3 map's sequence 1 holds T1 alone. */
function sequences(hyperTurnIds = [1, 2]) {
  return [
    { id: 1, label: 'T1–T2', title: 'T1–T2', apexM: 70, startM: 30, endM: 110, sequence: { carClass: 'Hyper', turnIds: hyperTurnIds } },
    { id: 1, label: 'T1', title: 'T1', apexM: 70, startM: 30, endM: 90, sequence: { carClass: 'GT3', turnIds: [1] } },
  ];
}

/** Each passed lap's flags as the route serves them: a valid dry racing lap, unless `flags` says otherwise. */
function built(cars: CornerPassCar[], passes: CornerPass[], flags: Record<number, Partial<CornerPassLap>> = {}, turns = TURNS): SessionCornerPasses {
  const laps = passes.map((item): CornerPassLap => ({
    slot: item.slot, lapNumber: item.lapNumber, startSec: item.lapNumber * 100, endSec: item.lapNumber * 100 + 100,
    isValid: true, isPitStop: false, isOutLap: false, wet: false, ...(item.slot === 0 ? flags[item.lapNumber] : {}),
  }));
  return {
    available: true, layoutKey: 'daytona_road', startStationM: 0, trackLengthM: 5000,
    turns, cars, passes, laps, contacts: [],
  };
}

export interface DebriefServerOptions {
  /** The analysed driver's laps run with Vinicius Ares close in front through T1. */
  trafficLaps?: number[];
  /** The analysed driver's lap flags, by lap number (others are valid dry racing laps). */
  lapFlags?: Record<number, Partial<CornerPassLap>>;
  /** What the session's corner passes answer instead (e.g. not built). */
  passes?: SessionCornerPasses;
  /** What the sequence passes answer instead (e.g. no map for the class). */
  sequencePasses?: SessionCornerPasses;
  /** The turns the reference session's Hyper sequence 1 holds (its map grouped otherwise). */
  referenceTurnIds?: number[];
}

/** The corner passes of the two sessions: R1 (the driver, Enzo Syl when in the session, and a traffic car) and Q1 (the references). */
function sessionPasses(sessionId: string, trafficLaps: number[], lapFlags: Record<number, Partial<CornerPassLap>>, turns = TURNS): SessionCornerPasses {
  if (sessionId === 'Q1') {
    // Catani's lap 3 and the near rival's lap 5 are both under driver 0 (referenceLap, realisticLap).
    return built([{ slot: 0, name: 'Davide Catani', carClass: 'Hyper', sessionDriverOrdinal: 0 }], [pass(0, 3, 2.4), pass(0, 5, 2.56)], {}, turns);
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
    turns,
  );
}

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

/** Serves comparable laps, the sessions' corner passes, and the layout's corners. */
export function mockDebriefServer(compareLaps: ComparableLap[] = [referenceLap], options: DebriefServerOptions = {}) {
  clearLayoutCornersCache();
  const fetchMock = vi.fn((input: string) => {
    const url = decodeURIComponent(String(input));
    if (url.startsWith('/api/compare/laps')) return ok({ laps: compareLaps });
    const params = new URLSearchParams(url.split('?')[1] ?? '');
    const passesMatch = /\/api\/session\/([^/]+)\/corner-passes/.exec(url);
    if (passesMatch) {
      const bySequence = params.get('segments') === 'sequences';
      const turns = bySequence ? sequences(passesMatch[1] === 'Q1' ? options.referenceTurnIds : undefined) : TURNS;
      const all = (bySequence ? options.sequencePasses : undefined) ?? options.passes
        ?? sessionPasses(passesMatch[1], options.trafficLaps ?? [], options.lapFlags ?? {}, turns);
      const ordinal = params.get('driverOrdinal');
      if (!all.available || ordinal === null) return ok(all);
      const slot = all.cars.find(car => car.sessionDriverOrdinal === Number(ordinal))?.slot;
      return ok({ ...all, passes: all.passes.filter(item => item.slot === slot) });
    }
    // The lap view's corners for the driver's class: its map (a sequence before T1–T2, so T1–T2 is corner 2), else the turns.
    if (url.startsWith('/api/corner-sequences/layout?') && params.get('layoutKey') === 'daytona_road') {
      const noMap = options.sequencePasses && !options.sequencePasses.available;
      const map = [{ id: 9, label: 'T9', title: 'T9', apexM: 10, startM: 0, endM: 30, sequence: { carClass: 'Hyper', turnIds: [9] } }, sequences()[0]];
      return ok({ kind: noMap ? 'turns' : 'sequences', startStationM: 0, lengthM: 5000, corners: noMap ? TURNS : map });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Not found' }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
