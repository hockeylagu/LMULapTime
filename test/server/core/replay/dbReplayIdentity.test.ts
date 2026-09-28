import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { archivedReplayName } from '../../../../server/core/replay/dbReplayIdentity.js';
import { getReplayFactsVersion, getReplayLaps, replaceReplayDriverLapFacts, replaceReplayWideFacts } from '../../../../server/core/replay/dbReplayLapStore.js';
import { emptyLapFact } from '../../../../server/replay/replayFacts.js';
import type { DetailedSession, ReplayMetadata, ReplayTrajectoryData } from '../../../../server/core/types.js';
import type { DuckDbFileInfo } from '../../../../server/telemetry/telemetryMatcher.js';

const name = 'Bahrain Paddock Circuit P1 18.Vcr';
const replayPath = `C:\\replays\\${name}`;
const savedAt = Date.parse('2026-06-28T23:44:43.122Z');
const archivedName = 'Bahrain Paddock Circuit P1 18 @2026-06-28T23-44-43Z.Vcr';

const metadata = (durationSec: number, sceneDesc = 'BAHRAINWEC_PADDOCK'): ReplayMetadata => ({
  filename: name,
  filePath: replayPath,
  fileSizeBytes: 1,
  mtimeMs: 0,
  timeSliceCount: 0,
  totalEvents: 0,
  durationSec,
  sceneDesc,
  drivers: [{ slot: 0, name: 'Samuel Lague', isPlayer: true }],
});

const lap = (currentLap: number): ReplayTrajectoryData => ({
  replayName: name,
  pointsCount: 1,
  currentLap,
  driverSlot: 0,
  points: [{ x: currentLap, y: 0, z: 0 }],
} as ReplayTrajectoryData);

const session = (id: string): DetailedSession => ({
  id,
  filename: `${id}.xml`,
  timestamp: savedAt - 400_000,
  trackVenue: 'Bahrain International Circuit',
  trackCourse: 'Bahrain Paddock Circuit',
  sessionType: 'Practice',
  sessionName: 'P1',
  driversCount: 0,
  drivers: [],
  matchingReplayFile: { name, path: replayPath, sizeBytes: 6863306 },
} as unknown as DetailedSession);

describe('replay identity', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    db.upsertReplayMetadataCache(name, replayPath, savedAt, 6863306, metadata(340));
  });

  afterEach(() => {
    db.close();
  });

  it('names an archived recording after the time it was saved', () => {
    expect(archivedReplayName(name, savedAt)).toBe(archivedName);
  });

  it('keeps the stored recording, with everything that points at it, when another recording takes its name', () => {
    db.upsertReplayTrajectoryCache(name, 0, 1, savedAt, 6863306, lap(1), replayPath);
    db.upsertReplayTrajectoryCache(name, 0, 2, savedAt, 6863306, lap(2), replayPath);
    db.setReplayTrajectoryDefaults(name, -1, 2, 0);
    db.recordReplayDriverIngest(name, 0, savedAt, 6863306, 'stored');
    replaceReplayDriverLapFacts(db.getDb(), name, 0, [emptyLapFact(1), emptyLapFact(2)], 'v7');
    replaceReplayWideFacts(db.getDb(), name, { endSec: 1, sessionRunningOrder: null, conditions: [], runningOrder: [], driverEvents: [] }, 'v7');
    db.upsertSession(session('owner'), 'C:\\results\\owner.xml', 1, 1);
    db.upsertSession(session('withdrawn'), 'C:\\results\\withdrawn.xml', 1, 1);
    db.rejectSessionReplayLink('withdrawn', { name, path: replayPath, sizeBytes: 6863306 }, 'owned-by-other-session');
    db.upsertTelemetryMetadata({ filename: 'Bahrain_P.duckdb', filePath: 'C:\\t\\Bahrain_P.duckdb', fileMtimeMs: 1, fileSizeBytes: 1, trackName: 'Bahrain', sessionType: 'P', timestampStr: '', timestampEpochMs: 0 } as DuckDbFileInfo, 'owner', name);
    db.saveAiReport({ cacheKey: 'k', replayName: name, lapNumber: 2, baselineReplayName: name, baselineLapNumber: 1, model: 'm', promptVersion: 1, report: { overallSummary: '', improvements: [] }, generatedAt: 1 });

    // Three hours later LMU writes another recording under the same name.
    db.upsertReplayMetadataCache(name, replayPath, savedAt + 3 * 3600_000, 7000000, metadata(400));

    const archived = db.getStoredReplayFileInfo(archivedName);
    expect(archived).toMatchObject({ file_mtime: savedAt, file_size: 6863306, file_path: `C:\\replays\\${archivedName}` });
    expect(db.getStoredReplayFileInfo(name)?.file_mtime).toBe(savedAt + 3 * 3600_000);
    expect(db.getStoredReplayTrajectory(archivedName, 0, 2)?.points[0].x).toBe(2);
    expect(db.getStoredReplayTrajectory(archivedName, -1, -1)?.currentLap).toBe(2);
    expect(db.getStoredReplayTrajectory(name, 0, 2)).toBeNull();
    expect(db.getReplayDriverIngest(archivedName, 0)?.fileMtime).toBe(savedAt);
    expect(db.getReplayDriverIngest(name, 0)).toBeNull();
    expect(getReplayLaps(db.getDb(), archivedName).map(l => l.lapNumber)).toEqual([1, 2]);
    expect(getReplayFactsVersion(db.getDb(), archivedName)).toBe('v7');
    expect(getReplayLaps(db.getDb(), name)).toEqual([]);
    expect(db.getSessionById('owner')?.matchingReplayFile).toMatchObject({ name: archivedName, path: `C:\\replays\\${archivedName}` });
    expect(db.getRejectedReplayLinks().get('withdrawn')?.[0].replayName).toBe(archivedName);
    expect(db.getTelemetryMetadata()[0].matchedReplayFilename).toBe(archivedName);
    expect(db.getAiReportsList()[0]).toMatchObject({ replayName: archivedName, baselineReplayName: archivedName });
  });

  it('updates in place when the same recording is saved again', () => {
    // Saved 40 s later with 40 s more recorded: the same start, so the same recording.
    db.upsertReplayMetadataCache(name, replayPath, savedAt + 40_000, 7000000, metadata(380));

    expect(db.getReplaysCount()).toBe(1);
    expect(db.getStoredReplayFileInfo(name)?.file_mtime).toBe(savedAt + 40_000);
  });

  it('treats another track scene as another recording even at the same time', () => {
    db.upsertReplayMetadataCache(name, replayPath, savedAt + 1, 7000000, metadata(340, 'BAHRAINWEC_OUTER'));

    expect(db.getReplaysCount()).toBe(2);
    expect(db.getStoredReplayFileInfo(archivedName)?.metadata.sceneDesc).toBe('BAHRAINWEC_PADDOCK');
  });

  it('never renames over an existing archived recording', () => {
    db.upsertReplayMetadataCache(archivedName, `C:\\replays\\${archivedName}`, 1, 1, metadata(10));

    db.upsertReplayMetadataCache(name, replayPath, savedAt + 3 * 3600_000, 7000000, metadata(400));

    expect(db.getStoredReplayFileInfo('Bahrain Paddock Circuit P1 18 @2026-06-28T23-44-43Z (2).Vcr')?.file_mtime).toBe(savedAt);
    expect(db.getStoredReplayFileInfo(archivedName)?.file_mtime).toBe(1);
  });
});
