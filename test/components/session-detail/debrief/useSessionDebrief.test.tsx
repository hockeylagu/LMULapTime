import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDataContext } from '../../../../src/api/sessionDataContext.js';
import type { ScanStatus } from '../../../../shared/types/index.js';
import { useSessionDebrief } from '../../../../src/components/session-detail/debrief/useSessionDebrief.js';
import * as debriefModule from '../../../../src/components/session-detail/debrief/loadSessionDebrief.js';
import { me, session } from './debriefFixtures.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const readyDebrief = (driverName: string) => ({ driverName } as debriefModule.SessionDebrief);

describe('useSessionDebrief', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('stays idle until requested and retries unavailable data after a completed revision', async () => {
    let revision = 0;
    let scanComplete = true;
    const unavailable = new debriefModule.DebriefUnavailableError('No replay yet.');
    const load = vi.spyOn(debriefModule, 'loadSessionDebrief')
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(readyDebrief(me.name));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionDataContext.Provider value={{ revision, scan: { allComplete: scanComplete } as ScanStatus }}>{children}</SessionDataContext.Provider>
    );
    const hook = renderHook(({ attempt }) => useSessionDebrief(session, me, attempt), { initialProps: { attempt: 0 }, wrapper });
    expect(hook.result.current.status).toBe('idle');
    expect(load).not.toHaveBeenCalled();

    hook.rerender({ attempt: 1 });
    await waitFor(() => expect(hook.result.current.status).toBe('unavailable'));
    expect(load).toHaveBeenCalledTimes(1);

    scanComplete = false;
    revision += 1;
    hook.rerender({ attempt: 1 });
    await Promise.resolve();
    expect(hook.result.current.status).toBe('loading');
    expect(load).toHaveBeenCalledTimes(1);

    scanComplete = true;
    revision += 1;
    hook.rerender({ attempt: 1 });
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps a delayed result from a previous session and driver from replacing the current selection', async () => {
    const oldRequest = deferred<debriefModule.SessionDebrief>();
    const newRequest = deferred<debriefModule.SessionDebrief>();
    const load = vi.spyOn(debriefModule, 'loadSessionDebrief')
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionDataContext.Provider value={{ revision: 0, scan: null }}>{children}</SessionDataContext.Provider>
    );
    const firstSession = { ...session, id: 'first' };
    const secondSession = { ...session, id: 'second' };
    const secondDriver = { ...me, name: 'New Driver' };
    const hook = renderHook(({ selectedSession, driver }) => useSessionDebrief(selectedSession, driver, 1), {
      initialProps: { selectedSession: firstSession, driver: me }, wrapper,
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    hook.rerender({ selectedSession: secondSession, driver: secondDriver });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(hook.result.current.status).toBe('loading');

    newRequest.resolve(readyDebrief(secondDriver.name));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    await act(async () => oldRequest.resolve(readyDebrief(me.name)));
    expect(hook.result.current).toMatchObject({ status: 'ready', debrief: { driverName: secondDriver.name } });
  });

  it('reloads requested work when fresh objects arrive for the same session and driver', async () => {
    const oldRequest = deferred<debriefModule.SessionDebrief>();
    const freshRequest = deferred<debriefModule.SessionDebrief>();
    const load = vi.spyOn(debriefModule, 'loadSessionDebrief')
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(freshRequest.promise);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionDataContext.Provider value={{ revision: 0, scan: null }}>{children}</SessionDataContext.Provider>
    );
    const initialSession = { ...session };
    const updatedSession = { ...session, matchingReplayFile: { ...session.matchingReplayFile!, name: 'newly-processed.vcr' } };
    const hook = renderHook(({ selectedSession }) => useSessionDebrief(selectedSession, me, 1), {
      initialProps: { selectedSession: initialSession }, wrapper,
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    hook.rerender({ selectedSession: updatedSession });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[1][0].matchingReplayFile?.name).toBe('newly-processed.vcr');

    freshRequest.resolve(readyDebrief(me.name));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    await act(async () => oldRequest.reject(new Error('obsolete request failed')));
    expect(hook.result.current.status).toBe('ready');
  });
});
