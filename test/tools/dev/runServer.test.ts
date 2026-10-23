import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The Node development launcher is an executable JavaScript module.
import { runDevelopmentServer } from '../../../tools/dev/runServer.mjs';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

describe('development server shutdown', () => {
  let child: EventEmitter & { kill: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    child = Object.assign(new EventEmitter(), { kill: vi.fn(() => true) });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  });
  afterEach(() => vi.clearAllMocks());

  it('stops its watcher only after the server signals a completed tray shutdown', async () => {
    const finished = runDevelopmentServer() as Promise<number>;
    const options = vi.mocked(spawn).mock.calls[0]?.[2];
    const exitFile = options?.env?.LMU_DEV_EXIT_FILE;
    expect(exitFile).toBeTypeOf('string');
    if (!exitFile) throw new Error('Missing exit signal path');
    expect(child.kill).not.toHaveBeenCalled();
    fs.writeFileSync(exitFile, 'exit');
    try {
      await vi.waitFor(() => expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM'));
    } finally { child.emit('close', null); }
    expect(await finished).toBe(0);
    expect(fs.existsSync(path.dirname(exitFile))).toBe(false);
  });

  it('preserves an unexpected watcher exit code', async () => {
    const finished = runDevelopmentServer() as Promise<number>;
    child.emit('close', 7);
    expect(await finished).toBe(7);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('cleans up and reports a failed watcher launch even if close follows error', async () => {
    const finished = runDevelopmentServer() as Promise<number>;
    const rejection = expect(finished).rejects.toThrow('Unable to launch watcher');
    child.emit('error', new Error('Unable to launch watcher'));
    child.emit('close', -1);
    await rejection;
  });
});
