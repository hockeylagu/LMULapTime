import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { DesktopBrowserSettings } from '../../shared/types/status.js';

const run = promisify(execFile);
const helper = fileURLToPath(new URL('./bin/systemTray-win32-x64.exe', import.meta.url));

export async function readBrowserSettings(): Promise<DesktopBrowserSettings> {
  if (process.platform !== 'win32') return { supported: false, monitor: '', monitors: [] };
  const { stdout } = await run(helper, ['--list-monitors'], { windowsHide: true, timeout: 5000 });
  const [monitor = '', ...rows] = stdout.replaceAll('\r', '').split('\n');
  const monitors = rows.filter(Boolean).map(row => {
    const [id = '', width, height, primary] = row.split('\t');
    if (!/^\\\\\.\\DISPLAY\d+$/.test(id) || !Number.isFinite(Number(width)) || !Number.isFinite(Number(height))) {
      throw new Error('The tray helper returned invalid monitor information.');
    }
    return { id, width: Number(width), height: Number(height), primary: primary === '1' };
  });
  return { supported: true, monitor, monitors };
}

export async function saveBrowserMonitor(monitor: string): Promise<void> {
  await run(helper, ['--set-monitor', monitor], { windowsHide: true, timeout: 5000 });
}
