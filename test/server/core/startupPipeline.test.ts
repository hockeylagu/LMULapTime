import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionDatabase } from '../../../server/core/db.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { LmuParser } from '../../../server/sessions/parser.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import { ReplayRecordingService } from '../../../server/replay/replayRecordingService.js';
import { FileIngestWorker } from '../../../server/core/ingest/fileIngestWorkerClient.js';
import { parseReferenceCsv } from '../../../server/benchmarks/referenceLaptimes.js';

describe('XML-first startup pipeline', () => {
  let dir: string;
  let db: SessionDatabase;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-startup-')); db = new SessionDatabase(':memory:'); });
  afterEach(() => { vi.restoreAllMocks(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('publishes ten XML sessions before the remaining files are parsed and retains them if the scan stops', () => {
    const fixture = fs.readFileSync(path.join(process.cwd(), 'test/fixtures/results/2026_05_28_P1.xml'));
    for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(dir, `session_${i}.xml`), fixture);
    const iterator = db.syncSessionsIterator(dir, new LmuParser(undefined, undefined, { detectPlayer: false }));
    let step = iterator.next();
    while (!step.done && step.value.stage !== 'Published XML sessions') step = iterator.next();
    expect(step.done).toBe(false); expect(Array.from(db.iterateDetailedSessions())).toHaveLength(10);
    expect(db.getMetadata('parser_version')).toBeNull();
    iterator.return(undefined as never);
    expect(Array.from(db.iterateDetailedSessions())).toHaveLength(10);
    expect(db.syncSessionsFromDir(dir, new LmuParser(undefined, undefined, { detectPlayer: false })).total).toBe(12);
  });

  it('parses XML in a worker while the main event loop remains available', async () => {
    const worker = new FileIngestWorker();
    try {
      const parsing = worker.parseXml(path.join(process.cwd(), 'test/fixtures/results/2026_05_28_P1.xml'), 'Driver Alpha', []);
      let served = false; await new Promise<void>(resolve => setImmediate(() => { served = true; resolve(); }));
      expect(served).toBe(true); expect((await parsing)?.drivers.length).toBeGreaterThan(0);
    } finally { await worker.close(); }
  });

  it('updates the reusable XML worker from explicit benchmark snapshots, including an empty cache', async () => {
    const worker = new FileIngestWorker();
    const fixture = path.join(process.cwd(), 'test/fixtures/results/2026_05_28_P1.xml');
    const cache = parseReferenceCsv('SpaLMH,Spa,1.4+,,2:00.000,2:01.200,2:02.400,2:03.600,2:04.800,2:06.000,2:07.200,2:08.400,Ferrari 499P,,,,LMH');
    try {
      const parsed = await worker.parseXml(fixture, 'TestPlayer', [], cache);
      expect(parsed?.drivers[0].laps[0].target100Sec).toBe(120);
      const withoutBenchmarks = await worker.parseXml(fixture, 'TestPlayer', [], null);
      expect(withoutBenchmarks?.drivers[0].laps[0].target100Sec).toBeUndefined();
    } finally { await worker.close(); }
  });

  it('changes the data revision when session data changes and on a server restart', () => {
    const context = () => new ServerContext({ resultsDir: dir, replaysDir: dir, telemetryDir: dir, parser: new LmuParser(),
      sessionDb: db, telemetryCatalog: new TelemetryCatalog(db), replayRecordings: new ReplayRecordingService(db) });
    const first = context(); const old = first.getScanStatus().dataRevision;
    db.markSessionDataChanged(); expect(first.getScanStatus().dataRevision).not.toBe(old);
    expect(context().getScanStatus().dataRevision).not.toBe(first.getScanStatus().dataRevision);
  });

  it('yields while reconciling stored replay links and keeps scan status incomplete', async () => {
    const metadata = new Map<string, string>();
    const sessionDb = {
      getAllStoredReplayFiles: () => [],
      getMetadata: (key: string) => metadata.get(key) ?? null,
      setMetadata: (key: string, value: string) => { metadata.set(key, value); },
      reconcileReplayPlayerOwnership: vi.fn(),
      invalidateUnresolvedReplayDefaults: vi.fn(),
      getReplayReconciliationCandidateIds: vi.fn(() => Array.from({ length: 25 }, (_, index) => `stored-${index}`)),
      getSessionsByIds: (ids: string[]) => ids.map((id, index) => ({
        id, filename: `${id}.xml`, filePath: '', timestamp: index,
        trackVenue: '', trackCourse: '', trackLengthMeters: null, sessionType: 'Race', sessionName: 'R1', drivers: [],
      } as unknown as import('../../../shared/types/index.js').DetailedSession)),
    } as unknown as SessionDatabase;
    const context = new ServerContext({ resultsDir: dir, replaysDir: dir, telemetryDir: dir, parser: new LmuParser(),
      sessionDb, telemetryCatalog: new TelemetryCatalog(sessionDb), replayRecordings: new ReplayRecordingService(sessionDb) });
    const reconciliation = context.reconcileSessionReplayLinks();
    await new Promise<void>(resolve => setImmediate(() => {
      expect(context.getScanStatus().allComplete).toBe(false);
      resolve();
    }));
    await reconciliation;
    expect(context.getScanStatus().allComplete).toBe(true);
    // The next run only looks at what changed since this one.
    await context.reconcileSessionReplayLinks();
    const calls = vi.mocked(sessionDb.getReplayReconciliationCandidateIds).mock.calls;
    expect(calls[0][0]).toBe(0);
    expect(calls[1][0]).toBeGreaterThan(0);
  });

  it('runs a replay sync asked for during link reconciliation once it ends', async () => {
    const sessionDb = {
      getAllStoredReplayFiles: () => [],
      getMetadata: () => null,
      setMetadata: () => undefined,
      reconcileReplayPlayerOwnership: vi.fn(),
      invalidateUnresolvedReplayDefaults: vi.fn(),
      getReplayReconciliationCandidateIds: () => [],
      getSessionsByIds: () => [],
      syncReplaysAsyncIterator: vi.fn(async function* () { return { total: 0, added: 0, updated: 0, skipped: 0 }; }),
    } as unknown as SessionDatabase;
    const context = new ServerContext({ resultsDir: dir, replaysDir: dir, telemetryDir: dir, parser: new LmuParser(),
      sessionDb, telemetryCatalog: new TelemetryCatalog(sessionDb), replayRecordings: new ReplayRecordingService(sessionDb) });
    const reconciliation = context.reconcileSessionReplayLinks();

    expect(context.runReplaySyncInBackground()).toBe(false);
    expect(sessionDb.syncReplaysAsyncIterator).not.toHaveBeenCalled();
    await reconciliation;
    expect(sessionDb.syncReplaysAsyncIterator).toHaveBeenCalledTimes(1);
  });
});
