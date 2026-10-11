import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Database from 'better-sqlite3';
import { describe, it, expect, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { endpointInventory, coverageErrors } from '../../../tools/benchmarks/endpointInventory.js';
import { benchmarkCases, discoverCohort } from '../../../tools/benchmarks/endpointCases.js';
import { snapshotDatabase, startBenchmarkServer, measureRequest } from '../../../tools/benchmarks/endpointHarness.js';
import { summarize, timingDelta, comparisonReasons, renderReport, type BenchmarkRun } from '../../../tools/benchmarks/endpointReport.js';
import { SESSION_SUMMARY_PROJECTION_VERSION } from '../../../shared/types/sessionSummaries.js';
import { driver, lap, session } from '../../server/core/sessionRows/builders.js';

function run(): BenchmarkRun {
  return { schemaVersion: 1, timestamp: '2026-10-10T12:00:00.000Z', datasetHash: 'dataset', cohortHash: 'cohort', samples: 20,
    environment: { node: 'v24', platform: 'win32', architecture: 'x64', cpu: 'CPU', hostname: 'PC', pluginRevision: null },
    code: { commit: 'commit', dirty: false, diffHash: '' }, dataset: { sessions: 100 }, endpoints: [], measurements: [] };
}

describe('endpoint benchmark coverage and comparisons', () => {
  it('preserves HTTP failures when Express returns an HTML error page', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<!DOCTYPE html><html><body><pre>SqliteError: no such column: undefined</pre></body></html>',
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    ));
    try {
      const result = await measureRequest('http://localhost', '/api/session/example');
      expect(result.status).toBe(500);
      expect(result.body).toEqual({ error: 'SqliteError: no such column: undefined' });
    } finally { fetch.mockRestore(); }
  });

  it('classifies every current endpoint, including optional routes without private data', () => {
    const db = new SessionDatabase(':memory:');
    try {
      const cohort = discoverCohort(db);
      const inventory = endpointInventory(process.cwd());
      expect(inventory.length).toBeGreaterThan(20);
      expect(coverageErrors(inventory, benchmarkCases(cohort, db))).toEqual([]);
      expect(coverageErrors([...inventory, { method: 'GET', route: '/api/new-feature' }], benchmarkCases(cohort, db)))
        .toContain('Missing benchmark case: GET /api/new-feature');
      expect(coverageErrors([{ method: 'POST', route: '/api/new-action' }], []))
        .toContain('Classify the effects of POST /api/new-action before benchmarking it.');
    } finally { db.close(); }
  });

  it('calculates median and nearest-rank p95 without changing the raw samples', () => {
    const samples = [4, 1, 3, 2];
    expect(summarize(samples)).toEqual({ medianMs: 2.5, p95Ms: 4, minMs: 1, maxMs: 4 });
    expect(samples).toEqual([4, 1, 3, 2]);
    expect(() => summarize([])).toThrow();
    expect(() => summarize([NaN])).toThrow();
  });

  it('flags meaningful regressions and withholds misleading cross-dataset deltas', () => {
    const before = { id: 'dashboard', route: '/api/dashboard', url: '/api/dashboard', medianMs: 20 };
    const after = { ...before, medianMs: 30 };
    expect(timingDelta(after, before)).toEqual({ ms: 10, percent: 50, regression: true });
    expect(timingDelta({ ...after, medianMs: 24 }, before)?.regression).toBe(false);
    expect(timingDelta(after, { ...before, url: '/api/dashboard?page=2' })).toBeNull();
    expect(timingDelta({ ...after, error: 'HTTP 500' }, before)).toBeNull();
    const oldRun = { ...run(), measurements: [before] };
    const newRun = { ...run(), measurements: [after] };
    expect(renderReport(newRun, oldRun)).toContain('**REGRESSION**');
    newRun.datasetHash = 'changed';
    expect(comparisonReasons(newRun, oldRun)).toEqual(['database snapshot changed']);
    expect(renderReport(newRun, oldRun)).toContain('Deltas are withheld');
    expect(renderReport(newRun, oldRun)).not.toContain('**REGRESSION**');
  });

  it('copies committed WAL data without altering the original database, isolating benchmark writes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'endpoint-benchmark-test-'));
    const sourcePath = path.join(directory, 'source.db');
    const snapshotPath = path.join(directory, 'snapshot.db');
    const source = new Database(sourcePath);
    source.pragma('journal_mode=WAL');
    source.exec('CREATE TABLE values_table (value INTEGER); INSERT INTO values_table VALUES (42)');
    try {
      await snapshotDatabase(sourcePath, snapshotPath);
      const snapshot = new Database(snapshotPath);
      try {
        expect(snapshot.prepare('SELECT value FROM values_table').get()).toEqual({ value: 42 });
        snapshot.exec('DELETE FROM values_table');
        expect(source.prepare('SELECT value FROM values_table').get()).toEqual({ value: 42 });
      } finally { snapshot.close(); }
      await expect(snapshotDatabase(sourcePath, sourcePath)).rejects.toThrow('new, separate file');
    } finally {
      source.close();
      for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
      fs.rmdirSync(directory);
    }
  });

  it('rebuilds an outdated snapshot before serving HTTP and leaves the source database unchanged', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'endpoint-benchmark-rebuild-test-'));
    const sourcePath = path.join(directory, 'source.db');
    const snapshotPath = path.join(directory, 'snapshot.db');
    const source = new SessionDatabase(sourcePath);
    let server: Awaited<ReturnType<typeof startBenchmarkServer>> | undefined;
    const player = driver('Benchmark Driver', [lap(1)], { isPlayer: true });
    const fixture = session([player], { id: 'benchmark-rebuild-session' });
    try {
      source.upsertSession(fixture, fixture.filePath, 1, 1);
      source.getDb().prepare('UPDATE sessions SET projection_version = ? WHERE id = ?').run(0, fixture.id);
      expect(source.isSessionSummaryReady()).toBe(false);
      const sourceProjection = source.getDb().prepare('SELECT projection_version FROM sessions WHERE id = ?').get(fixture.id);

      await snapshotDatabase(sourcePath, snapshotPath);
      server = await startBenchmarkServer(snapshotPath);

      expect(server.store.isSessionSummaryReady()).toBe(true);
      expect(server.store.getDb().prepare('SELECT projection_version FROM sessions WHERE id = ?').get(fixture.id))
        .toEqual({ projection_version: SESSION_SUMMARY_PROJECTION_VERSION });
      const response = await measureRequest(server.baseUrl, '/api/sessions?page=1&pageSize=5');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ sessions: [{ id: fixture.id }] });
      expect(source.getDb().prepare('SELECT projection_version FROM sessions WHERE id = ?').get(fixture.id))
        .toEqual(sourceProjection);
      expect(source.isSessionSummaryReady()).toBe(false);
    } finally {
      if (server) await server.close();
      source.close();
      for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
      fs.rmdirSync(directory);
    }
  });
});
