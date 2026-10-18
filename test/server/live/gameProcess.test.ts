import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGameProcessProbe } from '../../../server/live/gameProcess.js';

describe('Windows game process probe', () => {
  it.skipIf(process.platform !== 'win32')('detects a real process and its exit through a retained handle', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'lmu-process-'));
    const name = `lmu-process-test-${process.pid}.exe`;
    const executable = path.join(directory, name);
    copyFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'), executable);
    const probe = createGameProcessProbe(name);
    let child: ReturnType<typeof spawn> | undefined;
    try {
      expect(probe.read()).toBe(false);
      child = spawn(executable, ['/D', '/Q'], { windowsHide: true, stdio: 'pipe' });
      await once(child, 'spawn');
      expect(probe.read()).toBe(true);
      expect(probe.read()).toBe(true);
      const exited = once(child, 'exit');
      child.stdin?.end('exit\r\n');
      await exited;
      expect(probe.read()).toBe(false);
    } finally {
      probe.close();
      probe.close();
      if (child && child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
