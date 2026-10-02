import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.CHROME_BIN,
].filter((p): p is string => Boolean(p && fs.existsSync(p)));

function findBrowserExecutable(): string {
  if (BROWSER_PATHS.length === 0) {
    throw new Error('No Chrome or Edge browser executable found on system.');
  }
  return BROWSER_PATHS[0];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortOpen(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

interface TargetScreenshot {
  name: string;
  url: string;
  outputPath: string;
  waitMs?: number;
  evalBeforeCapture?: string;
}

const TARGETS: TargetScreenshot[] = [
  {
    name: 'Telemetry Studio (Bahrain LMP3 Competitive Dry Lap)',
    url: 'http://localhost:5173/?demo=1#/telemetry?replayName=Bahrain%20International%20Circuit%20R1%2012.Vcr&lap=8&driverName=Ricky%20Bobby',
    outputPath: path.join(process.cwd(), 'assets', 'telemetry_studio.png'),
    waitMs: 5000,
    evalBeforeCapture: `
      const toastBtn = document.querySelector('button[aria-label="Dismiss toast"], button[aria-label="Close"]');
      if (toastBtn) toastBtn.click();
    `,
  },
  {
    name: 'Session Detail (Bahrain LMP3 Race Stint)',
    url: 'http://localhost:5173/?demo=1#/session/2026_09_30_23_37_59-24R1',
    outputPath: path.join(process.cwd(), 'assets', 'session_detail.png'),
    waitMs: 4000,
    evalBeforeCapture: `
      const toastBtn = document.querySelector('button[aria-label="Dismiss toast"], button[aria-label="Close"]');
      if (toastBtn) toastBtn.click();
    `,
  },
  {
    name: 'Leaderboard & Rivals (Bahrain LMP3 Board)',
    url: 'http://localhost:5173/?demo=1#/leaderboard?track=Bahrain+International+Circuit&carClass=LMP3',
    outputPath: path.join(process.cwd(), 'assets', 'leaderboard_rivals.png'),
    waitMs: 4000,
    evalBeforeCapture: `
      const toastBtn = document.querySelector('button[aria-label="Dismiss toast"], button[aria-label="Close"]');
      if (toastBtn) toastBtn.click();
    `,
  },
  {
    name: 'Dashboard Overview (Ricky Bobby Profile & Fleet Totals)',
    url: 'http://localhost:5173/?demo=1&carClass=LMP3#/dashboard?carClass=LMP3',
    outputPath: path.join(process.cwd(), 'assets', 'dashboard.png'),
    waitMs: 4000,
    evalBeforeCapture: `
      const toastBtn = document.querySelector('button[aria-label="Dismiss toast"], button[aria-label="Close"]');
      if (toastBtn) toastBtn.click();
    `,
  },
];

async function captureScreenshots(): Promise<void> {
  const browserBin = findBrowserExecutable();
  console.log(`Using browser: ${browserBin}`);

  const assetsDir = path.join(process.cwd(), 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Check servers
  let serverProc: ChildProcess | null = null;
  let clientProc: ChildProcess | null = null;

  if (!(await isPortOpen('http://localhost:3001/api/status'))) {
    console.log('Starting backend server on port 3001...');
    serverProc = spawn('npm.cmd', ['run', 'dev:server'], { stdio: 'ignore', shell: true });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (await isPortOpen('http://localhost:3001/api/status')) break;
    }
  }

  if (!(await isPortOpen('http://localhost:5173/'))) {
    console.log('Starting frontend Vite client on port 5173...');
    clientProc = spawn('npm.cmd', ['run', 'dev:client'], { stdio: 'ignore', shell: true });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (await isPortOpen('http://localhost:5173/')) break;
    }
  }

  const cdpPort = 9222;
  const tempProfileDir = path.join(os.tmpdir(), `lmu-chrome-profile-${Date.now()}`);

  const chrome = spawn(browserBin, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tempProfileDir}`,
  ]);

  try {
    let wsUrl: string | null = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (res.ok) {
          const info = (await res.json()) as { webSocketDebuggerUrl: string };
          wsUrl = info.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }

    if (!wsUrl) throw new Error('Could not connect to Chrome DevTools Protocol.');

    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(new Error(`Browser WS error: ${String(e)}`));
    });

    let msgId = 0;
    const send = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
      new Promise((resolve) => {
        const id = ++msgId;
        const handler = (evt: MessageEvent) => {
          const data = JSON.parse(evt.data as string) as { id: number; result: T };
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });

    for (const target of TARGETS) {
      console.log(`\nCapturing: ${target.name}...`);
      const createRes = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
      const targetId = createRes.targetId;

      const pageWs = new WebSocket(`ws://127.0.0.1:${cdpPort}/devtools/page/${targetId}`);
      await new Promise<void>((resolve, reject) => {
        pageWs.onopen = () => resolve();
        pageWs.onerror = (e) => reject(new Error(`Page WS error: ${String(e)}`));
      });

      let pageMsgId = 0;
      const pageSend = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
        new Promise((resolve) => {
          const id = ++pageMsgId;
          const handler = (evt: MessageEvent) => {
            const data = JSON.parse(evt.data as string) as { id: number; result: T };
            if (data.id === id) {
              pageWs.removeEventListener('message', handler);
              resolve(data.result);
            }
          };
          pageWs.addEventListener('message', handler);
          pageWs.send(JSON.stringify({ id, method, params }));
        });

      await pageSend('Page.enable');
      await pageSend('DOM.enable');
      await pageSend('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        mobile: false,
      });

      await pageSend('Page.navigate', { url: target.url });
      await sleep(target.waitMs ?? 4000);

      if (target.evalBeforeCapture) {
        await pageSend('Runtime.evaluate', { expression: target.evalBeforeCapture });
        await sleep(500);
      }

      const shot = await pageSend<{ data: string }>('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(target.outputPath, Buffer.from(shot.data, 'base64'));
      console.log(`✓ Saved clean screenshot to ${target.outputPath}`);

      pageWs.close();
      await send('Target.closeTarget', { targetId });
    }

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    if (serverProc) serverProc.kill('SIGTERM');
    if (clientProc) clientProc.kill('SIGTERM');
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\nAll screenshots captured cleanly with zero borders or AI glow!');
}

captureScreenshots().catch((err: unknown) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
