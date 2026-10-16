import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { LiveLifecycle } from '../../shared/types/live.js';

/** Time given to a page that is reconnecting (the server restarted) before a new window is opened. */
export const AUTO_OPEN_DELAY_MS = 5000;

const APP_BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

export function liveDashboardUrl(): string {
  return `${process.env.LMU_UI_ORIGIN || 'http://localhost:5173'}/#/live`;
}

function launch(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => undefined);
  child.unref();
}

/** Opens `url` as a fullscreen app window in Edge, else Chrome, else the default browser. Never throws. */
export function openDashboardWindow(url: string): void {
  try {
    if (process.platform !== 'win32') return;
    const browser = APP_BROWSERS.find(candidate => fs.existsSync(candidate));
    if (browser) launch(browser, [`--app=${url}`, '--start-fullscreen']);
    else launch('cmd.exe', ['/c', 'start', '', url]);
  } catch (error: unknown) {
    console.warn('[Live] Could not open the dashboard window:', error);
  }
}

export interface LiveAutoOpenDeps {
  autoOpenEnabled(): boolean;
  /** A dashboard page is already connected to the live stream. */
  hasClients(): boolean;
  open(url: string): void;
}

/**
 * Opens the dashboard once per game launch: when the lifecycle leaves `offline`, if the setting is on and
 * no dashboard page is connected. It does not open again until the game has been offline and started again.
 */
export class LiveAutoOpen {
  private lifecycle: LiveLifecycle = 'offline';
  private openedForLaunch = false;
  private pending: NodeJS.Timeout | null = null;

  public constructor(private readonly deps: LiveAutoOpenDeps) {}

  public onLifecycle(lifecycle: LiveLifecycle): void {
    const previous = this.lifecycle;
    this.lifecycle = lifecycle;
    if (lifecycle === 'offline') {
      this.openedForLaunch = false;
      if (this.pending) clearTimeout(this.pending);
      this.pending = null;
      return;
    }
    if (previous !== 'offline' || this.openedForLaunch) return;
    this.openedForLaunch = true;
    this.pending = setTimeout(() => {
      this.pending = null;
      if (this.lifecycle === 'offline' || this.deps.hasClients() || !this.deps.autoOpenEnabled()) return;
      this.deps.open(liveDashboardUrl());
    }, AUTO_OPEN_DELAY_MS);
    this.pending.unref();
  }
}
