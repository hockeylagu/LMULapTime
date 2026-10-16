import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_OPEN_DELAY_MS, LiveAutoOpen, liveDashboardUrl } from '../../../server/live/liveAutoOpen.js';

function setup(options: { enabled?: boolean; clients?: boolean } = {}) {
  const state = { enabled: options.enabled ?? true, clients: options.clients ?? false };
  const open = vi.fn();
  const autoOpen = new LiveAutoOpen({ autoOpenEnabled: () => state.enabled, hasClients: () => state.clients, open });
  return { autoOpen, open, state };
}

describe('LiveAutoOpen', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it('opens the dashboard once when the game starts', () => {
    vi.stubEnv('LMU_UI_ORIGIN', 'http://localhost:4000');
    const { autoOpen, open } = setup();
    autoOpen.onLifecycle('menu');
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    expect(open).toHaveBeenCalledExactlyOnceWith('http://localhost:4000/#/live');
    autoOpen.onLifecycle('garage');
    autoOpen.onLifecycle('driving');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('defaults to the dev server origin', () => {
    vi.stubEnv('LMU_UI_ORIGIN', '');
    expect(liveDashboardUrl()).toBe('http://localhost:5173/#/live');
  });

  it('does not reopen after the driver closes the window, until the game starts again', () => {
    const { autoOpen, open } = setup();
    autoOpen.onLifecycle('menu');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    autoOpen.onLifecycle('garage');
    autoOpen.onLifecycle('menu');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    expect(open).toHaveBeenCalledTimes(1);
    autoOpen.onLifecycle('offline');
    autoOpen.onLifecycle('menu');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('stays closed when the setting is off, and does not open later in the same launch', () => {
    const { autoOpen, open, state } = setup({ enabled: false });
    autoOpen.onLifecycle('menu');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    state.enabled = true;
    autoOpen.onLifecycle('garage');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    expect(open).not.toHaveBeenCalled();
  });

  it('does not open a second window when a page is connected by the time it decides', () => {
    const { autoOpen, open, state } = setup();
    autoOpen.onLifecycle('menu');
    state.clients = true;
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    expect(open).not.toHaveBeenCalled();
  });

  it('does not open when the game went offline during the delay', () => {
    const { autoOpen, open } = setup();
    autoOpen.onLifecycle('menu');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS - 1);
    autoOpen.onLifecycle('offline');
    vi.advanceTimersByTime(AUTO_OPEN_DELAY_MS);
    expect(open).not.toHaveBeenCalled();
  });
});
