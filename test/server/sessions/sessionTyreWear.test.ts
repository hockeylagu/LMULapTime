import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTyreWearLaps } from '../../../server/sessions/sessionTyreWear.js';
import { getLiveCaptureIndexRows } from '../../../server/core/live/dbLiveCaptureStore.js';
import { learningProjectionInputs } from '../../../server/live/learning/inputs.js';
import { openVerifiedLiveRecording } from '../../../server/live/capture/recordingValidation.js';
import { readSessionLapStates } from '../../../server/sessions/sessionStrategy.js';
import type { SessionStrategySource } from '../../../server/sessions/sessionStrategy.js';
import type { LiveCaptureIndexRow } from '../../../server/core/live/dbLiveCaptureStore.js';
import type { DuckDbReader } from '../../../server/telemetry/duckdbReader.js';
import type { LapData } from '../../../shared/types/session.js';
import { liveCaptureChannels } from '../../../server/live/capture/channels.js';
import { driver, lap, session } from '../core/sessionRows/builders.js';

vi.mock('../../../server/core/live/dbLiveCaptureStore.js', () => ({ getLiveCaptureIndexRows: vi.fn() }));
vi.mock('../../../server/live/learning/inputs.js', () => ({ learningProjectionInputs: vi.fn() }));
vi.mock('../../../server/live/capture/recordingValidation.js', () => ({ openVerifiedLiveRecording: vi.fn() }));
vi.mock('../../../server/sessions/sessionStrategy.js', () => ({ readSessionLapStates: vi.fn() }));

const db = new Database(':memory:');
afterAll(() => db.close());
afterEach(() => vi.clearAllMocks());
let xml: LapData;
const query = vi.fn();
const close = vi.fn();
const source: SessionStrategySource = {
  getDb: () => db, getSessionById: () => session([driver('Player', [xml], { isPlayer: true })]),
  getTelemetryMetadata: () => [], getTelemetryLapCacheFilenames: () => new Set(), recordIngestError: vi.fn(),
};

beforeEach(() => {
  xml = lap(2, { lapTime: 4, elapsedSeconds: 10, flCompound: 'Medium', frCompound: 'Medium', rlCompound: 'Medium', rrCompound: 'Medium' });
  vi.mocked(getLiveCaptureIndexRows).mockReturnValue([{
    available: true, matchVersion: 1, matchStatus: 'verified', filename: 'closed.live.duckdb', bytes: 0,
    manifest: { sessionId: 'session-a', driverName: 'Player', normalizationVersion: 3,
      anchors: [{ lapNumber: 2, startSeconds: 10, lapSeconds: 4 }, { lapNumber: 3, startSeconds: 14, lapSeconds: null }] },
  } as LiveCaptureIndexRow]);
  vi.mocked(learningProjectionInputs).mockReturnValue({ signature: 'verified', laps: [] });
  vi.mocked(readSessionLapStates).mockResolvedValue([
    { lap: 1, fuel: null, ve: null, tread: [1, 1, 1, 1] },
    { lap: 2, fuel: null, ve: null, tread: [0.996, 0.996, 0.996, 0.996] },
  ]);
  vi.mocked(openVerifiedLiveRecording).mockResolvedValue({ queryAll: query, close } as unknown as DuckDbReader);
  query.mockResolvedValue(Array.from({ length: 100 }, (_, i) => Object.fromEntries([
    ['elapsed_seconds', 10 + i * 0.04], ['lap_number', 1],
    ...liveCaptureChannels(3).filter(channel => channel.frame === 'iso8855-wheel')
      .map(channel => [channel.name, channel.name.includes('ground') ? 30 : 0]),
  ])));
});

describe('tyre learning lap evidence', () => {
  it('uses verified crossing clocks, retaining slow, traffic and invalid laps', async () => {
    xml.isValid = false;
    expect((await readTyreWearLaps(source, 'session-a'))?.[0]).toMatchObject({ exclusions: [], captureLapNumbers: [1], slip: [0, 0, 0, 0] });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['start-lap', { lapNumber: 1 }], ['pit-lap', { isPitStop: true }], ['out-lap', { isOutLap: true }],
    ['wet', { conditions: { wetTyres: true } }], ['unknown-or-mixed-compound', { rrCompound: 'Hard' }],
    ['unknown-or-mixed-compound', { flCompound: 'N/A', frCompound: 'N/A', rlCompound: 'N/A', rrCompound: 'N/A' }],
  ] as Array<[string, Partial<LapData>]>)('drops %s with an explicit reason', async (reason, changes) => {
    Object.assign(xml, changes);
    expect((await readTyreWearLaps(source, 'session-a'))?.[0].exclusions).toContain(reason);
  });

  it.each([['new-tyres', 0.9, 1], ['puncture', 1, 0.7]] as const)('drops %s on any wheel', async (reason, before, after) => {
    vi.mocked(readSessionLapStates).mockResolvedValue([
      { lap: 1, fuel: null, ve: null, tread: [1, 1, before, 1] }, { lap: 2, fuel: null, ve: null, tread: [1, 1, after, 1] },
    ]);
    expect((await readTyreWearLaps(source, 'session-a'))?.[0].exclusions).toContain(reason);
  });

  it('marks a gap inside the lap as unknown, even when both endpoints are covered', async () => {
    query.mockResolvedValue([{ elapsed_seconds: 10, lap_number: 1 }, { elapsed_seconds: 13.9, lap_number: 1 }]);
    expect((await readTyreWearLaps(source, 'session-a'))?.[0].exclusions).toContain('capture-gap');
  });

  it('does not open the capture without verified unique ownership', async () => {
    vi.mocked(learningProjectionInputs).mockReturnValue(null);
    expect(await readTyreWearLaps(source, 'session-a')).toBeNull();
    expect(openVerifiedLiveRecording).not.toHaveBeenCalled();
  });
});
