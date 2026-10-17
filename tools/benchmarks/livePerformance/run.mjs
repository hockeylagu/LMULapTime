import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const packageRoot = process.env.LIVE_PERF_NODE_MODULES;
if (!packageRoot) throw new Error('Set LIVE_PERF_NODE_MODULES to the directory containing playwright.');
const require = createRequire(`${packageRoot.replaceAll('\\', '/')}/package.json`);
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.LIVE_PERF_BROWSER || 'msedge' });
const base = 'http://127.0.0.1:3099';
const results = [];
const pages = [];
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p50: sorted[Math.floor(sorted.length * .5)] ?? null,
    p95: sorted[Math.floor(sorted.length * .95)] ?? null, max: sorted[sorted.length - 1] ?? null };
};
async function page() {
  const current = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  current.on('pageerror', error => errors.push(error.message));
  const session = await current.context().newCDPSession(current);
  await session.send('Performance.enable');
  await current.goto(base);
  await current.waitForSelector('[data-testid="pedal-trace"]');
  pages.push({ current, session });
}
async function phase(name, durationMs) {
  await fetch(`${base}/metrics`);
  const before = [];
  for (const { current, session } of pages) {
    before.push(await session.send('Performance.getMetrics'));
    await current.evaluate(() => { window.livePerf = { events: {}, deliveryMs: [], drawAgeMs: [], drawMs: [], longTasks: [] }; });
  }
  await pause(durationMs);
  const server = await (await fetch(`${base}/metrics`)).json();
  const clients = [];
  for (let i = 0; i < pages.length; i++) {
    const { current, session } = pages[i];
    const after = await session.send('Performance.getMetrics');
    const get = (list, key) => list.metrics.find(item => item.name === key)?.value ?? 0;
    const metrics = await current.evaluate(() => window.livePerf);
    clients.push({ events: metrics.events, deliveryMs: summary(metrics.deliveryMs),
      drawAgeMs: summary(metrics.drawAgeMs), drawMs: summary(metrics.drawMs),
      longTasks: summary(metrics.longTasks),
      rendererTaskPercent: (get(after, 'TaskDuration') - get(before[i], 'TaskDuration')) / durationMs * 100_000,
      scriptSeconds: get(after, 'ScriptDuration') - get(before[i], 'ScriptDuration'),
      layoutSeconds: get(after, 'LayoutDuration') - get(before[i], 'LayoutDuration'),
      heapMiB: get(after, 'JSHeapUsedSize') / 1024 ** 2 });
  }
  const result = { name, server, clients };
  results.push(result);
  console.log(JSON.stringify(result));
}
try {
  await phase('no-dashboard', 10_000);
  await page();
  await pause(32_000); // Fill the production 30-second pedal window before measuring steady state.
  await phase('one-dashboard-1440p', 20_000);
  await page(); await page();
  await pause(32_000);
  await phase('three-dashboards-1440p', 20_000);
} finally {
  writeFileSync('.cache/live-performance/results.json', JSON.stringify({
    timestamp: new Date().toISOString(), node: process.version, browser: browser.version(),
    synthetic: true, errors, results,
  }, null, 2));
  await browser.close();
}
