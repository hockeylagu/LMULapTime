import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('ends a real tsx development watcher after its server signals a flushed tray exit', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-exit-test-'));
  const entry = path.join(directory, 'server.ts');
  fs.writeFileSync(entry, `import fs from 'node:fs';
const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
  console.log('capture-flushed');
  fs.writeFileSync(process.env.LMU_DEV_EXIT_FILE!, 'exit');
  process.exit(0);
}, 100);
void timer;
`);
  const launcher = pathToFileURL(path.resolve('tools/dev/runServer.mjs')).href;
  const child = spawn(process.execPath, ['--input-type=module', '--eval',
    `import { runDevelopmentServer } from ${JSON.stringify(launcher)}; process.exitCode = await runDevelopmentServer(${JSON.stringify(entry)});`],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
  child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
  const timeout = setTimeout(() => { child.kill(); }, 10000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(stdout.match(/capture-flushed/g)).toHaveLength(1);
  } finally {
    clearTimeout(timeout);
    fs.unlinkSync(entry);
    fs.rmdirSync(directory);
  }
}, 15000);
