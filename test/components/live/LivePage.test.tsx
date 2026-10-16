import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profiler } from 'react';
import { act, render, screen } from '@testing-library/react';
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
  });

  it.each([
    ['offline', null, 'WAITING FOR LMU', 'GAME NOT RUNNING'],
    ['menu', null, 'IN MENU', 'WAITING FOR A SESSION'],
    ['garage', session(), 'GARAGE', 'RACE · Circuit de la Sarthe'],
    ['finished', session(), 'SESSION OVER', 'RACE · Circuit de la Sarthe'],
  ] as const)('shows the %s screen', (lifecycle, info, title, note) => {
    render(<LivePage />);
    send(snapshot({ lifecycle, session: info }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.queryByTestId('pedal-trace')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-status')).toHaveTextContent('LIVE');
  });

  it('keeps the pedal trace for the race start, with the phase as the note', () => {
    render(<LivePage />);
    send(snapshot({ lifecycle: 'starting', session: session({ gamePhase: 3 }) }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RACE STARTING');
    expect(screen.getByText('FORMATION LAP')).toBeInTheDocument();
    expect(screen.getByTestId('pedal-trace')).toBeInTheDocument();
  });

  it('shows the race view with the class badge and the trace, and a PAUSED marker that keeps the screen', () => {
    render(<LivePage />);
    send(snapshot({}));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('LAP 13');
    expect(screen.getByText('P3')).toBeInTheDocument();
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('HY');
    expect(screen.getByTestId('pedal-trace')).toBeInTheDocument();
    // The marker's slot is held while unpaused (hidden), so pausing moves nothing.
    expect(screen.getByTestId('live-paused')).toHaveClass('invisible');
    send(snapshot({ sequence: 2, paused: true }));
    expect(screen.getByTestId('live-paused')).not.toHaveClass('invisible');
    expect(screen.getByText('P3')).toBeInTheDocument();
  });

  it('replaces live content with DATA LOST when the heartbeat goes silent', () => {
    vi.useFakeTimers();
    render(<LivePage />);
    send(snapshot({}));
    act(() => { vi.advanceTimersByTime(LIVE_HEARTBEAT_MS * 2.5 + 1); });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('DATA LOST');
    expect(screen.getByTestId('live-status')).toHaveTextContent('DISCONNECTED');
    expect(screen.queryByText('P3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pedal-trace')).not.toBeInTheDocument();
    send(snapshot({ sequence: 9 }));
    expect(screen.getByText('P3')).toBeInTheDocument();
  });

  it('draws pedal batches on the canvas without rendering the page again', async () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, {
      get: (_target, name) => (...args: unknown[]) => { calls.push(`${String(name)}:${args.length}`); },
      set: () => true,
    });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
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
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
