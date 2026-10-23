import { spawn } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';

it.skipIf(process.platform !== 'win32')('initializes the native tray with an open lifetime pipe and exits on EOF', async () => {
  const executable = path.join(process.cwd(), 'server', 'desktop', 'bin', 'systemTray-win32-x64.exe');
  const helper = spawn(executable, ['http://localhost:5173/', '--hidden'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  helper.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
  const exited = new Promise<number | null>(resolve => { helper.once('exit', code => resolve(code)); });
  const timeout = setTimeout(() => { helper.kill(); }, 10_000);
  try {
    await new Promise<void>((resolve, reject) => {
      let stdout = '';
      helper.once('error', reject);
      helper.once('exit', () => reject(new Error(`Tray exited before initialization: ${stderr}`)));
      helper.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.includes('tray-ready')) resolve();
      });
    });
    expect(helper.exitCode).toBeNull();
    helper.stdin.end();
    expect(await exited).toBe(0);
    expect(stderr).toBe('');
  } finally {
    clearTimeout(timeout);
    if (helper.exitCode === null) {
      helper.kill();
      await exited;
    }
  }
}, 15_000);
