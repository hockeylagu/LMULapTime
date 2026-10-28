import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profiler } from 'react';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import App from '../../../src/App.js';
import { prefetchRoutePages } from '../../../src/routePages.js';
import { LivePage } from '../../../src/components/live/LivePage.js';
import { LIVE_HEARTBEAT_MS } from '../../../shared/types/live.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { FakeEventSource } from '../../helpers/fakeEventSource.js';
import { liveSession, liveSnapshot } from '../../helpers/liveSnapshot.js';

const session = liveSession;
const snapshot = liveSnapshot;
const source = () => FakeEventSource.byUrl('/api/live/stream');
const send = (value: LiveSnapshot) => act(() => source().emit('snapshot', value));

describe('LivePage', () => {
  beforeEach(() => {
    FakeEventSource.install();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('waits for the server before the first snapshot', () => {
    render(<LivePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CONNECTING');
    expect(screen.getByTestId('live-status')).toHaveTextContent('CONNECTING');
    expect(screen.getByRole('link', { name: 'LMU' })).toHaveAttribute('href', '#/dashboard');
  });

  it.each([
    ['offline', null, 'WAITING FOR LMU', 'WAITING FOR LIVE DATA FROM THE GAME'],
    ['menu', null, 'IN MENU', 'JOIN A SESSION TO BEGIN'],
    ['garage', session(), 'RACE', 'WAITING FOR GARAGE DATA'],
    ['finished', session(), 'SESSION OVER', ''],
  ] as const)('shows the %s screen', (lifecycle, info, title, note) => {
    render(<LivePage />);
    send(snapshot({ lifecycle, session: info }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    const region = screen.getByRole('region', { name: 'Session state' });
    if (note) expect(within(region).getByText(note)).toBeInTheDocument();
    else expect(region.querySelector('p')).not.toBeInTheDocument();
    // Only with the game closed is there a way back to the dashboard.
    expect(within(region).queryByRole('link', { name: 'OPEN THE DASHBOARD' })?.getAttribute('href') ?? null).toBe(lifecycle === 'offline' ? '#/dashboard' : null);
    expect(screen.queryByTestId('pedal-trace')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-status')).toHaveTextContent('LIVE');
  });

  it.each(['OPEN THE DASHBOARD', 'LMU'])('syncs the LMU folders when %s leads back to the dashboard', (name) => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LivePage />);
    send(snapshot({ lifecycle: 'offline', session: null }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/scan', expect.anything());
    fireEvent.click(screen.getByRole('link', { name }));
    expect(fetchMock).toHaveBeenCalledWith('/api/scan', expect.objectContaining({ method: 'POST' }));
  });

  it('keeps the pedal trace for the race start, with the phase as the note', () => {
    render(<LivePage />);
    send(snapshot({ lifecycle: 'starting', session: session({ gamePhase: 3 }) }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RACE STARTING');
    expect(screen.getByText('FORMATION LAP')).toBeInTheDocument();
    expect(screen.getByTestId('pedal-trace')).toBeInTheDocument();
  });

  it('shows the race view with the class badge and the trace, and a NO REC marker in the status slot', () => {
    render(<LivePage />);
    send(snapshot({}));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CALCULATING');
    expect(screen.getByTestId('live-bar-place')).toHaveTextContent('P3');
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('HY');
    expect(screen.getByTestId('pedal-trace')).toBeInTheDocument();
    expect(screen.getByTestId('live-status')).toHaveTextContent('LIVE');
    // A stopped recording takes the same slot, so the driver knows before the race ends.
    send(snapshot({ sequence: 3, audit: { runId: 'run', status: 'unavailable' } }));
    expect(screen.getByTestId('live-status')).toHaveTextContent('NO REC');
  });

  it('replaces live content with DATA LOST when the heartbeat goes silent', () => {
    vi.useFakeTimers();
    render(<LivePage />);
    send(snapshot({}));
    act(() => { vi.advanceTimersByTime(LIVE_HEARTBEAT_MS * 2.5 + 1); });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('DATA LOST');
    expect(screen.getByTestId('live-status')).toHaveTextContent('DISCONNECTED');
    expect(screen.queryByTestId('live-bar-place')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pedal-trace')).not.toBeInTheDocument();
    send(snapshot({ sequence: 9 }));
    expect(screen.getByTestId('live-bar-place')).toHaveTextContent('P3');
  });

  it('uses the saved pedal history duration in the real live dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ autoOpen: true, reserveSeconds: 45, pedalTraceSeconds: 60 }) })));
    render(<LivePage />);
    send(snapshot({}));
    await waitFor(() => expect(screen.getByTestId('pedal-trace')).toHaveAttribute('data-window-seconds', '60'));
  });

  it('draws pedal batches on the canvas without rendering the page again', async () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, {
      get: (_target, name) => (...args: unknown[]) => { calls.push(`${String(name)}:${args.length}`); },
      set: () => true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    let renders = 0;
    render(<Profiler id="live" onRender={() => { renders += 1; }}><LivePage /></Profiler>);
    send(snapshot({}));
    const before = renders;
    act(() => {
      for (let i = 0; i < 20; i += 1) {
        source().emit('pedals', { samples: [{ t: i / 10, throttle: 1, brake: 0 }, { t: i / 10 + 0.05, throttle: 0.8, brake: 0.2 }] });
      }
    });
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(renders).toBe(before);
    expect(calls.filter((call) => call.startsWith('stroke:')).length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((call) => call.startsWith('lineTo:')).length).toBeGreaterThan(0);
  });
});

describe('the /live route', () => {
  // Pages load lazily; resolve the modules once so the render below is not a cold transform.
  beforeAll(() => prefetchRoutePages(), 30000);

  beforeEach(() => {
    FakeEventSource.install();
    window.location.hash = '#/live';
    // The app data never answers: the live page must not wait for it.
    global.fetch = vi.fn(() => new Promise<Response>(() => undefined));
  });
  afterEach(() => { vi.unstubAllGlobals(); window.location.hash = ''; });

  it('renders at once without the navbar, footer, loading gate or analysis event stream', async () => {
    render(<App />);
    expect(await screen.findByTestId('live-frame')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading LMU Replay/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Built for Le Mans Ultimate/)).not.toBeInTheDocument();
    expect(FakeEventSource.instances.map((s) => s.url)).toEqual(['/api/live/stream']);
    expect(global.fetch).toHaveBeenCalledWith('/api/live/settings', expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }));
  });
});
