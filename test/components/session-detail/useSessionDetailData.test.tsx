import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { SessionDetail } from '../../../src/components/session-detail/index.js';
import { clearSessionDetailCache, useSessionDetailData } from '../../../src/components/session-detail/useSessionDetailData.js';
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
  beforeEach(() => clearSessionDetailCache());
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
    expect(fetchMock).toHaveBeenCalledWith('/api/session/2026_05_28%20P1%232', expect.anything());
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
    // Stable props, as the parent passes them: a new array on each render would restart the loading effect.
    const initialSessions = [session];
    const hook = renderHook(() => useSessionDetailData({ sessionId, initialProgression, initialSessions }));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  }

  beforeEach(() => clearSessionDetailCache());
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

  it('shows a session opened before at once, then keeps it current', async () => {
    await loaded(mockDetailedSession as unknown as DetailedSession, 'revisited');
    serve({ '/api/session/': { status: 200, body: withSimDriver({ bestLapTime: 121 }) } });

    const initialSessions = [mockDetailedSession as unknown as DetailedSession];
    const { result } = renderHook(() => useSessionDetailData({ sessionId: 'revisited', initialSessions }));

    expect(result.current.loading).toBe(false);
    expect(result.current.selectedDriverName).toBe('Sim Driver');
    await waitFor(() => expect(result.current.selectedDriver?.bestLapTime).toBe(121));
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
