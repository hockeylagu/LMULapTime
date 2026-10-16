import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared by every worker client and the workers themselves; kept free of heavy imports so a
// small worker (the live shared memory reader) does not load the replay decoder with it.

/**
 * True when `message` is one our worker posted: an object whose `type` is one of `types`. Every worker
 * client reads its port through this. The port also carries messages that are not ours: under
 * `node --watch` (npm run dev), tsx posts { 'watch:import': [...] } for each module the worker loads.
 * Taken as an answer, that once failed every replay decode and lost every new session at startup.
 */
export function isWorkerMessage<T extends { type: string }>(message: unknown, types: ReadonlyArray<T['type']>): message is T {
  const type = (message as { type?: unknown } | null)?.type;
  return typeof type === 'string' && (types as ReadonlyArray<string>).includes(type);
}

/**
 * The path of a worker's .mjs bootstrap, `serverRelativePath` under server/. Next to the calling
 * module when it runs from a file; otherwise (bundled or transformed, as under the test runner)
 * found by walking up from the entry script and the working directory.
 */
export function findWorkerBootstrap(moduleUrl: string, serverRelativePath: string[]): string {
  const url = new URL(moduleUrl);
  const fileName = serverRelativePath[serverRelativePath.length - 1];
  if (url.protocol === 'file:') {
    return fileURLToPath(new URL(`./${fileName}`, url));
  }

  const startingDirectories = [path.dirname(path.resolve(process.argv[1] || '.')), process.cwd()];
  for (const startingDirectory of startingDirectories) {
    let directory = startingDirectory;
    while (true) {
      const candidate = path.join(directory, 'server', ...serverRelativePath);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }

  throw new Error(`Unable to locate worker bootstrap ${fileName}`);
}
