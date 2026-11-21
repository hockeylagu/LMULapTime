import { vi } from 'vitest';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import type { CornerHabit, SessionCornerAnalysis } from '../../../../shared/types/corners/cornerAnalysis.js';
import { clearLayoutCornersCache } from '../../../../src/api/cornerApi.js';

export const ME = 'Ann Driver';

function lap(lapNumber: number, lapTime: number) {
  return { lapNumber, lapTime, position: 3, s1: null, s2: null, s3: null, topSpeed: null, fCompound: '', rCompound: '', isPitStop: false, isValid: true };
}

/** The player, driver 0: stored laps 0–3 are laps 1, 16, 18 and 20. */
export const me = {
  name: ME,
  driverOrdinal: 0,
  carType: 'Car A',
  carClass: 'Hyper',
  laps: [lap(1, 106.0), lap(16, 95.961), lap(18, 96.088), lap(20, 95.894)],
} as unknown as DriverData;

export const session = {
  id: 'R1',
  sessionType: 'Race',
  trackVenue: 'Test Circuit',
  trackCourse: 'GP',
  matchingReplayFile: { name: 'Test Circuit R1.Vcr', path: '', fileSizeBytes: 0 },
  playerDriver: me,
  drivers: [me],
} as unknown as DetailedSession;

const habit = (cornerId: number, turnId: number, line: string, extra: Partial<CornerHabit> = {}): CornerHabit => ({
  cornerId, turnId, turnLabel: `T${turnId}`, half: 'in', lossSec: 0.12, sameCarLossSec: null, rule: 'brakeEarly', gap: 10,
  speeds: { minKmh: 96, targetMinKmh: 100, exitKmh: 150, targetExitKmh: 150 }, kind: null, arc: null, action: null, otherActions: [], causes: [],
  repeatability: 0.75, confidence: 1, priority: 0.09, line, detail: 'Apex 96 km/h, target 96 km/h', ...extra,
});

const reference = { sessionId: 'R1', driverOrdinal: 2, name: 'Bob Quick', car: 'Car B', laps: 8 };
const since = { sessionId: 'P1', timestamp: Date.UTC(2026, 9, 21, 12), sessionType: 'Practice', driverOrdinal: 1 };

/** T2: 4 km/h slower at the slowest point on a tighter arc; the apex is the thing to try. */
const overSlowing = habit(5, 2, 'Carry 4 km/h more through T2', {
  rule: 'overSlowing', gap: 4, repeatability: 1, kind: 'tighterArc', arc: { radiusM: 80, targetRadiusM: 87, latG: 0.9, targetLatG: 0.9 },
  detail: 'Apex 96 km/h, target 100 km/h · tighter arc (80 m radius against 87 m)',
  action: { type: 'reachInside', gap: 1.2, line: 'Get closer to the inside at the apex' },
  causes: [{ type: 'brakeLonger', gap: 0.4, line: 'braking 0.4 s longer' }, { type: 'coast', gap: 0.2, line: '0.2 s more coasting' }],
});
/** T4: the brake point is its own action. */
const brakeEarly = habit(9, 4, 'Brake 10 m later into T4', { action: { type: 'brakeLater', gap: 10, line: 'Brake 10 m later' } });

/**
 * Corner 5 (the second on the lap) holds T1 and T2; corner 9 holds T4. Bob is the layout's target, in another car.
 * The focus is T1–T2 by the rules and T4 by the driver's pin; T7 left the focus lately.
 */
export const analysis: SessionCornerAnalysis = {
  sessionId: 'R1', layoutKey: 'test_gp', carClass: 'Hyper', car: 'Car A', driverOrdinal: 0, laps: 3,
  corners: [
    { id: 5, label: 'SQ2', name: 'T1–T2', turnIds: [1, 2], usualSec: 8.2, usualLapOrdinal: 2, lossSec: 0.2, reference: { ...reference, usualSec: 8, usualLapOrdinal: 6 } },
    { id: 9, label: 'T4', name: 'T4', turnIds: [4], usualSec: 5.1, usualLapOrdinal: 1, lossSec: 0.1, reference: { ...reference, usualSec: 5, usualLapOrdinal: 4 } },
  ],
  target: { ...reference, paceSec: 95 },
  sameCarReference: { sessionId: 'R1', driverOrdinal: 1, name: 'Cy Same', car: 'Car A', laps: 6 },
  habits: [overSlowing, brakeEarly],
  unexplained: [habit(9, 4, 'Losing time into T4: no clear cause', { rule: null, lossSec: 0.08 })],
  carDifferences: [habit(9, 4, 'the car', { half: 'out' })],
  mistakes: [
    { lapOrdinal: 1, cornerId: 5, turnId: 1, turnLabel: 'T1', lossSec: 0.2, cause: 'lockup', line: 'T1 +0.20 s: a lockup' },
    { lapOrdinal: 3, cornerId: 9, turnId: 4, turnLabel: 'T4', lossSec: 0.6, cause: 'traffic', line: 'T4 +0.60 s: traffic' },
    { lapOrdinal: 2, cornerId: 5, turnId: 2, turnLabel: 'T2', lossSec: 0.15, cause: null, line: 'T2 +0.15 s' },
    { lapOrdinal: 3, cornerId: 5, turnId: 2, turnLabel: 'T2', lossSec: 0.3, cause: 'slowExit', line: 'T2 +0.30 s: 5 km/h slower out' },
  ],
  measures: [],
  focus: {
    sessions: 4,
    corners: [
      { cornerId: 5, name: 'T1–T2', pinTurnId: 1, pinned: false, habit: overSlowing, costSec: 0.2, slipping: false },
      { cornerId: 9, name: 'T4', pinTurnId: 4, pinned: true, habit: brakeEarly, costSec: 0.1, slipping: true },
    ],
    progress: [
      {
        cornerId: 5, name: 'T1–T2', state: 'focus', slipping: false, since, costThenSec: 0.31, costNowSec: 0.2,
        costs: [0.31, 0.27, 0.24, 0.2],
        gap: { rule: 'overSlowing', turnLabel: 'T2', unit: 'km/h', before: 7, now: 4 },
        tried: { action: 'reachInside', turnLabel: 'T2', did: 'got a little closer to the inside at the apex', moved: 0.8, costChangeSec: -0.06, worked: true },
        view: { lapOrdinal: 2, thenLapOrdinal: 5 },
      },
      {
        cornerId: 3, name: 'T7', state: 'left', slipping: false, since, costThenSec: 0.15, costNowSec: 0.16, costs: [0.15, 0.16],
        gap: { rule: 'brakeEarly', turnLabel: 'T7', unit: 'm', before: 12, now: 2 }, tried: null, view: null,
      },
    ],
  },
  goal: { benchmarkSec: 95, percent: 102.3, level: 'Good', next: { level: 'Competitive', maxPercent: 101.5, toFindSec: 0.76 } },
};

/** The lap view's corners for the class: corner 3 starts the lap, then 5, then 9. */
export const layout = {
  kind: 'sequences', startStationM: 0, lengthM: 5000,
  corners: [{ id: 9, startM: 900 }, { id: 3, startM: 100 }, { id: 5, startM: 400 }],
};

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

/** Serves the session's corner analysis (or `analysisStatus` with an error), the layout's corners, a strategy and the unpin. */
export function mockWatchServer(analysisStatus = 200, body: unknown = analysis) {
  clearLayoutCornersCache();
  const fetchMock = vi.fn((input: string, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/session/R1/corner-analysis')) return analysisStatus === 200 ? json(body) : json({ error: 'Session summaries are rebuilding' }, analysisStatus);
    if (url.startsWith('/api/corners?')) return json(layout);
    if (url.startsWith('/api/session/R1/strategy')) return json({ strategy: null, plan: null });
    if (url === '/api/habit-focus/unpin') return json({ pinned: false });
    return json({ error: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
