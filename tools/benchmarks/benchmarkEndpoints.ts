import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { snapshotDatabase, startBenchmarkServer, measureRequest } from './endpointHarness.js';
import { discoverCohort, benchmarkCases, type BenchmarkCohort } from './endpointCases.js';
import { endpointInventory, coverageErrors } from './endpointInventory.js';
import { summarize, renderReport, type BenchmarkRun, type Measurement } from './endpointReport.js';
import { dataPlugin } from '../../server/plugins/dataPlugin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

async function main() {
  const args = process.argv.slice(2);
  let samples = 20;
  let source = path.join(root, 'server/lmu_cache.db');
  let output = path.join(root, '.cache/endpoint-benchmarks');
  let refreshCohort = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--samples') samples = Number(args[++index]);
    else if (arg === '--db') source = path.resolve(args[++index] ?? '');
    else if (arg === '--output') output = path.resolve(args[++index] ?? '');
    else if (arg === '--refresh-cohort') refreshCohort = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(samples) || samples < 5 || samples > 200) throw new Error('--samples must be an integer from 5 to 200.');
  fs.mkdirSync(output, { recursive: true });
  const history = path.join(output, 'history');
  fs.mkdirSync(history, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(output, 'snapshot-'));
  const snapshot = path.join(temporary, 'benchmark.db');
  let server: Awaited<ReturnType<typeof startBenchmarkServer>> | undefined;
  try {
    console.log('Taking a consistent SQLite snapshot; the source database stays unchanged...');
    await snapshotDatabase(source, snapshot);
    const digest = createHash('sha256');
    for await (const chunk of fs.createReadStream(snapshot)) digest.update(chunk);
    const datasetHash = digest.digest('hex');
    server = await startBenchmarkServer(snapshot);
    const cohortFile = path.join(output, 'cohort.json');
    const cohort = !refreshCohort && fs.existsSync(cohortFile) ? JSON.parse(fs.readFileSync(cohortFile, 'utf8')) as BenchmarkCohort : discoverCohort(server.store);
    const cases = benchmarkCases(cohort, server.store);
    const endpoints = endpointInventory(root);
    const errors = coverageErrors(endpoints, cases);
    if (errors.length) throw new Error(errors.join('\n'));
    if (refreshCohort || !fs.existsSync(cohortFile)) fs.writeFileSync(cohortFile, JSON.stringify(cohort, null, 2) + '\n');
    const dataset: Record<string, number> = {};
    for (const table of ['sessions', 'session_drivers', 'session_laps', 'replay_trajectories', 'telemetry_lap_cache']) {
      dataset[table] = (server.store.getDb().prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;
    }
    const git = (...arguments_: string[]) => execFileSync('git', arguments_, { cwd: root, encoding: 'utf8' }).trim();
    const diff = git('diff', 'HEAD', '--', 'server', 'shared', 'src', 'tools/benchmarks', 'package.json', 'package-lock.json');
    const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'server', 'shared', 'src', 'tools/benchmarks')
      .split('\n').filter(Boolean).sort().map(file => `${file}\n${fs.readFileSync(path.join(root, file), 'utf8')}`).join('\n');
    const run: BenchmarkRun = {
      schemaVersion: 1, timestamp: new Date().toISOString(), datasetHash, cohortHash: hash(JSON.stringify(cohort)), samples,
      environment: { node: process.version, platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model ?? '',
        hostname: os.hostname(), pluginRevision: dataPlugin.status.revision },
      code: { commit: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')), diffHash: hash(diff + untracked) },
      dataset, endpoints, measurements: [],
    };
    for (const item of cases) {
      const measurement: Measurement = { ...item };
      run.measurements.push(measurement);
      if (item.skip || !item.url) { console.log(`${item.id}: skipped (${item.skip})`); continue; }
      try {
        const first = await measureRequest(server.baseUrl, item.url);
        measurement.firstMs = first.ms; measurement.status = first.status; measurement.bytes = first.bytes;
        if (first.status < 200 || first.status >= 300) {
          const message = record(first.body) && typeof first.body.error === 'string' ? first.body.error : 'Unexpected HTTP response';
          throw new Error(`HTTP ${first.status}: ${message}`);
        }
        if (record(first.body)) {
          if (typeof first.body.source === 'string') measurement.source = first.body.source;
          if (typeof first.body.pointsCount === 'number') measurement.pointsCount = first.body.pointsCount;
          if (first.body.available === false) {
            measurement.skip = typeof first.body.reason === 'string' ? first.body.reason : 'Data unavailable';
            console.log(`${item.id}: unavailable (${measurement.skip})`); continue;
          }
        }
        const timings: number[] = [];
        for (let index = 0; index < samples; index++) {
          const sample = await measureRequest(server.baseUrl, item.url);
          if (sample.status !== first.status) throw new Error(`HTTP status changed to ${sample.status}`);
          timings.push(sample.ms);
        }
        Object.assign(measurement, summarize(timings), { samplesMs: timings });
        console.log(`${item.id}: ${measurement.medianMs?.toFixed(2)} ms median; ${measurement.p95Ms?.toFixed(2)} ms p95`);
      } catch (error: unknown) {
        measurement.error = error instanceof Error ? error.message : String(error);
        console.log(`${item.id}: ERROR ${measurement.error}`);
        process.exitCode = 1;
      }
    }
    const previousFiles = fs.readdirSync(history).filter(file => file.endsWith('.json')).sort();
    const previousFile = previousFiles[previousFiles.length - 1];
    const previous = previousFile ? JSON.parse(fs.readFileSync(path.join(history, previousFile), 'utf8')) as BenchmarkRun : undefined;
    const stem = run.timestamp.replace(/:/g, '-');
    const report = renderReport(run, previous);
    fs.writeFileSync(path.join(history, `${stem}.json`), JSON.stringify(run, null, 2) + '\n');
    fs.writeFileSync(path.join(history, `${stem}.md`), report);
    fs.writeFileSync(path.join(output, 'latest.md'), report);
    console.log(`Saved ${path.join(output, 'latest.md')}`);
  } finally {
    if (server) await server.close();
    // Only files under this run's freshly created directory are ever removed.
    for (const filename of fs.readdirSync(temporary)) fs.unlinkSync(path.join(temporary, filename));
    fs.rmdirSync(temporary);
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
