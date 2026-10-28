import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Owns the watcher so a deliberate tray exit also ends debug/watch mode.
 * @param {string} [entry] @returns {Promise<number>}
 */
export function runDevelopmentServer(entry = 'server/index.ts') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-dev-'));
  const exitFile = path.join(directory, 'exit');
  const require = createRequire(import.meta.url);
  return new Promise((resolve, reject) => {
    let requested = false;
    const child = spawn(process.execPath, [require.resolve('tsx/cli'), 'watch', '--clear-screen=false',
      '--exclude', 'server/lmu_cache.db*', '--exclude', 'server/live-captures/**',
      '--env-file-if-exists=.env.local', entry], {
      stdio: 'inherit', windowsHide: true, env: { ...process.env, LMU_DEV_EXIT_FILE: exitFile },
    });
    const watcher = fs.watch(directory, () => {
      if (requested || !fs.existsSync(exitFile)) return;
      // The server writes this only after live capture has flushed. Stop this launch's
      // watcher alone; concurrently stops its paired frontend when this launcher exits.
      requested = true;
      child.kill('SIGTERM');
    });
    const interrupt = () => { child.kill('SIGINT'); };
    const terminate = () => { child.kill('SIGTERM'); };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      watcher.close();
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
      if (fs.existsSync(exitFile)) fs.unlinkSync(exitFile);
      fs.rmdirSync(directory);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', code => { cleanup(); resolve(requested ? 0 : code ?? 1); });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runDevelopmentServer().then(code => { process.exitCode = code; }).catch(error => {
    console.error('Development server launcher failed:', error);
    process.exitCode = 1;
  });
}
