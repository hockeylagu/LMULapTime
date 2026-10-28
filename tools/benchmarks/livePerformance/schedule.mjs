import { register } from 'tsx/esm/api';
import { writeFileSync } from 'node:fs';
register();
const { LivePitPoller } = await import('../../../server/live/livePitPoller.ts');
// Advance only the injected poller clock and its actual interval callback; no HTTP requests.
const originalInterval = globalThis.setInterval;
const originalClear = globalThis.clearInterval;
const results = {};
try {
  for (const mode of ['track', 'garage']) {
    /** @type {() => void} */
    let tick;
    let now = 1_800_000_000_000;
    const start = now;
    /** @type {{path: string, seconds: number}[]} */
    const calls = [];
    globalThis.setInterval = (/** @type {() => void} */ callback) => { tick = callback; return /** @type {ReturnType<typeof setInterval>} */ ({ unref() {} }); };
    globalThis.clearInterval = () => {};
    const poller = new LivePitPoller({ now: () => now, onReplay: () => {}, onUpdate: () => {},
      get: async path => {
        calls.push({ path, seconds: (now - start) / 1000 });
        return { ok: true, body: path === '/navigation/state' ? { state: { settingMode: 'SETTING_GRANDPRIX' } } : {} };
      } });
    poller.setMode(mode);
    await Promise.resolve();
    for (let i = 1; i <= 600; i++) { now = start + i * 1000; tick(); await Promise.resolve(); }
    poller.stop();
    const paths = [...new Set(calls.map(call => call.path))];
    results[mode] = { steadyRequestsPerSecond: calls.filter(call => call.seconds > 120).length / 480,
      paths: Object.fromEntries(paths.map(path => {
        const samples = calls.filter(call => call.path === path);
        const steady = samples.filter(call => call.seconds > 120);
        const gaps = steady.slice(1).map((call, i) => call.seconds - steady[i].seconds);
        return [path, { firstSeconds: samples[0].seconds, averagePeriodSeconds: gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
          maxPeriodSeconds: Math.max(...gaps) }];
      })) };
  }
} finally { globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear; }
writeFileSync('.cache/live-performance/schedule.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
