import { spawn } from 'node:child_process';
import { constants, setPriority } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

/** The helper owns the native Windows UI; its stdin closes when this server exits. */
export function startSystemTray(onExit: () => void = () => {}): (() => void) | undefined {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'test' || process.env.LMU_TRAY === '0') return;

  let website: URL;
  try {
    website = new URL(process.env.LMU_UI_ORIGIN || `http://localhost:${Number(process.env.LMU_UI_PORT) || 5173}`);
  } catch {
    console.warn('System tray disabled: LMU_UI_ORIGIN is not a valid URL.');
    return;
  }
  if (website.protocol !== 'http:' && website.protocol !== 'https:') {
    console.warn('System tray disabled: LMU_UI_ORIGIN must use HTTP or HTTPS.');
    return;
  }

  const helper = spawn(fileURLToPath(new URL('./bin/systemTray-win32-x64.exe', import.meta.url)),
    [website.href], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

  const messages = helper.stdout ? createInterface({ input: helper.stdout }) : undefined;
  let exitRequested = false;
  messages?.on('line', line => {
    if (line !== 'exit-requested' || exitRequested) return;
    exitRequested = true;
    onExit();
  });

  // Native UI initialization must yield CPU to Vite, ingestion and the live reader.
  if (helper.pid !== undefined) {
    try {
      setPriority(helper.pid, constants.priority.PRIORITY_BELOW_NORMAL);
    } catch { /* Priority is best-effort; the helper may already have exited. */ }
  }

  // Tray failures must not interrupt capture, ingestion, or HTTP serving.
  helper.on('error', error => console.warn(`System tray unavailable: ${error.message}`));
  helper.stdin?.on('error', () => { /* The helper can exit before server shutdown. */ });
  helper.stderr?.on('data', (message: Buffer) => console.warn(`System tray: ${message.toString().trim()}`));

  const stop = (): void => { helper.stdin?.end(); };
  process.once('exit', stop);
  helper.once('exit', () => { messages?.close(); process.removeListener('exit', stop); });
  return stop;
}
