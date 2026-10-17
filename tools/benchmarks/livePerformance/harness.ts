import express from 'express';
import { Worker } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { build } from 'vite';
import Database from 'better-sqlite3';
import { LiveService } from '../../../server/live/liveService.js';
import { createLiveAuditWriter } from '../../../server/core/live/dbLiveAuditStore.js';
import { SSE_HEADERS } from '../../../server/live/sse.js';

const output = path.resolve('.cache/live-performance');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'index.html'), '<html><body><div id="root"></div><script type="module" src="/tools/benchmarks/livePerformance/browser.tsx"></script></body></html>');
await build({
  configFile: false, logLevel: 'warn',
  build: { outDir: path.join(output, 'site'), emptyOutDir: true,
    rolldownOptions: { input: path.join(output, 'index.html') } },
});
const db = new Database(path.join(output, `audit-${Date.now()}.db`));
db.pragma('journal_mode = WAL');
db.exec('CREATE TABLE live_strategy_audit (run_id TEXT, sequence INTEGER, recorded_at INTEGER, record_json TEXT)');
let auditWrites = 0;
let auditMs = 0;
const save = createLiveAuditWriter(db);
const worker = new Worker('import { register } from "tsx/esm/api"; register(); await import(process.env.LIVE_PERF_FEED);', {
  eval: true, env: { ...process.env, LIVE_PERF_FEED: new URL('./feed.ts', import.meta.url).href },
});
let frames = 0;
const workerTransitMs: number[] = [];
const sampleToMainMs: number[] = [];
worker.on('message', (message: { type?: string; benchmarkPostedAt?: number; pedal?: { t: number } }) => {
  if (message.type !== 'frame') return;
  frames++;
  if (message.benchmarkPostedAt) workerTransitMs.push(Date.now() - message.benchmarkPostedAt);
  if (message.pedal) sampleToMainMs.push(Date.now() - message.pedal.t * 1000);
});
const restCalls: Record<string, number> = {};
const startedAt = Date.now();
const live = new LiveService({
  createWorker: () => worker,
  saveAuditRecord: record => { const at = performance.now(); save(record); auditMs += performance.now() - at; auditWrites++; },
  identity: { readNavigation: async () => ({ ok: false }) },
  pit: { get: async route => {
    restCalls[route] = (restCalls[route] ?? 0) + 1;
    if (route === '/navigation/state') return { ok: true, body: { state: { settingMode: 'SETTING_GRANDPRIX' } } };
    if (route === '/rest/watch/standings') return { ok: true, body: [{ player: true, veFraction: 0.8 - (Date.now() - startedAt) / 4_000_000, pitState: 'NONE', penalties: 0 }] };
    return { ok: false, reason: 'status' };
  } },
});
const app = express();
app.get('/', (_req, res) => res.sendFile(path.join(output, 'site/.cache/live-performance/index.html'), { dotfiles: 'allow' }));
app.get('/api/live/stream', (req, res) => {
  res.writeHead(200, SSE_HEADERS); res.flushHeaders();
  const remove = live.addClient(res); req.on('close', remove);
});
app.use(express.static(path.join(output, 'site')));
const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();
let cpu = process.cpuUsage();
let at = performance.now();
app.get('/metrics', (_req, res) => {
  const elapsedMs = performance.now() - at;
  const used = process.cpuUsage(cpu);
  const quantiles = (values: number[]) => {
    values.sort((a, b) => a - b);
    return { count: values.length, p50: values[Math.floor(values.length * .5)] ?? null,
      p95: values[Math.floor(values.length * .95)] ?? null, max: values[values.length - 1] ?? null };
  };
  res.json({ elapsedMs, cpuOneCorePercent: (used.user + used.system) / (elapsedMs * 10),
    frames, restCalls, auditWrites, auditMs,
    workerTransitMs: quantiles(workerTransitMs), sampleToMainMs: quantiles(sampleToMainMs),
    eventLoopP95Ms: delay.percentile(95) / 1e6, eventLoopMaxMs: delay.max / 1e6,
    rssMiB: process.memoryUsage().rss / 1024 ** 2 });
  cpu = process.cpuUsage(); at = performance.now(); delay.reset(); frames = 0; auditWrites = 0; auditMs = 0;
  for (const key of Object.keys(restCalls)) delete restCalls[key];
  workerTransitMs.length = 0; sampleToMainMs.length = 0;
});
const server = app.listen(3099, '127.0.0.1', () => { live.start(); console.log('Live performance harness: http://127.0.0.1:3099'); });
const stop = () => { live.stop(); delay.disable(); server.close(); db.close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
