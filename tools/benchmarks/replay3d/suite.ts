/**
 * The 3D replay reference suite: builds the app for production, serves it with `vite preview` (which proxies `/api` to the
 * backend like the dev server), checks that the backend's package has scenery for each reference layout, then measures every
 * reference lap `--runs` times, interleaved, and prints the medians. Compare suite results only with each other (same machine,
 * same viewport). See README.md for the method.
 *
 *   npm run benchmark:replay3d:suite -- --package <label> [--runs 3] [--seconds 40] [--laps fuji,silverstone] [--width 1920 --height 1080]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build, preview } from 'vite';
import { measureLap, round } from './measure.js';

/** Reference laps: a layout with a textured car in every package, driven by a car whose body validates. */
const REFERENCE_LAPS = {
  fuji: {layoutKey: 'fuji_chicane', session: '2026_11_03_16_37_20-02R1', driver: 8, lap: 10, car: 'ADESS AD25 LMP3'},
  silverstone: {layoutKey: 'silverstone_international', session: '2026_10_30_12_58_04-48R1', driver: 1, lap: 20, car: 'BMW M4 LMGT3'},
} as const;
type LapName = keyof typeof REFERENCE_LAPS;
const isLapName = (name: string): name is LapName => Object.hasOwn(REFERENCE_LAPS, name);

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const packageLabel = option('package', '');
if (!packageLabel) throw Error('Name the package the backend serves: --package <label> (for example debug-perf or personal-v2).');
const runs = Number(option('runs', '3')), seconds = Number(option('seconds', '40'));
const width = Number(option('width', '1920')), height = Number(option('height', '1080')), port = Number(option('port', '4173'));
const laps = option('laps', Object.keys(REFERENCE_LAPS).join(',')).split(',');
if (!laps.every(isLapName)) throw Error(`Unknown lap in --laps; known: ${Object.keys(REFERENCE_LAPS).join(', ')}`);
if (![runs, seconds, width, height, port].every(value => Number.isInteger(value) && value > 0)) throw Error('Invalid numeric option');

const directory = path.join('.cache', 'replay-3d-performance'), outDir = path.resolve(directory, 'dist');
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {encoding: 'utf8'}).trim() !== '';

await build({logLevel: 'warn', build: {outDir, emptyOutDir: true}});
const server = await preview({logLevel: 'warn', build: {outDir}, preview: {port, strictPort: true, open: false}});
const base = `http://localhost:${port}`;
try {
  for (const name of laps) {
    const response = await fetch(`${base}/api/data-plugin/scenery/${REFERENCE_LAPS[name].layoutKey}`);
    if (!response.ok) throw Error(`The backend has no 3D scenery for ${REFERENCE_LAPS[name].layoutKey} (HTTP ${response.status}). Start it with LMU_PLUGIN_ROOT on the ${packageLabel} package.`);
  }
  const results: Record<string, Awaited<ReturnType<typeof measureLap>>['result'][]> = {};
  for (let run = 1; run <= runs; run++) {
    for (const name of laps) {
      const {session, driver, lap} = REFERENCE_LAPS[name];
      const {result} = await measureLap({session, driver, lap, seconds, width, height, base, label: `suite-${packageLabel}-${name}`, skipOffscreenDraws: false, cpuProfile: false, loadProfile: true});
      if (result.errors.length) throw Error(`${name} run ${run}: page errors: ${result.errors.join('; ')}`);
      (results[name] ??= []).push(result);
      console.log(`${name} run ${run}/${runs}: first frame ${(result.load.readyMs / 1000).toFixed(1)} s, p50 ${result.frames.ms.p50} ms, p99 ${result.frames.ms.p99} ms`);
    }
  }
  const median = (values: (number | null | undefined)[]) => {
    const sorted = values.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
    return sorted.length ? round(sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, 1) : null;
  };
  const summary = Object.fromEntries(Object.entries(results).map(([name, rows]) => [name, {
    firstFrameMs: median(rows.map(row => row.load.readyMs)),
    filesDoneMs: median(rows.map(row => row.load.packageFiles.lastEndMs)),
    filesMiB: median(rows.map(row => row.load.packageFiles.MiB)),
    mainThreadWasmMs: median(rows.map(row => row.load.mainThreadWasmMs)),
    loadLongTaskMs: median(rows.map(row => row.load.longTasks.totalMs)),
    p50Ms: median(rows.map(row => row.frames.ms.p50)), p99Ms: median(rows.map(row => row.frames.ms.p99)),
    over16ms: median(rows.map(row => row.frames.over16ms)), heapMiB: median(rows.map(row => row.heapMiB)),
  }]));
  const first = Object.values(results)[0][0];
  const method = {
    package: packageLabel, commit: dirty ? `${commit} + uncommitted changes` : commit, build: 'production (vite build + vite preview)',
    browser: `${process.env.REPLAY3D_BROWSER ?? 'msedge'} ${first.browser}, headless, ANGLE D3D11, vsync and frame-rate limit off`,
    gpu: first.gpu, viewport: `${width}x${height} at device pixel ratio 1`, runs, playedSeconds: seconds,
    laps: Object.fromEntries(laps.map(name => [name, REFERENCE_LAPS[name]])),
  };
  const timestamp = new Date().toISOString();
  const file = path.join(directory, `suite-${packageLabel.replace(/[^\w.-]+/g, '_')}-${timestamp.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({timestamp, method, summary, runs: results}, null, 1));
  console.log(JSON.stringify({method, summary}, null, 1));
  console.log(`Saved ${file}`);
} finally {
  await server.close();
}
