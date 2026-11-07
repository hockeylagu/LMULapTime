/**
 * One 3D replay measurement: opens a lap in the running app's fullscreen 3D view in headless Edge on the real GPU (vsync and the
 * frame-rate limit off, so an animation-frame interval is the frame's cost), measures load, then plays the lap and reports
 * frame-time percentiles, long tasks, draws per pass, upload bytes and program links. Used by `run.ts` (one lap) and `suite.ts`
 * (the reference laps on a production build). See README.md.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { installProbe, type ProbeFrame, type ProbeState } from './probe.js';

interface Page {
  on(event: 'pageerror', listener: (error: Error) => void): void;
  addInitScript(script: {content: string}): Promise<void>;
  goto(url: string): Promise<unknown>;
  waitForFunction(callback: string, arg: null, options: {timeout: number; polling: number}): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  focus(selector: string): Promise<void>;
  keyboard: {press(key: string): Promise<void>};
  evaluate<T>(callback: string): Promise<T>;
  context(): {newCDPSession(page: Page): Promise<CdpSession>};
}
interface CdpSession { send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> }
interface CpuProfile { nodes: {id: number; callFrame: {functionName: string; url: string; lineNumber: number}}[]; samples: number[]; timeDeltas: number[] }
interface Browser { newPage(options: {viewport: {width: number; height: number}; deviceScaleFactor: number}): Promise<Page>; version(): string; close(): Promise<void> }
interface Chromium { launch(options: {channel: string; headless: boolean; args: string[]}): Promise<Browser> }

export interface LapOptions {
  session: string; driver: number; lap: number; seconds: number; label: string; base: string;
  width: number; height: number; skipOffscreenDraws: boolean;
  /** Sample the main thread during load and play (top functions; adds sampling overhead to frame times). */
  cpuProfile: boolean;
  /** Sample the main thread during load only (main-thread WebAssembly time), leaving the played frames unprofiled. */
  loadProfile?: boolean;
}

/** Playwright (or playwright-core) from `PLAYWRIGHT_NODE_MODULES`: the app does not depend on it. */
function loadChromium(): Chromium {
  const modules = process.env.PLAYWRIGHT_NODE_MODULES;
  if (!modules) throw Error('Set PLAYWRIGHT_NODE_MODULES to a directory whose node_modules has playwright or playwright-core.');
  const require = createRequire(`${modules.replaceAll('\\', '/')}/package.json`);
  const load = (name: string): {chromium: Chromium} | null => { try { return require(name) as {chromium: Chromium}; } catch { return null; } };
  const playwright = load('playwright') ?? load('playwright-core');
  if (!playwright) throw Error(`Neither playwright nor playwright-core resolves from ${modules}`);
  return playwright.chromium;
}

const percentile = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
export const round = (value: number | null, digits = 2) => value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const distribution = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)), p99: round(percentile(sorted, 0.99)), max: round(sorted.at(-1) ?? null)};
};
const longTaskSummary = (tasks: ProbeState['longTasks']) => ({
  count: tasks.length, totalMs: Math.round(tasks.reduce((sum, task) => sum + task.durationMs, 0)), maxMs: Math.round(Math.max(0, ...tasks.map(task => task.durationMs))),
});

/** Self time per sampled node (ms). */
function selfTimes(profile: CpuProfile): Map<number, number> {
  const self = new Map<number, number>();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000));
  return self;
}

/** Self time per function (ms), the 25 largest: where the main thread's time goes. */
function topFunctions(profile: CpuProfile) {
  const self = selfTimes(profile), byName = new Map<string, number>();
  for (const node of profile.nodes) {
    const ms = self.get(node.id);
    if (!ms) continue;
    const {functionName, url, lineNumber} = node.callFrame;
    const key = `${functionName || '(anonymous)'} ${url.replace(/^.*\/(node_modules\/\.vite\/deps|src|assets)\//, '').replace(/\?.*$/, '')}:${lineNumber + 1}`;
    byName.set(key, (byName.get(key) ?? 0) + ms);
  }
  return [...byName].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([fn, ms]) => ({fn, ms: Math.round(ms)}));
}

/** Main-thread WebAssembly self time (ms). Mesh decoding runs in workers, so on the main thread this is texture decoding. */
function wasmMs(profile: CpuProfile): number {
  const self = selfTimes(profile);
  return Math.round(profile.nodes.filter(node => node.callFrame.url.startsWith('wasm://')).reduce((sum, node) => sum + (self.get(node.id) ?? 0), 0));
}

const flags = ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--hide-scrollbars', '--force-color-profile=srgb'];

/** Measures one lap and saves the full result (worst frames and per-frame series too) under `.cache/replay-3d-performance/`. */
export async function measureLap(options: LapOptions) {
  const {session, driver, lap, seconds, label, base, width, height, skipOffscreenDraws, cpuProfile} = options, profileLoad = cpuProfile || options.loadProfile === true;
  const browser = await loadChromium().launch({channel: process.env.REPLAY3D_BROWSER ?? 'msedge', headless: true, args: flags});
  try {
    const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // tsx keeps function names through an `__name` helper; the page has no such helper, so give it a no-op one.
    await page.addInitScript({content: `var __name = f => f; (${installProbe.toString()})(${String(skipOffscreenDraws)});`});

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const startProfile = async () => { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', {interval: 250}); await cdp.send('Profiler.start'); };
    const stopProfile = async () => (await cdp.send<{profile: CpuProfile}>('Profiler.stop')).profile;
    if (profileLoad) await startProfile();
    const started = Date.now();
    const query = new URLSearchParams({sessionId: session, driverOrdinal: String(driver), lapOrdinal: String(lap), view: '3d', fullscreen: '1'});
    await page.goto(`${base}/#/telemetry?${query.toString()}`);
    // The renderer's canvas joins the page only once the first view is resident and warmed; a failed scene shows an alert instead.
    await page.waitForFunction(`document.querySelector('[data-replay-view="3d"] [role="alert"]')
      || (document.querySelector('[data-replay-view="3d"] canvas') && !document.body.innerText.includes('Loading 3D track surfaces'))`, null, {timeout: 600_000, polling: 100});
    const readyMs = Date.now() - started;
    const failure = await page.evaluate<string | null>(`document.querySelector('[data-replay-view="3d"] [role="alert"]')?.textContent ?? null`);
    if (failure) throw Error(`3D view failed: ${failure}`);
    const loadState = await page.evaluate<ProbeState>('window.replay3dProbe');
    // Package file requests until the first frame: how long the server took to answer (TTFB) and when the last one finished.
    const network = await page.evaluate<{startMs: number; ttfbMs: number; endMs: number; bytes: number}[]>(`performance.getEntriesByType('resource')
      .filter(entry => entry.name.includes('/api/data-plugin/'))
      .map(entry => ({startMs: entry.startTime, ttfbMs: entry.responseStart - entry.requestStart, endMs: entry.responseEnd, bytes: entry.encodedBodySize}))`);
    const loadProfile = profileLoad ? await stopProfile() : null;

    // Let the first view's deferred work drain, then record the lap playing.
    await page.waitForTimeout(1500);
    await page.focus('[data-replay-view="3d"]');
    await page.evaluate(`(() => { const probe = window.replay3dProbe; probe.longTasks = []; probe.frames = []; probe.programLinks = 0; probe.recording = true; })()`);
    if (cpuProfile) await startProfile();
    const metric = async () => Object.fromEntries((await cdp.send<{metrics: {name: string; value: number}[]}>('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const before = await metric();
    await page.keyboard.press('Space');
    await page.waitForTimeout(seconds * 1000);
    const after = await metric();
    const profile = cpuProfile ? await stopProfile() : null;
    // Renderer main-thread busy share while playing: task, script, style/layout time per wall second.
    const busy = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration'].map(key => [key.replace('Duration', 'Percent'), round((after[key] - before[key]) / seconds * 100, 1)]));
    const play = await page.evaluate<ProbeState>(`(() => { const probe = window.replay3dProbe; probe.recording = false; return probe; })()`);
    const environment = await page.evaluate<{gpu: string; heapMiB: number | null; devicePixelRatio: number}>(`(() => {
      const gl = document.createElement('canvas').getContext('webgl2'), info = gl?.getExtension('WEBGL_debug_renderer_info');
      const memory = performance.memory;
      return {gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown', heapMiB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null, devicePixelRatio};
    })()`);

    // The first frames after the recording flag include the play key's own work; skip them.
    const frames: ProbeFrame[] = play.frames.slice(5), rendered = frames.filter(frame => frame.mainDraws > 0).map(frame => frame.intervalMs);
    const result = {
      label, timestamp: new Date().toISOString(), skipOffscreenDraws, browser: browser.version(), ...environment, viewport: {width, height},
      lap: {session, driver, lap}, playedSeconds: seconds, errors,
      load: {
        readyMs, longTasks: longTaskSummary(loadState.longTasks),
        packageFiles: {
          count: network.length, MiB: round(network.reduce((sum, entry) => sum + entry.bytes, 0) / 1048576, 1),
          ttfbMs: distribution(network.map(entry => entry.ttfbMs)),
          firstStartMs: round(Math.min(...network.map(entry => entry.startMs)), 0), lastEndMs: round(Math.max(0, ...network.map(entry => entry.endMs)), 0),
        },
        ...(loadProfile ? {mainThreadWasmMs: wasmMs(loadProfile)} : {}),
      },
      frames: {
        // The scene draws only when something changed; idle animation frames (no main-pass draw) would pull the percentiles down.
        count: frames.length, rendered: rendered.length, ms: distribution(rendered),
        over16ms: rendered.filter(ms => ms > 16).length, over33ms: rendered.filter(ms => ms > 33).length,
        callbackMs: distribution(frames.filter(frame => frame.mainDraws > 0).map(frame => frame.callbackMs)),
        mainDraws: distribution(frames.map(frame => frame.mainDraws)),
        offscreenDraws: distribution(frames.map(frame => frame.offscreenDraws)),
        uploadMiB: distribution(frames.map(frame => frame.uploadBytes / 1048576)),
      },
      playLongTasks: longTaskSummary(play.longTasks), playProgramLinks: play.programLinks, mainThread: busy,
      ...(profile && loadProfile ? {cpuTopLoad: topFunctions(loadProfile), cpuTopPlay: topFunctions(profile)} : {}),
    };
    const worstFrames = [...frames].sort((a, b) => b.intervalMs - a.intervalMs).slice(0, 10).map(frame => ({...frame, intervalMs: round(frame.intervalMs, 1)}));
    const directory = path.join('.cache', 'replay-3d-performance');
    fs.mkdirSync(directory, {recursive: true});
    const file = path.join(directory, `${label.replace(/[^\w.-]+/g, '_')}-${result.timestamp.replace(/[:.]/g, '-')}.json`);
    // The whole series, compact: [interval ms, main draws, offscreen draws, upload KiB, program links, callback ms] per frame.
    const series = frames.map(frame => [round(frame.intervalMs, 1), frame.mainDraws, frame.offscreenDraws, Math.round(frame.uploadBytes / 1024), frame.programLinks, round(frame.callbackMs, 2)]);
    fs.writeFileSync(file, JSON.stringify({...result, worstFrames, series}));
    // The raw profiles open in DevTools (Performance > Load profile) for a timeline of the load and of the played frames.
    if (loadProfile) fs.writeFileSync(file.replace(/\.json$/, '.load.cpuprofile'), JSON.stringify(loadProfile));
    if (profile) fs.writeFileSync(file.replace(/\.json$/, '.play.cpuprofile'), JSON.stringify(profile));
    return {result, file};
  } finally {
    await browser.close();
  }
}
