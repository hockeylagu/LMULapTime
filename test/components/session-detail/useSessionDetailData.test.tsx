import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionDetail } from '../../../src/components/session-detail/index.js';
import { useSessionDetailData } from '../../../src/components/session-detail/useSessionDetailData.js';
import { invalidateReferenceLaptimes } from '../../../src/api/referenceApi.js';
import { SessionDataContext } from '../../../src/api/sessionDataContext.js';
import { mockDetailedSession } from './mockSessionDetail.js';
import type { DetailedSession, DriverData, SessionProgressionPoint } from '../../../shared/types/index.js';

type Reply = { status: number; body: unknown };

/** Answers each API path with its reply; anything else is an empty list. */
function serve(replies: Record<string, Reply>) {
  const fetchMock = vi.fn((url: string) => {
    const path = Object.keys(replies).find(prefix => url.startsWith(prefix));
    const { status, body } = path ? replies[path] : { status: 200, body: [] };
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SessionDetail loading', () => {
  beforeEach(() => invalidateReferenceLaptimes());
  afterEach(() => vi.unstubAllGlobals());

  it('says why the session could not be loaded when the server fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve({ '/api/session/': { status: 500, body: { error: 'database is locked' } } });

    render(<SessionDetail sessionId="broken-session" onBack={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('database is locked');
    expect(screen.queryByText('Session Not Found')).not.toBeInTheDocument();
  });

  it('still says Session Not Found for a session the server does not have', async () => {
    serve({ '/api/session/': { status: 404, body: { error: 'Session not found' } } });

    render(<SessionDetail sessionId="missing-session" onBack={vi.fn()} />);

    expect(await screen.findByText('Session Not Found')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads the session by its encoded id', async () => {
    const fetchMock = serve({ '/api/session/': { status: 200, body: mockDetailedSession } });

    render(<SessionDetail sessionId="2026_05_28 P1#2" onBack={vi.fn()} />);

    expect(await screen.findAllByText(/Sim Driver/)).not.toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/session/2026_05_28%20P1%232', expect.objectContaining({ cache: 'no-store' }));
  });
});

describe('useSessionDetailData', () => {
  const simDriver = mockDetailedSession.drivers[0] as unknown as DriverData;
  const withSimDriver = (overrides: Partial<DriverData>): DetailedSession => ({
    ...mockDetailedSession,
    drivers: [{ ...simDriver, ...overrides }, ...mockDetailedSession.drivers.slice(1)],
  }) as unknown as DetailedSession;

  async function loaded(session: DetailedSession, sessionId: string, initialProgression?: SessionProgressionPoint[]) {
    serve({ '/api/session/': { status: 200, body: session } });
    const initialSessions = [session];
    const hook = renderHook(() => useSessionDetailData({ sessionId, initialProgression, initialSessions }));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  beforeEach(() => invalidateReferenceLaptimes());
  afterEach(() => vi.unstubAllGlobals());

  it('finds the stint limited by virtual energy and the fuel that is carried for nothing', async () => {
    const { result } = await loaded(withSimDriver({ avgFuelPerLap: 2.5, estFuelStintLaps: 40, avgVePerLap: 3.8, estVeStintLaps: 26 }), 've-limited');
    expect(result.current.fuelStrategy).toEqual({
      avgFuel: 2.5, estFuelLaps: 40, avgVe: 3.8, estVeLaps: 26, optimalRatio: 0.66, zeroWasteFuelPct: 67,
      limiter: 've', lapDelta: 14, surplusFuelPct: 35,
    });
  });

  it('finds a fuel-limited and a balanced stint, estimating stint laps from the per-lap use', async () => {
    const fuel = await loaded(withSimDriver({ avgFuelPerLap: 4, estFuelStintLaps: undefined, avgVePerLap: 2, estVeStintLaps: undefined }), 'fuel-limited');
    expect(fuel.result.current.fuelStrategy).toMatchObject({ estFuelLaps: 25, estVeLaps: 50, limiter: 'fuel', lapDelta: 25, surplusFuelPct: 0 });

    const balanced = await loaded(withSimDriver({ avgFuelPerLap: 3, estFuelStintLaps: 33, avgVePerLap: 3, estVeStintLaps: 33 }), 'balanced');
    expect(balanced.result.current.fuelStrategy).toMatchObject({ limiter: 'balanced', lapDelta: 0 });
  });

  it('has no stint strategy without fuel data, and no limiter without energy data', async () => {
    const noFuel = await loaded(withSimDriver({ avgFuelPerLap: undefined }), 'no-fuel');
    expect(noFuel.result.current.fuelStrategy).toBeNull();

    const fuelOnly = await loaded(withSimDriver({ avgFuelPerLap: 2.5, estFuelStintLaps: 40, avgVePerLap: undefined, estVeStintLaps: undefined }), 'fuel-only');
    expect(fuelOnly.result.current.fuelStrategy).toMatchObject({ limiter: null, optimalRatio: null, zeroWasteFuelPct: null });
  });

  it('takes the all-time PB from earlier sessions at this track in this class only', async () => {
    const point = (bestLapTime: number, overrides: Partial<SessionProgressionPoint> = {}): SessionProgressionPoint => ({
      sessionId: 'old', timestamp: 0, dateString: '', sessionType: 'Practice', trackVenue: 'Spa', trackCourse: 'GP',
      carType: 'Ferrari 499P', carClass: 'LMH', driverName: 'Sim Driver', bestLapTime, bestS1: null, bestS2: null, bestS3: null,
      ...overrides,
    } as SessionProgressionPoint);

    const { result } = await loaded(mockDetailedSession as unknown as DetailedSession, 'pb', [
      point(121.5),
      point(119, { carClass: 'LMGT3', carType: 'Porsche 911 GT3 R' }),
      point(118, { trackVenue: 'Monza', trackCourse: 'GP' }),
    ]);

    expect(result.current.allTimeCategoryTrackPB).toBe(121.5);
    expect(result.current.isCurrentSessionAllTimePB).toBe(false);
  });

  it('fetches again after unmounting and remounting the same session', async () => {
    const first = withSimDriver({ bestLapTime: 122 });
    const second = withSimDriver({ bestLapTime: 121 });
    let resolveRemount: ((value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void) | undefined;
    let sessionRequests = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/session/') && sessionRequests++ > 0) {
        return new Promise(resolve => { resolveRemount = resolve; });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.startsWith('/api/session/') ? first : []) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstMount = renderHook(() => useSessionDetailData({ sessionId: 'revisited', initialSessions: [] }));
    await waitFor(() => expect(firstMount.result.current.selectedDriver?.bestLapTime).toBe(122));
    firstMount.unmount();
    const secondMount = renderHook(() => useSessionDetailData({ sessionId: 'revisited', initialSessions: [] }));
    expect(secondMount.result.current.session).toBeNull();
    expect(secondMount.result.current.loading).toBe(true);
    await act(async () => resolveRemount?.({ ok: true, status: 200, json: () => Promise.resolve(second) }));

    await waitFor(() => expect(secondMount.result.current.selectedDriver?.bestLapTime).toBe(121));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/session/'))).toHaveLength(2);
  });

  it('keeps the mounted session and selected driver during a revision refresh, then uses the updated response', async () => {
    const updated: DetailedSession = {
      ...mockDetailedSession,
      drivers: mockDetailedSession.drivers.map((driver) => driver.name === 'AI Driver 2' ? { ...driver, bestLapTime: 120 } : driver),
    } as unknown as DetailedSession;
    let resolveRefresh: ((value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void) | undefined;
    let revision = 0;
    const fetchMock = vi.fn((url: string) => {
      if (!url.startsWith('/api/session/')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      if (fetchMock.mock.calls.length === 1) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockDetailedSession) });
      return new Promise((resolve) => { resolveRefresh = resolve; });
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionDataContext.Provider value={{ revision, scan: null }}>{children}</SessionDataContext.Provider>
    );
    const hook = renderHook(() => useSessionDetailData({ sessionId: 'revision', initialSessions: [] }), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    act(() => hook.result.current.setSelectedDriverName('AI Driver 2'));
    revision = 1;
    hook.rerender();

    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.session?.id).toBe(mockDetailedSession.id);
    expect(hook.result.current.selectedDriverName).toBe('AI Driver 2');
    await act(async () => resolveRefresh?.({ ok: true, status: 200, json: () => Promise.resolve(updated) }));
    await waitFor(() => expect(hook.result.current.selectedDriver?.bestLapTime).toBe(120));
    expect(hook.result.current.selectedDriverName).toBe('AI Driver 2');
  });

  it('clears the mounted session when a revision refresh returns 404', async () => {
    let revision = 0;
    let sessionRequests = 0;
    const fetchMock = vi.fn((url: string) => {
      const requestNumber = url.startsWith('/api/session/') ? ++sessionRequests : 0;
      const missing = requestNumber > 1;
      return Promise.resolve({
        ok: !missing,
        status: missing ? 404 : 200,
        json: () => Promise.resolve(missing ? { error: 'Session not found' } : mockDetailedSession),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SessionDataContext.Provider value={{ revision, scan: null }}>{children}</SessionDataContext.Provider>
    );
    const hook = renderHook(() => useSessionDetailData({ sessionId: 'gone', initialSessions: [] }), { wrapper });
    await waitFor(() => expect(hook.result.current.session).not.toBeNull());
    revision = 1;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.session).toBeNull());
    expect(hook.result.current.loading).toBe(false);
  });

  it('ignores an obsolete session response after navigation', async () => {
    let resolveOld: ((value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void) | undefined;
    const current = { ...mockDetailedSession, id: 'current-session' } as unknown as DetailedSession;
    const obsolete = { ...mockDetailedSession, id: 'obsolete-session' } as unknown as DetailedSession;
    const fetchMock = vi.fn((url: string) => url.endsWith('/old')
      ? new Promise((resolve) => { resolveOld = resolve; })
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(url.startsWith('/api/session/') ? current : []) }));
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook(({ id }: { id: string }) => useSessionDetailData({ sessionId: id, initialSessions: [] }), { initialProps: { id: 'old' } });
    hook.rerender({ id: 'current' });
    await waitFor(() => expect(hook.result.current.session?.id).toBe('current-session'));
    await act(async () => resolveOld?.({ ok: true, status: 200, json: () => Promise.resolve(obsolete) }));
    expect(hook.result.current.session?.id).toBe('current-session');
  });

  it('discards session A when switching to B, even if B is still loading', async () => {
    let resolveFirstA: ((value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void) | undefined;
    let resolveSecondA: ((value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void) | undefined;
    let sessionARequests = 0;
    const responseA = { ...mockDetailedSession, id: 'session-a' } as unknown as DetailedSession;
    const fetchMock = vi.fn((url: string) => {
      if (!url.startsWith('/api/session/')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      if (url.endsWith('/a')) {
        sessionARequests++;
        return new Promise((resolve) => {
          if (sessionARequests === 1) resolveFirstA = resolve;
          else resolveSecondA = resolve;
        });
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook(({ id }: { id: string }) => useSessionDetailData({ sessionId: id, initialSessions: [] }), { initialProps: { id: 'a' } });
    await act(async () => resolveFirstA?.({ ok: true, status: 200, json: () => Promise.resolve(responseA) }));
    await waitFor(() => expect(hook.result.current.session?.id).toBe('session-a'));
    hook.rerender({ id: 'b' });
    await waitFor(() => expect(sessionARequests).toBe(1));
    hook.rerender({ id: 'a' });
    await waitFor(() => expect(sessionARequests).toBe(2));
    expect(hook.result.current.session).toBeNull();
    expect(hook.result.current.loading).toBe(true);
    await act(async () => resolveSecondA?.({ ok: true, status: 200, json: () => Promise.resolve(responseA) }));
    await waitFor(() => expect(hook.result.current.session?.id).toBe('session-a'));
  });

  it('reports a failed revision refresh while retaining the current session data', async () => {
    let revision = 0;
    let sessionRequests = 0;
    const fetchMock = vi.fn((url: string) => {
      const failed = url.startsWith('/api/session/') && ++sessionRequests > 1;
      return Promise.resolve({
        ok: !failed,
        status: failed ? 500 : 200,
        json: () => Promise.resolve(failed ? { error: 'database is locked' } : mockDetailedSession),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(<SessionDataContext.Provider value={{ revision, scan: null }}><SessionDetail sessionId="retry" onBack={vi.fn()} /></SessionDataContext.Provider>);
    await screen.findAllByText(/Sim Driver/);
    revision = 1;
    view.rerender(<SessionDataContext.Provider value={{ revision, scan: null }}><SessionDetail sessionId="retry" onBack={vi.fn()} /></SessionDataContext.Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Session refresh failed: database is locked');
    expect(screen.getAllByText(/Sim Driver/).length).toBeGreaterThan(0);
  });

  it('hides and shows a chart series from its legend entry', async () => {
    const { result } = await loaded(mockDetailedSession as unknown as DetailedSession, 'legend');

    act(() => result.current.handleLegendClick({ dataKey: 'avgLapTime' } as never));
    expect(result.current.hiddenSeries).toEqual({ avgLapTime: true });
    act(() => result.current.handleLegendClick({ dataKey: 'avgLapTime' } as never));
    act(() => result.current.handleLegendClick({ dataKey: () => 1 } as never));
    expect(result.current.hiddenSeries).toEqual({ avgLapTime: false });
  });
});

describe('useSessionDetailData props', () => {
  beforeEach(() => invalidateReferenceLaptimes());
  afterEach(() => vi.unstubAllGlobals());

  it('settles when the parent passes new progression and session arrays on every render', async () => {
    const fetchMock = serve({ '/api/session/': { status: 200, body: mockDetailedSession } });
    let renders = 0;

    const { result } = renderHook(() => {
      renders++;
      if (renders > 50) throw new Error('useSessionDetailData keeps re-rendering');
      return useSessionDetailData({
        sessionId: 'inline-props',
        initialSessions: [mockDetailedSession as unknown as DetailedSession],
        initialProgression: [{ sessionId: 'old', trackVenue: 'Spa', bestLapTime: 121 } as SessionProgressionPoint],
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(renders).toBeLessThan(20);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/session/'))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/progression' || url === '/api/sessions')).toBe(false);
  });
});
