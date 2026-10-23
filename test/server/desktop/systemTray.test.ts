import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { constants, setPriority } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSystemTray } from '../../../server/desktop/systemTray.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:os', async importOriginal => ({ ...await importOriginal<typeof import('node:os')>(), setPriority: vi.fn() }));

describe('Windows system tray lifecycle', () => {
  let helper: EventEmitter & { pid?: number; stdin: PassThrough; stdout: PassThrough; stderr: PassThrough };

  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LMU_TRAY', '');
    vi.stubEnv('LMU_UI_ORIGIN', '');
    vi.stubEnv('LMU_UI_PORT', '');
    helper = Object.assign(new EventEmitter(), { pid: 12345, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
    vi.mocked(spawn).mockReturnValue(helper as unknown as ChildProcess);
  });

  afterEach(() => {
    helper.emit('exit', 0);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('starts a hidden helper for the default website and closes its lifetime pipe on shutdown', () => {
    const previousListeners = process.listenerCount('exit');
    const stop = startSystemTray();
    expect(spawn).toHaveBeenCalledWith(expect.stringMatching(/systemTray-win32-x64\.exe$/),
      ['http://localhost:5173/'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    expect(setPriority).toHaveBeenCalledWith(helper.pid, constants.priority.PRIORITY_BELOW_NORMAL);
    expect(process.listenerCount('exit')).toBe(previousListeners + 1);
    stop?.();
    expect(helper.stdin.writableEnded).toBe(true);
    helper.emit('exit', 0);
    expect(process.listenerCount('exit')).toBe(previousListeners);
  });

  it('uses the configured frontend port and gives an explicit UI origin precedence', () => {
    vi.stubEnv('LMU_UI_PORT', '5180');
    startSystemTray()?.();
    helper.emit('exit', 0);
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toContain('http://localhost:5180/');
    vi.stubEnv('LMU_UI_ORIGIN', 'https://localhost:5443/');
    startSystemTray()?.();
    expect(vi.mocked(spawn).mock.calls[1]?.[1]).toContain('https://localhost:5443/');
  });

  it.each(['test', 'disabled', 'other-platform'])('skips native UI for %s', mode => {
    if (mode === 'test') vi.stubEnv('NODE_ENV', 'test');
    if (mode === 'disabled') vi.stubEnv('LMU_TRAY', '0');
    if (mode === 'other-platform') vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    expect(startSystemTray()).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['invalid url', 'file:///C:/Windows'])('rejects invalid website address %s without affecting the server', origin => {
    vi.stubEnv('LMU_UI_ORIGIN', origin);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(startSystemTray()).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reports helper launch failures and tolerates a closed stdin pipe', () => {
    helper.pid = undefined;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startSystemTray();
    helper.emit('error', new Error('Native helper unavailable'));
    helper.stdin.emit('error', new Error('EPIPE'));
    expect(warn).toHaveBeenCalledWith('System tray unavailable: Native helper unavailable');
    expect(setPriority).not.toHaveBeenCalled();
  });

  it('keeps the tray lifecycle working if lowering its priority fails', () => {
    vi.mocked(setPriority).mockImplementationOnce(() => { throw new Error('Process already exited'); });
    const stop = startSystemTray();
    expect(stop).toBeTypeOf('function');
    stop?.();
    expect(helper.stdin.writableEnded).toBe(true);
  });

  it('requests shutdown once for an explicit Exit command, including split pipe messages', () => {
    const shutdown = vi.fn();
    startSystemTray(shutdown);
    helper.stdout.write('tray-ready\nexit-');
    expect(shutdown).not.toHaveBeenCalled();
    helper.stdout.write('requested\nexit-requested\n');
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('does not shut down the server when the tray crashes or its pipe closes', () => {
    const shutdown = vi.fn();
    startSystemTray(shutdown);
    helper.stdout.end('tray-ready\n');
    helper.emit('exit', 1);
    expect(shutdown).not.toHaveBeenCalled();
  });
});
