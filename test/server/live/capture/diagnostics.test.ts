import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveDiagnostics } from '../../../../server/live/capture/diagnostics.js';

const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), 'lmu-diagnostics-'));
  directories.push(directory);
  const diagnostics = new LiveDiagnostics(directory);
  diagnostics.begin('test.live.duckdb', 'recording-1');
  return { directory, diagnostics };
}

async function records(directory: string) {
  const filenames = await readdir(directory);
  const contents = await Promise.all(filenames.map(async filename => ({ filename,
    text: gunzipSync(await readFile(path.join(directory, filename))).toString('utf8'),
  })));
  return contents.map(file => ({ ...file, rows: file.text.trim().split('\n').map(line => JSON.parse(line) as {
    kind: string; data: Record<string, unknown>; suppressed: number; droppedBefore: number;
  }) }));
}

describe('disposable live diagnostic sidecars', () => {
  it('deduplicates successful payloads, checkpoints them, and retains every failure before gzip', async () => {
    const { directory, diagnostics } = await setup();
    const response = (at: number, outcome = 'ok') => diagnostics.record({ kind: 'rest', at, data: {
      path: '/test', startedAt: Date.now(), finishedAt: at, durationMs: at,
      outcome, parser: 'accepted', disposition: 'applied', body: { value: 1 },
    } });
    response(1000); response(2000); response(61_000); response(62_000, 'timeout'); response(63_000, 'timeout');
    diagnostics.end();
    diagnostics.record({ kind: 'navigation', at: 64_000, data: { screen: 'menu' } });
    await diagnostics.stop();
    const [file] = await records(directory);
    expect(file.filename).toMatch(/\.diagnostics\.jsonl\.gz$/);
    const requests = file.rows.filter(row => row.kind === 'rest');
    expect(requests).toHaveLength(4);
    expect(requests[1].suppressed).toBe(1);
    expect(file.rows.some(row => row.kind === 'navigation' && row.data.screen === 'menu')).toBe(true);
    expect(file.rows[file.rows.length - 1]?.kind).toBe('diagnostics-end');
  });

  it('keeps delayed requests with their original session and does not mix new sessions', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const { directory, diagnostics } = await setup();
    const oldRequest = diagnostics.sink();
    diagnostics.begin('second.live.duckdb', 'recording-2');
    await vi.advanceTimersByTimeAsync(120_000);
    oldRequest?.({ kind: 'late-response', at: Date.now(), data: { disposition: 'stale-discarded' } });
    diagnostics.record({ kind: 'new-response', at: Date.now(), data: {} });
    await diagnostics.stop();
    const files = await records(directory);
    expect(files).toHaveLength(2);
    const old = files.find(file => file.rows[0].data.recordingId === 'recording-1')!;
    const current = files.find(file => file.rows[0].data.recordingId === 'recording-2')!;
    expect(old.rows.some(row => row.kind === 'late-response')).toBe(true);
    expect(current.rows.some(row => row.kind === 'late-response')).toBe(false);
    expect(current.rows.some(row => row.kind === 'new-response')).toBe(true);
  });

  it('reports overflow instead of building an unbounded write queue', async () => {
    const { directory, diagnostics } = await setup();
    diagnostics.record({ kind: 'oversized', at: Date.now(), data: 'x'.repeat(300_000) });
    diagnostics.record({ kind: 'small', at: Date.now(), data: {} });
    await diagnostics.stop();
    const [file] = await records(directory);
    expect(file.rows.some(row => row.kind === 'oversized')).toBe(false);
    expect(file.rows.find(row => row.kind === 'small')?.droppedBefore).toBe(1);
  });

  it('writes nothing for a session that starts while the setting is off, and ends the previous file', async () => {
    const { directory, diagnostics } = await setup();
    diagnostics.enabled = false;
    diagnostics.begin('second.live.duckdb', 'recording-2');
    expect(diagnostics.sink()).toBeUndefined();
    diagnostics.record({ kind: 'new-response', at: Date.now(), data: {} });
    await diagnostics.stop();
    const files = await records(directory);
    expect(files).toHaveLength(1);
    expect(files[0].rows[0].data.recordingId).toBe('recording-1');
    expect(files[0].rows.some(row => row.kind === 'new-response')).toBe(false);
  });
});
