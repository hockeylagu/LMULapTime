import { vi } from 'vitest';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import type { CornerHabit, SessionCornerAnalysis } from '../../../../shared/types/corners/cornerAnalysis.js';
import { clearLayoutCornersCache } from '../../../../src/api/cornerSequenceApi.js';

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

const habit = (turnId: number, line: string, extra: Partial<CornerHabit> = {}): CornerHabit => ({
  cornerId: 5, turnId, turnLabel: `T${turnId}`, half: 'in', lossSec: 0.12, sameCarLossSec: null, rule: 'brakeEarly', gap: 10,
  repeatability: 0.75, confidence: 1, priority: 0.09, line, detail: '', ...extra,
});

const reference = { sessionId: 'R1', driverOrdinal: 2, name: 'Bob Quick', car: 'Car B', sameSession: true, laps: 8 };

/** Corner 5 (the second on the lap) holds T1 and T2; corner 9 holds T4. Bob is the session's reference in another car. */
export const analysis: SessionCornerAnalysis = {
  sessionId: 'R1', layoutKey: 'test_gp', carClass: 'Hyper', driverOrdinal: 0, laps: 3,
  corners: [
    { id: 5, label: 'SQ2', name: 'T1–T2', turnIds: [1, 2], usualSec: 8.2, usualLapOrdinal: 2, lossSec: 0.2, reference: { ...reference, usualSec: 8, usualLapOrdinal: 6 } },
    { id: 9, label: 'T4', name: 'T4', turnIds: [4], usualSec: 5.1, usualLapOrdinal: 1, lossSec: 0.1, reference: { ...reference, usualSec: 5, usualLapOrdinal: 4 } },
  ],
  sameCarReference: { sessionId: 'R1', driverOrdinal: 1, name: 'Cy Same', car: 'Car A', sameSession: true, laps: 6 },
  habits: [habit(1, 'Brake 10 m later into T1'), habit(2, 'Carry 4 km/h more through T2', { rule: 'overSlowing', repeatability: 1 })],
  unexplained: [habit(4, 'T4 loses 0.08 s in: no clear cause', { cornerId: 9, rule: null, lossSec: 0.08 }), habit(4, 'never shown', { cornerId: 9, rule: null })],
  carDifferences: [habit(4, 'the car', { cornerId: 9, half: 'out' })],
  mistakes: [
    { lapOrdinal: 1, cornerId: 5, turnId: 1, turnLabel: 'T1', lossSec: 0.2, cause: 'lockup', line: 'T1 +0.20 s: a lockup' },
    { lapOrdinal: 3, cornerId: 9, turnId: 4, turnLabel: 'T4', lossSec: 0.6, cause: 'traffic', line: 'T4 +0.60 s: traffic' },
    { lapOrdinal: 2, cornerId: 5, turnId: 2, turnLabel: 'T2', lossSec: 0.15, cause: null, line: 'T2 +0.15 s' },
    { lapOrdinal: 3, cornerId: 5, turnId: 2, turnLabel: 'T2', lossSec: 0.3, cause: 'slowExit', line: 'T2 +0.30 s: 5 km/h slower out' },
  ],
  // The practice before: T1's brake point moved 6 m later since; T2's habit is new.
  sinceLast: {
    session: { sessionId: 'P1', timestamp: Date.UTC(2026, 9, 21, 12), sessionType: 'Practice' },
    habits: [
      { turnId: 1, half: 'in', rule: 'brakeEarly', isNew: false, cue: 'brake 6 m later' },
      { turnId: 2, half: 'in', rule: 'overSlowing', isNew: true, cue: '2 km/h more in the middle' },
    ],
  },
};

/** The lap view's corners for the class: corner 3 starts the lap, then 5, then 9. */
export const layout = {
  kind: 'sequences', startStationM: 0, lengthM: 5000,
  corners: [{ id: 9, startM: 900 }, { id: 3, startM: 100 }, { id: 5, startM: 400 }],
};

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

/** Serves the session's corner analysis (or `analysisStatus` with an error), the layout's corners and a strategy. */
export function mockWatchServer(analysisStatus = 200, body: unknown = analysis) {
  clearLayoutCornersCache();
  const fetchMock = vi.fn((input: string) => {
    const url = String(input);
    if (url.startsWith('/api/session/R1/corner-analysis')) return analysisStatus === 200 ? json(body) : json({ error: 'Session summaries are rebuilding' }, analysisStatus);
    if (url.startsWith('/api/corner-sequences/layout?')) return json(layout);
    if (url.startsWith('/api/session/R1/strategy')) return json({ strategy: null, plan: null });
    return json({ error: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
