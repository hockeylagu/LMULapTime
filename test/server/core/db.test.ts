import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { SessionDatabase } from '../../../server/core/db.js';
import { LmuParser } from '../../../server/sessions/parser.js';
import { parseReplayMetadata } from '../../../server/replay/replayParser.js';
import { ReplayMetadata, ReplayTrajectoryData, AiReportRecord } from '../../../server/core/types.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

describe('SessionDatabase (SQLite Cache)', () => {
  let db: SessionDatabase;
  const resultsDir = path.join(process.cwd(), 'test', 'fixtures', 'results');
  const replaysDir = path.join(process.cwd(), 'test', 'fixtures', 'replays');
  const parser = new LmuParser(replaysDir, resultsDir);

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('initializes schema and returns initial empty stats', () => {
    const stats = db.getCacheStats();
    expect(stats.enabled).toBe(true);
    expect(stats.sessionsCount).toBe(0);
    expect(stats.lastSyncedAt).toBeNull();
  });

  it('syncs sessions from fixtures directory and caches them', () => {
    const syncRes = db.syncSessionsFromDir(resultsDir, parser);
    expect(syncRes.added).toBeGreaterThanOrEqual(1);
    expect(syncRes.total).toBeGreaterThanOrEqual(1);
    expect(syncRes.lastSyncedAt).toBeDefined();

    const stats = db.getCacheStats();
    expect(stats.sessionsCount).toBe(syncRes.total);
    expect(stats.lastSyncedAt).toBe(syncRes.lastSyncedAt);

    // Verify session data can be retrieved
    const sessions = db.getAllSessions();
    expect(sessions.length).toBe(syncRes.total);
    expect(sessions[0]).toHaveProperty('trackVenue');
    expect(sessions[0]).toHaveProperty('drivers');

    const summaries = db.getAllSessionSummaries();
    expect(summaries.length).toBe(syncRes.total);
    expect(summaries[0]).toHaveProperty('trackVenue');
    // Summaries do not include full drivers list
    expect(summaries[0]).not.toHaveProperty('drivers');
  });

  it('yields XML parsing and cache-persistence progress while asynchronously scanning sessions', async () => {
    const iterator = db.syncSessionsAsyncIterator(resultsDir, parser);
    const progress: Array<{ stage?: string; currentFile: string; filePercent?: number }> = [];
    let step = await iterator.next();
    while (!step.done) {
      progress.push(step.value);
      step = await iterator.next();
    }

    expect(step.value.total).toBeGreaterThan(0);
    expect(progress).toContainEqual(expect.objectContaining({ stage: 'Reading XML session log', filePercent: 5 }));
    expect(progress).toContainEqual(expect.objectContaining({ stage: 'Persisting session cache', filePercent: 95 }));
    expect(progress.some(item => item.currentFile.endsWith('.xml'))).toBe(true);
  });

  it('preserves the previous session cache until a parser-version replacement is committed', () => {
    const initialSync = db.syncSessionsFromDir(resultsDir, parser);
    const cachedSessions = db.getAllSessions();
    db.setMetadata('parser_version', 'outdated-parser-version');

    const iterator = db.syncSessionsIterator(resultsDir, parser);
    const firstStep = iterator.next();

    expect(firstStep.done).toBe(false);
    expect(db.getSessionsCount()).toBe(initialSync.total);
    expect(db.getAllSessions()).toEqual(cachedSessions);
    iterator.return(undefined as never);
    expect(db.getSessionsCount()).toBe(initialSync.total);
    expect(db.getMetadata('parser_version')).toBe('outdated-parser-version');
  });

  it('skips parsing unchanged files during subsequent sync (delta sync)', () => {
    const firstSync = db.syncSessionsFromDir(resultsDir, parser);
    expect(firstSync.added).toBeGreaterThanOrEqual(1);

    // Second sync: no files modified, so added and updated should both be 0
    const secondSync = db.syncSessionsFromDir(resultsDir, parser);
    expect(secondSync.added).toBe(0);
    expect(secondSync.updated).toBe(0);
    expect(secondSync.total).toBe(firstSync.total);
  });

  it('retrieves single session by id or returns null if missing', () => {
    db.syncSessionsFromDir(resultsDir, parser);
    const sessions = db.getAllSessions();
    const id = sessions[0].id;

    const found = db.getSessionById(id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(id);

    const notFound = db.getSessionById('nonexistent-session-id');
    expect(notFound).toBeNull();
  });

  it('clears cache and resets stats', () => {
    db.syncSessionsFromDir(resultsDir, parser);
    expect(db.getSessionsCount()).toBeGreaterThan(0);

    db.clearCache();
    expect(db.getSessionsCount()).toBe(0);
    const stats = db.getCacheStats();
    expect(stats.sessionsCount).toBe(0);
    expect(stats.lastSyncedAt).toBeNull();
    expect(db.getAllSessions().length).toBe(0);
  });
});

describe('SessionDatabase replay cache', () => {
  let db: SessionDatabase;
  const tempDir = path.join(process.cwd(), 'test', 'fixtures', 'replays_db_temp');

  const buildMetadata = (overrides: Partial<ReplayMetadata> = {}): ReplayMetadata => ({
    filename: 'Test_Replay_P1.Vcr',
    filePath: 'C:\\replays\\Test_Replay_P1.Vcr',
    fileSizeBytes: 12345,
    mtimeMs: 1700000000000,
    timeSliceCount: 10,
    totalEvents: 20,
    durationSec: 90,
    displayTrack: 'Bahrain (wec)',
    drivers: [
      { slot: 1, name: 'Samuel Lague', isPlayer: true },
      { slot: 2, name: 'Test Rival' },
    ],
    ...overrides,
  });

  const buildTrajectory = (overrides: Partial<ReplayTrajectoryData> = {}): ReplayTrajectoryData => ({
    replayName: 'Test_Replay_P1.Vcr',
    pointsCount: 3,
    currentLap: 1,
    laps: [{ lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
    sectors: { s1Frame: 1, s2Frame: 2 },
    bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 },
      { x: 10, y: 0, z: 10 },
    ],
    ...overrides,
  });

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null for a replay metadata cache miss', () => {
    expect(db.getReplayMetadataCache('Missing.Vcr', 1, 1)).toBeNull();
  });

  it('round-trips replay metadata through brotli-compressed storage', () => {
    const metadata = buildMetadata();
    db.upsertReplayMetadataCache('Test_Replay_P1.Vcr', metadata.filePath, 1000, 12345, metadata);

    const cached = db.getReplayMetadataCache('Test_Replay_P1.Vcr', 1000, 12345);
    expect(cached).not.toBeNull();
    expect(cached?.displayTrack).toBe('Bahrain (wec)');
    expect(cached?.drivers).toHaveLength(2);
    expect(cached?.drivers[0].name).toBe('Samuel Lague');
  });

  it('retrieves stored replay data after the source file is deleted', () => {
    const metadata = buildMetadata();
    const trajectory = buildTrajectory();
    db.upsertReplayMetadataCache('Deleted_Replay_P1.Vcr', metadata.filePath, 1000, 12345, metadata);
    db.upsertReplayTrajectoryCache('Deleted_Replay_P1.Vcr', -1, -1, 1000, 12345, trajectory);

    expect(db.getStoredReplayMetadata('Deleted_Replay_P1.Vcr')?.filename).toBe(metadata.filename);
    expect(db.getStoredReplayTrajectory('Deleted_Replay_P1.Vcr', -1, -1)?.points).toHaveLength(3);
  });

  it('falls back to default slot and lap when requested specific keys are missing if allowFallback is enabled', () => {
    const trajectory = buildTrajectory();
    db.upsertReplayTrajectoryCache('Fallback_Replay_P1.Vcr', -1, -1, 1000, 12345, trajectory);

    expect(db.getStoredReplayTrajectory('Fallback_Replay_P1.Vcr', 2, 4)).toBeNull();
    const fallbackResult = db.getStoredReplayTrajectory('Fallback_Replay_P1.Vcr', 2, 4, { allowFallback: true });
    expect(fallbackResult?.points).toHaveLength(3);
  });

  it('invalidates replay metadata cache when mtime or size changes', () => {
    const metadata = buildMetadata();
    db.upsertReplayMetadataCache('Test_Replay_P1.Vcr', metadata.filePath, 1000, 12345, metadata);

    expect(db.getReplayMetadataCache('Test_Replay_P1.Vcr', 1000, 12345)).not.toBeNull();
    expect(db.getReplayMetadataCache('Test_Replay_P1.Vcr', 1001, 12345)).toBeNull();
    expect(db.getReplayMetadataCache('Test_Replay_P1.Vcr', 1000, 99999)).toBeNull();
  });

  it('does not reuse live metadata for the same filename from another source path', () => {
    const metadata = buildMetadata();
    db.upsertReplayMetadataCache('Same_Name_P1.Vcr', 'C:\\replays-a\\Same_Name_P1.Vcr', 1000, 12345, metadata);

    expect(db.getReplayMetadataCache('Same_Name_P1.Vcr', 1000, 12345, 'C:\\replays-a\\Same_Name_P1.Vcr')).not.toBeNull();
    expect(db.getReplayMetadataCache('Same_Name_P1.Vcr', 1000, 12345, 'C:\\replays-b\\Same_Name_P1.Vcr')).toBeNull();
  });

  it('does not reuse live trajectory data for the same filename from another source path', () => {
    const trajectory = buildTrajectory();
    db.upsertReplayTrajectoryCache('Same_Name_P1.Vcr', -1, -1, 1000, 12345, trajectory, 'C:\\replays-a\\Same_Name_P1.Vcr');

    expect(db.getReplayTrajectoryCache('Same_Name_P1.Vcr', -1, -1, 1000, 12345, 'C:\\replays-a\\Same_Name_P1.Vcr')).not.toBeNull();
    expect(db.getReplayTrajectoryCache('Same_Name_P1.Vcr', -1, -1, 1000, 12345, 'C:\\replays-b\\Same_Name_P1.Vcr')).toBeNull();
  });

  it('round-trips a full-resolution trajectory keyed by driver slot and lap', () => {
    const trajectory = buildTrajectory();
    db.upsertReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345, trajectory);

    const cached = db.getReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345);
    expect(cached).not.toBeNull();
    expect(cached?.points).toHaveLength(3);
    expect(cached?.sectors?.s1Frame).toBe(1);

    // A different (driverSlot, lapKey) combination is a distinct cache entry
    expect(db.getReplayTrajectoryCache('Test_Replay_P1.Vcr', 2, -1, 1000, 12345)).toBeNull();
  });

  it('hasValidReplayTrajectoryCache matches getReplayTrajectoryCache without decompressing the blob', () => {
    const trajectory = buildTrajectory();
    db.upsertReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345, trajectory);

    expect(db.hasValidReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345)).toBe(true);
    expect(db.hasValidReplayTrajectoryCache('Test_Replay_P1.Vcr', 2, -1, 1000, 12345)).toBe(false);
    // Stale mtime/size must invalidate the same as the decompressing lookup does
    expect(db.hasValidReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 2000, 12345)).toBe(false);
  });

  it('invalidates trajectory cache when the underlying file changes', () => {
    const trajectory = buildTrajectory();
    db.upsertReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345, trajectory);

    expect(db.getReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345)).not.toBeNull();
    expect(db.getReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 2000, 12345)).toBeNull();
  });

  it('clears both replay tables via clearReplayCache', () => {
    db.upsertReplayMetadataCache('Test_Replay_P1.Vcr', 'C:\\replays\\Test_Replay_P1.Vcr', 1000, 12345, buildMetadata());
    db.upsertReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345, buildTrajectory());
    expect(db.getReplaysCount()).toBe(1);

    db.clearReplayCache();
    expect(db.getReplaysCount()).toBe(0);
    expect(db.getReplayMetadataCache('Test_Replay_P1.Vcr', 1000, 12345)).toBeNull();
    expect(db.getReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345)).toBeNull();
  });

  it('lists cached replays with a trajectory count from the joined table', () => {
    db.upsertReplayMetadataCache('Test_Replay_P1.Vcr', 'C:\\replays\\Test_Replay_P1.Vcr', 1000, 12345, buildMetadata());
    db.upsertReplayMetadataCache('Other_Replay_P2.Vcr', 'C:\\replays\\Other_Replay_P2.Vcr', 2000, 500, buildMetadata({ displayTrack: 'Spa', drivers: [{ slot: 1, name: 'Solo Driver' }] }));
    db.upsertReplayTrajectoryCache('Test_Replay_P1.Vcr', -1, -1, 1000, 12345, buildTrajectory());
    db.upsertReplayTrajectoryCache('Test_Replay_P1.Vcr', 2, -1, 1000, 12345, buildTrajectory());

    const list = db.getReplayCacheList();
    expect(list).toHaveLength(2);
    // Ordered by replay date (file mtime) descending, not insertion/cache order.
    expect(list.map(r => r.filename)).toEqual(['Other_Replay_P2.Vcr', 'Test_Replay_P1.Vcr']);

    const primary = list.find(r => r.filename === 'Test_Replay_P1.Vcr');
    expect(primary?.trackName).toBe('Bahrain (wec)');
    expect(primary?.driversCount).toBe(2);
    expect(primary?.trajectoriesCached).toBe(2);
    expect(primary?.compressedSizeBytes).toBeGreaterThan(0);
    expect(primary?.replayDateMs).toBe(1000);

    const other = list.find(r => r.filename === 'Other_Replay_P2.Vcr');
    expect(other?.trackName).toBe('Spa');
    expect(other?.driversCount).toBe(1);
    expect(other?.trajectoriesCached).toBe(0);
    expect(other?.compressedSizeBytes).toBeGreaterThan(0);
    expect(other?.replayDateMs).toBe(2000);
  });

  it('returns empty stats and does nothing when replaysDir does not exist', () => {
    const result = db.syncReplaysFromDir(path.join(tempDir, 'does-not-exist'));
    expect(result).toEqual(expect.objectContaining({ added: 0, updated: 0, skipped: 0, total: 0 }));
  });

  it('eagerly parses and caches new .Vcr files, then skips unchanged ones on the next sync', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'Sync_Test_P1.Vcr'), createSliceVcrBuffer({
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    }));

    const firstSync = db.syncReplaysFromDir(tempDir, { playerName: 'Player Driver' });
    expect(firstSync.added).toBe(1);
    expect(firstSync.updated).toBe(0);
    expect(firstSync.total).toBe(1);
    expect(db.getReplaysCount()).toBe(1);

    // Metadata and the default full-resolution trajectory should both be cached
    const list = db.getReplayCacheList();
    expect(list[0].filename).toBe('Sync_Test_P1.Vcr');
    expect(list[0].trajectoriesCached).toBeGreaterThanOrEqual(1);

    // Second sync: file unchanged on disk, so it should be skipped (not re-parsed)
    const secondSync = db.syncReplaysFromDir(tempDir, { playerName: 'Player Driver' });
    expect(secondSync.added).toBe(0);
    expect(secondSync.updated).toBe(0);
    expect(secondSync.total).toBe(1);
  });

  it('streams worker decoding progress while asynchronously caching a replay', async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    const filename = 'Async_Sync_P1.Vcr';
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [{ name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    }));

    const progress = [] as Array<{ stage?: string; filePercent?: number }>;
    const iterator = db.syncReplaysAsyncIterator(tempDir, { playerName: 'Player Driver' });
    let step = await iterator.next();
    while (!step.done) {
      progress.push(step.value);
      step = await iterator.next();
    }

    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    expect(step.value).toMatchObject({ added: 1, skipped: 0, interrupted: false });
    expect(progress).toContainEqual(expect.objectContaining({ stage: 'Decoding telemetry and events' }));
    expect(progress).toContainEqual(expect.objectContaining({ stage: 'Persisting trajectory cache', filePercent: 95 }));
    expect(db.getReplayTrajectoryCache(filename, -1, -1, mtime, stat.size)).not.toBeNull();
  });

  it('caches a full-resolution trajectory for every driver in the replay, not just the default one', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'Multi_Driver_P1.Vcr'), createSliceVcrBuffer({
      drivers: [
        { name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' },
        { name: 'Rival Driver', vehicleId: '32_26_WRT_83524148', team: 'WRT Team Racing', carNumber: '32' },
      ],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
        { sTime: 0, driverSlot: 2, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 2, x: 5, y: 0, z: 5 },
      ],
    }));

    db.syncReplaysFromDir(tempDir, { playerName: 'Player Driver' });

    const filePath = path.join(tempDir, 'Multi_Driver_P1.Vcr');
    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    const cachedDefault = db.getReplayTrajectoryCache('Multi_Driver_P1.Vcr', -1, -1, mtime, stat.size);
    const cachedSlot1 = db.getReplayTrajectoryCache('Multi_Driver_P1.Vcr', 1, -1, mtime, stat.size);
    const cachedSlot2 = db.getReplayTrajectoryCache('Multi_Driver_P1.Vcr', 2, -1, mtime, stat.size);
    // Every detected lap is also cached under its own explicit lap number (here just lap 1,
    // since this minimal fixture has no timing packets to detect more than one lap).
    const cachedDefaultLap1 = db.getReplayTrajectoryCache('Multi_Driver_P1.Vcr', -1, 1, mtime, stat.size);
    const cachedSlot2Lap1 = db.getReplayTrajectoryCache('Multi_Driver_P1.Vcr', 2, 1, mtime, stat.size);

    expect(cachedDefault).not.toBeNull();
    expect(cachedSlot2).not.toBeNull();
    expect(cachedSlot2?.points.length).toBeGreaterThan(0);
    expect(cachedDefaultLap1).not.toBeNull();
    expect(cachedSlot2Lap1).not.toBeNull();
    // The -1 sentinels resolve to the player's real slot and chosen lap instead of being
    // stored as extra copies of the same blob.
    expect(cachedSlot1).not.toBeNull();
    expect(cachedSlot1?.driverSlot).toBe(1);
    expect(cachedDefault?.driverSlot).toBe(1);

    const list = db.getReplayCacheList();
    // One row per (driver, lap): slot 1 lap 1 and slot 2 lap 1.
    expect(list[0].trajectoriesCached).toBe(2);
  });

  it('resolves -1 driver and lap lookups without storing duplicate blobs', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'Dedup_P1.Vcr'), createSliceVcrBuffer({
      drivers: [{ name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
      ],
    }));

    db.syncReplaysFromDir(tempDir, { playerName: 'Player Driver' });

    const filePath = path.join(tempDir, 'Dedup_P1.Vcr');
    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);

    expect(db.getReplayTrajectoryCache('Dedup_P1.Vcr', -1, -1, mtime, stat.size)?.driverSlot).toBe(1);
    expect(db.getStoredReplayTrajectory('Dedup_P1.Vcr', -1, -1)?.driverSlot).toBe(1);
    expect(db.hasValidReplayTrajectoryCache('Dedup_P1.Vcr', -1, -1, mtime, stat.size)).toBe(true);
    expect(db.getReplayTrajectoryCache('Dedup_P1.Vcr', 1, -1, mtime, stat.size)?.driverSlot).toBe(1);

    const summary = db.getReplayCacheList().find(entry => entry.filename === 'Dedup_P1.Vcr');
    expect(summary?.trajectoriesCached).toBe(1);
  });

  it('fills in missing trajectory cache rows on a later sync even when metadata is already cached', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, 'Partial_Cache_P1.Vcr');
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [
        { name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' },
        { name: 'Rival Driver', vehicleId: '32_26_WRT_83524148', team: 'WRT Team Racing', carNumber: '32' },
      ],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
        { sTime: 0, driverSlot: 2, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 2, x: 5, y: 0, z: 5 },
      ],
    }));

    // Simulate a replay that was only ever metadata-cached (e.g. an older cache version,
    // or a prior sync where trajectory extraction failed) - no rows in replay_trajectories.
    const metadata = parseReplayMetadata(filePath, { playerName: 'Player Driver' });
    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    db.upsertReplayMetadataCache('Partial_Cache_P1.Vcr', filePath, mtime, stat.size, metadata);
    expect(db.getReplayCacheList()[0].trajectoriesCached).toBe(0);

    const result = db.syncReplaysFromDir(tempDir, { playerName: 'Player Driver' });

    // Metadata was already cached, so this isn't counted as a brand-new "added" replay,
    // but the missing trajectories must still get filled in as an "updated" replay.
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(db.getReplayTrajectoryCache('Partial_Cache_P1.Vcr', -1, -1, mtime, stat.size)).not.toBeNull();
    expect(db.getReplayTrajectoryCache('Partial_Cache_P1.Vcr', 2, -1, mtime, stat.size)).not.toBeNull();
  });

  it('stops gracefully mid-directory when shouldStop fires, then resumes and finishes on the next sync', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    for (const name of ['Interrupt_A_P1.Vcr', 'Interrupt_B_P1.Vcr', 'Interrupt_C_P1.Vcr']) {
      fs.writeFileSync(path.join(tempDir, name), createSliceVcrBuffer({
        drivers: [{ name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' }],
        slices: [
          { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
          { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
        ],
      }));
    }

    // Stop as soon as the first file has been fully cached, simulating a shutdown signal
    // arriving mid-scan (the iterator yields multiple times per file, so this is checked
    // via actual cache state rather than counting yields).
    const firstRun = db.syncReplaysFromDir(tempDir, {
      playerName: 'Player Driver',
      shouldStop: () => db.getReplaysCount() >= 1,
    });

    expect(firstRun.interrupted).toBe(true);
    expect(firstRun.added).toBe(1);
    expect(db.getReplaysCount()).toBe(1);

    // Resuming (no shouldStop this time) must not re-do or corrupt the already-cached files,
    // and must finish caching the remaining ones.
    const secondRun = db.syncReplaysFromDir(tempDir, { playerName: 'Player Driver' });

    expect(secondRun.interrupted).toBe(false);
    expect(secondRun.added).toBe(2);
    expect(db.getReplaysCount()).toBe(3);

    for (const name of ['Interrupt_A_P1.Vcr', 'Interrupt_B_P1.Vcr', 'Interrupt_C_P1.Vcr']) {
      const stat = fs.statSync(path.join(tempDir, name));
      const mtime = Math.floor(stat.mtimeMs);
      expect(db.getReplayTrajectoryCache(name, -1, -1, mtime, stat.size)).not.toBeNull();
    }
  });

  it('eagerly caches every individual lap of a multi-lap replay, not just the best one', () => {
    fs.mkdirSync(tempDir, { recursive: true });

    // Build a 2-lap replay using authoritative VCR timing packets (sector 0 = finish line)
    const slices = [
      { sTime: 10.0, driverSlot: 1, x: 1.45, y: 0, z: 10.8 },
      { sTime: 35.5, driverSlot: 1, x: 50, y: 0, z: 100, timing: { splitSec: 25.5, sector: 1, lapIdx: 0 } },
      { sTime: 69.75, driverSlot: 1, x: -50, y: 0, z: -100, timing: { splitSec: 59.75, sector: 2, lapIdx: 0 } },
      { sTime: 116.875, driverSlot: 1, x: 1.45, y: 0, z: 10.8, timing: { splitSec: 106.875, sector: 0, lapIdx: 0 } },
      { sTime: 137.975, driverSlot: 1, x: 50, y: 0, z: 100, timing: { splitSec: 21.1, sector: 1, lapIdx: 1 } },
      { sTime: 170.375, driverSlot: 1, x: -50, y: 0, z: -100, timing: { splitSec: 53.5, sector: 2, lapIdx: 1 } },
      { sTime: 216.875, driverSlot: 1, x: 1.45, y: 0, z: 10.8, timing: { splitSec: 100.0, sector: 0, lapIdx: 1 } },
    ];
    fs.writeFileSync(path.join(tempDir, 'Multi_Lap_P1.Vcr'), createSliceVcrBuffer({ slices }));

    db.syncReplaysFromDir(tempDir, { playerName: 'Player Driver' });

    const filePath = path.join(tempDir, 'Multi_Lap_P1.Vcr');
    const stat = fs.statSync(filePath);
    const mtime = Math.floor(stat.mtimeMs);

    const lap1 = db.getReplayTrajectoryCache('Multi_Lap_P1.Vcr', -1, 1, mtime, stat.size);
    const lap2 = db.getReplayTrajectoryCache('Multi_Lap_P1.Vcr', -1, 2, mtime, stat.size);

    expect(lap1).not.toBeNull();
    expect(lap2).not.toBeNull();
    expect(lap1?.currentLap).toBe(1);
    expect(lap2?.currentLap).toBe(2);
    expect(lap1?.points.length).toBeGreaterThan(0);
    expect(lap2?.points.length).toBeGreaterThan(0);
    // Each cached lap is a standalone record (no nested allLapsData duplication bloat)
    expect(lap1?.allLapsData).toBeUndefined();
    expect(lap2?.allLapsData).toBeUndefined();
  });

  it('counts invalid replay files as skipped instead of failing the whole sync', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'Not_A_Replay.Vcr'), Buffer.from('not a real replay file'));

    const result = db.syncReplaysFromDir(tempDir);
    expect(result.skipped).toBe(1);
    expect(result.added).toBe(0);
    expect(db.getReplaysCount()).toBe(0);
  });
});

describe('SessionDatabase AI report history', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  const buildReport = (overrides: Partial<AiReportRecord> = {}): AiReportRecord => ({
    cacheKey: overrides.cacheKey || 'key-1',
    replayName: 'Test_Replay_P1.Vcr',
    lapNumber: 3,
    model: 'gemini-3.7-flash',
    promptVersion: 1,
    report: { overallSummary: 'Brake later into T1.', improvements: [] },
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    generatedAt: Date.now(),
    ...overrides,
  });

  it('returns an empty list when no reports have been generated', () => {
    expect(db.getAiReportsList()).toEqual([]);
  });

  it('lists saved AI reports newest first with token usage and summary', () => {
    db.saveAiReport(buildReport({ cacheKey: 'key-old', generatedAt: 1000 }));
    db.saveAiReport(buildReport({ cacheKey: 'key-new', generatedAt: 2000, report: { overallSummary: 'Carry more mid-corner speed.', improvements: [] } }));

    const list = db.getAiReportsList();
    expect(list).toHaveLength(2);
    expect(list[0].cacheKey).toBe('key-new');
    expect(list[0].overallSummary).toBe('Carry more mid-corner speed.');
    expect(list[0].tokensUsed).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(list[1].cacheKey).toBe('key-old');
  });

  it('respects the limit parameter', () => {
    db.saveAiReport(buildReport({ cacheKey: 'key-1', generatedAt: 1000 }));
    db.saveAiReport(buildReport({ cacheKey: 'key-2', generatedAt: 2000 }));
    db.saveAiReport(buildReport({ cacheKey: 'key-3', generatedAt: 3000 }));

    const limited = db.getAiReportsList(2);
    expect(limited).toHaveLength(2);
    expect(limited[0].cacheKey).toBe('key-3');
    expect(limited[1].cacheKey).toBe('key-2');
  });
});

describe('DuckDB telemetry caching in SessionDatabase', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('persists and retrieves DuckDB metadata and lap telemetry cache', () => {
    const fileInfo = {
      filename: 'Bahrain_Test_P.duckdb',
      filePath: 'C:\\Telemetry\\Bahrain_Test_P.duckdb',
      fileMtimeMs: 1773000000000,
      fileSizeBytes: 2048,
      trackName: 'Bahrain International Circuit',
      sessionType: 'P',
      timestampStr: '2026-09-13T20:33:32Z',
      timestampEpochMs: 1773000000000,
      lapsCount: 5,
    };

    db.upsertTelemetryMetadata(fileInfo, 'session-123', 'Bahrain_P1.Vcr');

    const files = db.getTelemetryFiles();
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('Bahrain_Test_P.duckdb');
    expect(files[0].trackName).toBe('Bahrain International Circuit');

    const mockLapData = {
      lapNumber: 2,
      lapTimeSec: 91.45,
      pointsCount: 2,
      sampleRateHz: 100,
      points: [
        { x: 0, y: 0, z: 0, speedKmh: 120, throttle: 100, brake: 0, gear: 4 },
        { x: 0, y: 0, z: 0, speedKmh: 125, throttle: 100, brake: 0, gear: 4 },
      ],
    };

    db.upsertTelemetryLapCache(fileInfo.filename, 2, mockLapData);

    const cached = db.getTelemetryLapCache(fileInfo.filename, 2);
    expect(cached).not.toBeNull();
    expect(cached!.lapNumber).toBe(2);
    expect(cached!.lapTimeSec).toBe(91.45);
    expect(cached!.points).toHaveLength(2);
    expect(cached!.points[0].speedKmh).toBe(120);

    db.recordIngestError('duckdb', fileInfo.filePath, new Error('temporary read failure'));
    expect(db.getIngestErrors()).toEqual([
      expect.objectContaining({
        sourceType: 'duckdb',
        sourcePath: fileInfo.filePath,
        errorMessage: 'temporary read failure',
        attempts: 1,
      }),
    ]);
    db.recordIngestError('duckdb', fileInfo.filePath, 'retry failure');
    expect(db.getIngestErrors()[0].attempts).toBe(2);
    db.clearIngestError('duckdb', fileInfo.filePath);
    expect(db.getIngestErrors()).toHaveLength(0);

    db.upsertTelemetryLapCache(fileInfo.filename, 3, mockLapData);
    db.pruneTelemetryLapCache(365 * 24 * 60 * 60 * 1000, 1);
    expect(db.getTelemetryLapCache(fileInfo.filename, 2)).toBeNull();
    expect(db.getTelemetryLapCache(fileInfo.filename, 3)).toBeNull();

    // Verify clearTelemetryCache clears data
    db.clearTelemetryCache();
    expect(db.getTelemetryFiles()).toHaveLength(0);
    expect(db.getTelemetryLapCache(fileInfo.filename, 2)).toBeNull();
  });
});

