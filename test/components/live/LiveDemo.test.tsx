import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { LivePage } from '../../../src/components/live/LivePage.js';
import LiveDemoPage from '../../../src/components/live/demo/LiveDemoPage.js';
import { createDemoState, DEMO_SCENARIOS } from '../../../src/components/live/demo/demoScenarios.js';
import { racePlanView } from '../../../src/components/live/race/raceAction.js';
import { FakeEventSource } from '../../helpers/fakeEventSource.js';
import { DEMO_CLASS_OPTIONS } from '../../../src/components/live/demo/demoClasses.js';
import { liveResourceKind } from '../../../shared/domain/live/liveResourcePlan.js';

const picker = (name: RegExp | string) => screen.getByRole('combobox', { name });
/** Opens the shared dropdown and clicks the option with that value. */
function pick(name: RegExp | string, value: string): void {
  fireEvent.click(picker(name));
  const option = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`);
  if (!option) throw new Error(`No option ${value}`);
  fireEvent.click(option);
}

describe('offline live dashboard demo', () => {
  beforeEach(() => {
    FakeEventSource.install();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.mocked(global.fetch).mockClear();
    window.location.hash = '#/live?demo=1';
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('opts into the production route without opening a game stream or fetching data', async () => {
    render(<LivePage />);
    expect(await screen.findByRole('complementary', { name: 'Offline demo controls' })).toBeInTheDocument();
    expect(screen.getByTestId('live-race-plan')).toHaveAttribute('data-mode', 'stint');
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(vi.mocked(global.fetch).mock.calls.every(([url]) => url === '/api/live/settings')).toBe(true);
  });

  it('renders every catalogued scenario through the shared dashboard', () => {
    expect(new Set(DEMO_SCENARIOS.map(s => s.id)).size).toBe(DEMO_SCENARIOS.length);
    for (const scenario of DEMO_SCENARIOS) {
      window.location.hash = `#/live?demo=1&scenario=${scenario.id}`;
      render(<LiveDemoPage />);
      expect(picker(/Scenario/)).toHaveAttribute('data-value', scenario.id);
      expect(screen.getByTestId('live-frame')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      cleanup();
    }
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(vi.mocked(global.fetch).mock.calls.every(([url]) => url === '/api/live/settings')).toBe(true);
  });

  it('covers every race action mode with repeatable, isolated data', () => {
    const modes = new Set(DEMO_SCENARIOS.flatMap(s => {
      const state = createDemoState(s.id);
      return state.snapshot?.lifecycle === 'driving' && state.snapshot.session?.kind === 'race' ? [racePlanView(state.snapshot).mode] : [];
    }));
    expect([...modes].sort()).toEqual(['calculating', 'in-pit', 'pit', 'pit-now', 'saving', 'sprint', 'stint']);
    const snapshot = createDemoState('race').snapshot!;
    snapshot.strategy!.pit!.state = 'stopped';
    expect(createDemoState('race').snapshot!.strategy!.pit!.state).toBe('none');
    expect(snapshot.identity!.layoutKey).toBe('monza_gp');
  });

  it.each(['practice', 'qualifying'] as const)('starts the %s out-lap demo at lap one without invented history', kind => {
    const { snapshot, timing } = createDemoState(`${kind}-out-lap`);
    expect(snapshot?.session).toMatchObject({ playerLapsCompleted: 0, elapsedSeconds: 35, endSeconds: kind === 'qualifying' ? 600 : 3600 });
    expect(timing).toMatchObject({ lapNumber: 1, isOutLap: true, sector: 1, deltaSeconds: null });
    expect(snapshot?.recentLaps).toEqual([]);
    expect(snapshot?.sessionBest).toBeNull();
    expect(snapshot?.strategy?.resource?.lapsMeasured).toBe(0);
  });

  it('uses ten-minute qualifying, twenty-minute sprints and sixty-minute practice with matching plans', () => {
    for (const [id, seconds] of [['qualifying', 600], ['positive-delta', 600], ['sprint', 1200], ['practice', 3600]] as const) {
      const { snapshot, timing } = createDemoState(id);
      const session = snapshot!.session!;
      expect(session.endSeconds).toBe(seconds);
      expect(session.elapsedSeconds).toBeLessThan(seconds);
      expect(timing!.lapNumber).toBe(session.playerLapsCompleted! + 1);
      expect(snapshot!.recentLaps[snapshot!.recentLaps.length - 1]?.lapNumber).toBe(session.playerLapsCompleted);
      if (snapshot!.lapsLeft) expect(snapshot!.lapsLeft.laps).toBe(Math.ceil((seconds - session.elapsedSeconds + timing!.lapElapsedSeconds!) / 110));
    }
    expect(createDemoState('sprint').snapshot?.strategy?.resource?.race).toMatchObject({ finishReachable: true, pitLap: null });
    for (const [id, minutes, laps, stops] of [['garage-qualifying', 10, 6, 0], ['garage-sprint', 20, 13, 0], ['garage-practice', 60, 33, 1]] as const) {
      expect(createDemoState(id).snapshot?.strategy?.garage).toMatchObject({ sessionMinutes: minutes, laps, stops });
    }
  });

  it.each(['garage-qualifying', 'garage-sprint', 'garage-race'])('keeps the fuel ratio visible in %s', id => {
    window.location.hash = `#/live?demo=1&scenario=${id}`;
    render(<LiveDemoPage />);
    expect(screen.getByText('FUEL RATIO')).toBeInTheDocument();
    expect(screen.getByText('0.95')).toBeInTheDocument();
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(createDemoState(id).snapshot?.strategy?.fuelRatio).toMatchObject({ source: 'game', pairedLaps: 0 });
    expect(createDemoState('race', 'LMP2').snapshot?.strategy?.fuelRatio).toBeNull();
  });

  it('selects, deep-links, wraps and preserves unrelated query parameters', () => {
    window.location.hash = '#/live?demo=1&keep=yes';
    render(<LiveDemoPage />);
    pick(/Scenario/, 'damage-flat');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('PIT NOW');
    expect(window.location.hash).toContain('scenario=damage-flat');
    expect(window.location.hash).toContain('keep=yes');
    pick(/Scenario/, 'disconnected');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('DATA LOST');
    pick(/Scenario/, 'corners');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(picker(/Scenario/)).toHaveAttribute('data-value', 'connecting');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(picker(/Scenario/)).toHaveAttribute('data-value', 'corners');
  });

  it('tours scenarios until stopped and cleans timers on exit', () => {
    vi.useFakeTimers();
    const view = render(<LiveDemoPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Tour all · 5 s each' }));
    expect(picker(/Scenario/)).toHaveAttribute('data-value', 'connecting');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(picker(/Scenario/)).toHaveAttribute('data-value', 'offline');
    fireEvent.click(screen.getByRole('button', { name: 'Stop tour' }));
    act(() => { vi.advanceTimersByTime(10000); });
    expect(picker(/Scenario/)).toHaveAttribute('data-value', 'offline');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Animate pedals' }));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back for an unknown scenario and keeps a visible demo label when controls are hidden', () => {
    window.location.hash = '#/live?demo=1&scenario=invalid';
    render(<LiveDemoPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Unknown scenario');
    fireEvent.click(screen.getByRole('button', { name: 'Hide controls' }));
    expect(screen.getByText('DEMO · SAMPLE DATA')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show controls' }));
    expect(screen.getByRole('link', { name: 'Exit demo' })).toHaveAttribute('href', '#/live');
  });

  it('steps through session preparation, out laps, qualifying results and race start in weekend order', () => {
    render(<LiveDemoPage />);
    for (const [from, next] of [
      ['garage-practice', 'practice-out-lap'], ['invalid-lap', 'garage-qualifying'],
      ['garage-qualifying', 'qualifying-out-lap'], ['positive-delta', 'result-qualifying'],
      ['result-qualifying', 'result-qualifying-settled'], ['start-0', 'start-3'],
      ['start-3', 'start-4'], ['pit-entering', 'pit-stopped'], ['pit-stopped', 'pit-exiting'],
      ['finished', 'result-race'],
    ]) {
      pick(/Scenario/, from);
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(picker(/Scenario/)).toHaveAttribute('data-value', next);
    }
  });

  it('opens the tentative corner speed preview from the picker and returns to race scenarios', () => {
    render(<LiveDemoPage />);
    pick(/Scenario/, 'corners');
    expect(screen.getByLabelText('Minimum speed 84 kilometres per hour')).toHaveTextContent('84');
    expect(screen.getByLabelText('Reference speed 92 kilometres per hour')).toHaveTextContent('92');
    expect(screen.getByLabelText('Lost 0.24 seconds')).toBeInTheDocument();
    expect(screen.getAllByTestId('live-frame')).toHaveLength(1);
    expect(window.location.hash).toContain('scenario=corners');
    expect(document.title).toBe('LMU Live · Demo');
    pick(/Scenario/, 'race');
    expect(screen.getByTestId('live-race-plan')).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('applies every class to every scenario without mixing resource types or identity', () => {
    for (const option of DEMO_CLASS_OPTIONS) {
      const kind = liveResourceKind(option.id);
      for (const scenario of DEMO_SCENARIOS) {
        const { snapshot } = createDemoState(scenario.id, option.id);
        if (!snapshot?.session) continue;
        expect(snapshot.session.vehicleClass).toBe(option.id);
        if (snapshot.identity) expect(snapshot.identity.carClass).toBe(option.id);
        const strategy = snapshot.strategy;
        if (strategy?.resource) {
          expect(strategy.resource.kind).toBe(kind);
          expect(strategy.resource.unit).toBe(kind === 'fuel' ? 'L' : '%');
        }
        if (strategy?.garage) expect(strategy.garage.kind).toBe(kind);
        if (strategy && kind === 'fuel') expect(strategy.fuelRatio).toBeNull();
        if (snapshot.result) {
          expect(snapshot.result.resourceKind).toBe(kind);
          expect(snapshot.result.vehicleName).toBe(snapshot.session.vehicleName);
        }
      }
    }
  });

  it('deep-links a class, keeps it across scenarios and switches fuel and VE preparation', () => {
    window.location.hash = '#/live?demo=1&scenario=garage-qualifying&carClass=LMP3';
    render(<LiveDemoPage />);
    expect(picker('Car class')).toHaveAttribute('data-value', 'LMP3');
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('LMP3');
    expect(screen.getByText('FUEL')).toBeInTheDocument();
    expect(screen.queryByText('FUEL RATIO')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(window.location.hash).toContain('carClass=LMP3');
    expect(screen.getByTestId('live-estimated-lap')).toHaveTextContent('OUT LAP');
    pick(/Scenario/, 'garage-sprint');
    pick('Car class', 'GT3');
    expect(screen.getByText('VE')).toBeInTheDocument();
    expect(screen.getByText('FUEL RATIO')).toBeInTheDocument();
    expect(window.location.hash).not.toContain('carClass=');
    pick(/Scenario/, 'corners');
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('GT3');
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(vi.mocked(global.fetch).mock.calls.every(([url]) => url === '/api/live/settings')).toBe(true);
  });

  it('defaults to GT3 for absent or invalid class parameters', () => {
    window.location.hash = '#/live?demo=1&carClass=spaceship';
    render(<LiveDemoPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Unknown car class');
    expect(screen.getByTestId('car-class-badge')).toHaveTextContent('GT3');
    expect(picker('Car class')).toHaveAttribute('data-value', 'GT3');
    expect(createDemoState('garage-practice').snapshot?.identity?.carClass).toBe('GT3');
    pick('Car class', 'LMP2');
    pick('Car class', 'GT3');
    expect(window.location.hash).not.toContain('carClass=');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('uses the saved trace duration in the corner demo and refreshes settings on focus', async () => {
    let seconds = 60;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ autoOpen: true, reserveLaps: 1.5, pedalTraceSeconds: seconds }) })));
    window.location.hash = '#/live?demo=1&scenario=corners';
    render(<LiveDemoPage />);
    await waitFor(() => expect(screen.getByTestId('pedal-trace')).toHaveAttribute('data-window-seconds', '60'));
    seconds = 10;
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(screen.getByTestId('pedal-trace')).toHaveAttribute('data-window-seconds', '10'));
    pick(/Scenario/, 'garage-qualifying');
    expect(screen.getByRole('region', { name: 'Session state' })).toHaveTextContent('30');
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('keeps working with default duration when settings are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Offline'))));
    render(<LiveDemoPage />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('pedal-trace')).toHaveAttribute('data-window-seconds', '30');
  });

  it('keeps the normal live stream when demo is explicitly disabled', () => {
    window.location.hash = '#/live?demo=false';
    render(<LivePage />);
    expect(FakeEventSource.instances.map(s => s.url)).toEqual(['/api/live/stream']);
    expect(screen.queryByText('DEMO · SAMPLE DATA')).not.toBeInTheDocument();
  });
});
