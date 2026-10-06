import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionDatabase } from '../../../server/core/db.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { LmuParser } from '../../../server/sessions/parser.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import { ReplayCacheService } from '../../../server/replay/replayCacheService.js';
import { FileIngestWorker } from '../../../server/core/ingest/fileIngestWorkerClient.js';
import { parseReferenceCsv } from '../../../server/benchmarks/referenceLaptimes.js';
import type { ReplayIngestJob } from '../../../shared/types/index.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

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
    expect(step.done).toBe(false); expect(db.getAllSessions()).toHaveLength(10);
    expect(db.getMetadata('parser_version')).toBeNull();
    iterator.return(undefined as never);
    expect(db.getAllSessions()).toHaveLength(10);
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

  it('retries a failed replay decode on Refresh without changing its source file', async () => {
    fs.writeFileSync(path.join(dir, 'retry.Vcr'), createSliceVcrBuffer({
      drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [{ sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 }, { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 }] }));
    const store = vi.spyOn(db, 'replaceReplayDriverLaps').mockImplementation(() => { throw new Error('Disk busy'); });
    const jobs: ReplayIngestJob[] = [];
    const run = async () => {
      const iterator = db.syncReplaysAsyncIterator(dir, { retryFailed: true, onReplayState: job => jobs.push(job) });
      let step = await iterator.next(); while (!step.done) step = await iterator.next();
    };
    await run(); expect(jobs[jobs.length - 1]).toMatchObject({ status: 'queued' });
    expect(db.getReplayDriverIngest('retry.Vcr', -1)).toMatchObject({ status: 'interrupted', error: 'Disk busy' });
    store.mockRestore(); await run(); expect(jobs[jobs.length - 1]?.status).toBe('ready');
    expect(db.getStoredReplayTrajectory('retry.Vcr', -1, -1)).not.toBeNull();
  });

  it('decodes the newest replay first, whatever the filenames', async () => {
    const bytes = createSliceVcrBuffer({ drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [{ sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 }, { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 }] });
    const write = (name: string, date: Date) => { fs.writeFileSync(path.join(dir, name), bytes); fs.utimesSync(path.join(dir, name), date, date); };
    write('A old.Vcr', new Date('2026-09-01T12:00:00Z'));
    write('B newest.Vcr', new Date('2026-10-05T12:00:00Z'));
    write('C middle.Vcr', new Date('2026-09-20T12:00:00Z'));
    const processing: string[] = [];
    const iterator = db.syncReplaysAsyncIterator(dir, { playerName: 'Player',
      onReplayState: job => { if (job.status === 'processing') processing.push(job.name); } });
    let step = await iterator.next(); while (!step.done) step = await iterator.next();

    expect(processing).toEqual(['B newest.Vcr', 'C middle.Vcr', 'A old.Vcr']);
  });

  it('discovers all replay metadata before decoding only associated recordings and reuses cached decodes', async () => {
    const bytes = createSliceVcrBuffer({ drivers: [{ name: 'Player', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' }],
      slices: [{ sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 }, { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 }] });
    fs.writeFileSync(path.join(dir, 'associated.Vcr'), bytes); fs.writeFileSync(path.join(dir, 'unrelated.Vcr'), bytes);
    const jobs: ReplayIngestJob[] = [];
    const run = async () => {
      const iterator = db.syncReplaysAsyncIterator(dir, { playerName: 'Player',
        onMetadataReady: () => { expect(db.getReplaysCount()).toBe(2); expect(db.getCacheStats().replayTrajectoriesCount).toBe(0); return new Set(['associated.Vcr']); },
        onReplayState: job => jobs.push(job) });
      let step = await iterator.next(); while (!step.done) step = await iterator.next(); return step.value;
    };
    expect((await run()).added).toBe(2);
    expect(jobs.map(job => job.status)).toEqual(['queued', 'processing', 'ready']);
    expect(jobs.every(job => job.name === 'associated.Vcr')).toBe(true);
    expect(db.getStoredReplayTrajectory('associated.Vcr', -1, -1)).not.toBeNull();
    expect(db.getStoredReplayTrajectory('unrelated.Vcr', -1, -1)).toBeNull();
    const store = vi.spyOn(db, 'replaceReplayDriverLaps');
    const iterator = db.syncReplaysAsyncIterator(dir, { onMetadataReady: () => new Set(['associated.Vcr']) });
    let step = await iterator.next(); while (!step.done) step = await iterator.next();
    expect(store).not.toHaveBeenCalled(); expect(step.value).toMatchObject({ added: 0, updated: 0 });
  });

  it('changes the data revision when session data changes and on a server restart', () => {
    const context = () => new ServerContext({ resultsDir: dir, replaysDir: dir, telemetryDir: dir, parser: new LmuParser(),
      sessionDb: db, telemetryCatalog: new TelemetryCatalog(db), replayCache: new ReplayCacheService(db) });
    const first = context(); const old = first.getScanStatus().dataRevision;
    db.invalidateSessionCache(); expect(first.getScanStatus().dataRevision).not.toBe(old);
    expect(context().getScanStatus().dataRevision).not.toBe(first.getScanStatus().dataRevision);
  });
});
