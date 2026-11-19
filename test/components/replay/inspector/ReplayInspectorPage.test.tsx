import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { ReplayInspectorPage } from '../../../../src/components/replay/ReplayInspectorPage.js';
import { RaceModeContext } from '../../../../src/components/replay/race/raceModeContext.js';

interface MockInspectorProps {
  sessionId: string;
  initialDriverOrdinal?: number;
  initialLapOrdinal?: number;
  initialCompareMode: boolean;
  initialBaselineSessionId: string | null;
  initialBaselineDriverOrdinal?: number;
  initialBaselineLapOrdinal?: number | null;
  initialCornerNumber?: number;
  view?: '2d' | '3d';
  isExpanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  onViewChange?: (view: '2d' | '3d') => void;
  initialLapSec?: number | null;
  onClose: () => void;
  onLocatorChange: (driverOrdinal: number, lapOrdinal: number) => void;
}

vi.mock('../../../../src/components/replay/inspector/ReplayInspectorContent.js', () => ({
  ReplayInspectorContent: (props: MockInspectorProps): ReactNode => {
    const openRace = useContext(RaceModeContext);
    return (
      <div data-testid="mock-inspector">
        <span data-testid="session-id">{props.sessionId}</span>
        <span data-testid="driver-ordinal">{props.initialDriverOrdinal}</span>
        <span data-testid="lap-ordinal">{props.initialLapOrdinal}</span>
        <span data-testid="compare-mode">{String(props.initialCompareMode)}</span>
        <span data-testid="baseline-session">{props.initialBaselineSessionId ?? 'none'}</span>
        <span data-testid="baseline-driver">{props.initialBaselineDriverOrdinal}</span>
        <span data-testid="baseline-lap">{props.initialBaselineLapOrdinal ?? 'none'}</span>
        <span data-testid="corner">{props.initialCornerNumber ?? 'none'}</span>
        <span data-testid="view-mode">{props.view ?? 'none'}</span>
        <span data-testid="lap-sec">{props.initialLapSec ?? 'none'}</span>
        <button type="button" aria-pressed={props.isExpanded}
          onClick={() => props.onToggleExpanded?.(!props.isExpanded)}>Fullscreen</button>
        <button type="button" onClick={() => props.onLocatorChange(2, 8)}>Change locator</button>
        <button type="button" onClick={() => props.onViewChange?.('3d')}>Switch to 3D</button>
        <button type="button" onClick={() => props.onViewChange?.('2d')}>Switch to 2D</button>
        <button type="button" onClick={() => openRace?.(3, 7)}>Open Race</button>
        <button type="button" onClick={() => openRace?.(3, 7, 12.5)}>Open Race at cursor</button>
        <button type="button" onClick={props.onClose}>Close</button>
      </div>
    );
  },
}));

vi.mock('../../../../src/components/replay/race/RaceReplayView.js', () => ({
  RaceReplayView: (props: { onClose: () => void; onOpenLap: (driver: number, lap: number, lapSec: number) => void; view: '2d' | '3d';
    onViewChange: (view: '2d' | '3d') => void; initialLapSec?: number | null }): ReactNode => (
    <div data-testid="mock-race">
      <span data-testid="race-view">{props.view}</span>
      <span data-testid="race-lap-sec">{props.initialLapSec ?? 'none'}</span>
      <button type="button" onClick={props.onClose}>Race Back</button>
      <button type="button" onClick={() => props.onOpenLap(4, 9, 20)}>Open Lap</button>
      <button type="button" onClick={() => props.onViewChange('2d')}>Race 2D</button>
    </div>
  ),
}));

describe('ReplayInspectorPage', () => {
  beforeEach(() => { window.location.hash = '#/replay'; sessionStorage.clear(); });

  it('redirects to the dashboard when no session is selected', async () => {
    render(<ReplayInspectorPage />);
    await waitFor(() => expect(window.location.hash).toContain('/dashboard'));
    expect(screen.queryByTestId('mock-inspector')).not.toBeInTheDocument();
  });

  it('forwards session locators and updates only the locator query fields', async () => {
    window.location.hash = '#/replay?sessionId=session%2F1&driverOrdinal=1&lapOrdinal=4&corner=5&keep=here';
    render(<ReplayInspectorPage />);

    expect(screen.getByTestId('session-id')).toHaveTextContent('session/1');
    expect(screen.getByTestId('driver-ordinal')).toHaveTextContent('1');
    expect(screen.getByTestId('lap-ordinal')).toHaveTextContent('4');
    expect(screen.getByTestId('corner')).toHaveTextContent('5');

    fireEvent.click(screen.getByRole('button', { name: 'Change locator' }));
    await waitFor(() => {
      const params = new URLSearchParams(window.location.hash.split('?')[1]);
      expect(params.get('driverOrdinal')).toBe('2');
      expect(params.get('lapOrdinal')).toBe('8');
      expect(params.get('sessionId')).toBe('session/1');
      expect(params.get('keep')).toBe('here');
    });
  });

  it('forwards baseline session locators and the linked corner', () => {
    window.location.hash = '#/telemetry?sessionId=primary&driverOrdinal=0&lapOrdinal=3&baselineSessionId=baseline&baselineDriverOrdinal=2&baselineLapOrdinal=5&corner=7';
    render(<ReplayInspectorPage />);

    expect(screen.getByTestId('compare-mode')).toHaveTextContent('true');
    expect(screen.getByTestId('baseline-session')).toHaveTextContent('baseline');
    expect(screen.getByTestId('baseline-driver')).toHaveTextContent('2');
    expect(screen.getByTestId('baseline-lap')).toHaveTextContent('5');
    expect(screen.getByTestId('corner')).toHaveTextContent('7');
  });

  it('defaults to 2d view and sets view in URL when missing', async () => {
    window.location.hash = '#/telemetry?sessionId=session-1';
    render(<ReplayInspectorPage />);

    expect(screen.getByTestId('view-mode')).toHaveTextContent('2d');
    await waitFor(() => {
      const params = new URLSearchParams(window.location.hash.split('?')[1]);
      expect(params.get('view')).toBe('2d');
    });
  });

  it('reads 3d view from the URL and allows switching views via onViewChange', async () => {
    window.location.hash = '#/telemetry?sessionId=session-1&view=3d';
    render(<ReplayInspectorPage />);

    expect(screen.getByTestId('view-mode')).toHaveTextContent('3d');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to 2D' }));
    await waitFor(() => {
      const params = new URLSearchParams(window.location.hash.split('?')[1]);
      expect(params.get('view')).toBe('2d');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch to 3D' }));
    await waitFor(() => {
      const params = new URLSearchParams(window.location.hash.split('?')[1]);
      expect(params.get('view')).toBe('3d');
    });
  });

  it('restores fullscreen from the URL and keeps it independent of the view', async () => {
    window.location.hash = '#/telemetry?sessionId=session-1&view=3d&fullscreen=true';
    render(<ReplayInspectorPage />);

    const fullscreen = screen.getByRole('button', { name: 'Fullscreen' });
    expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 2D' }));
    await waitFor(() => expect(window.location.hash).toContain('view=2d&fullscreen=true'));
    expect(fullscreen).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(fullscreen);
    await waitFor(() => expect(window.location.hash).toBe('#/telemetry?sessionId=session-1&view=2d'));
    expect(fullscreen).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(fullscreen);
    await waitFor(() => expect(window.location.hash).toContain('view=2d&fullscreen=true'));
    expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  });

  it('navigates back when the inspector closes', async () => {
    window.location.hash = '#/replay?sessionId=session-1';
    render(<ReplayInspectorPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(window.location.hash).toContain('/'));
  });

  it('returns from race view to lap view on Race Back when the lap view opened it', async () => {
    window.location.hash = '#/telemetry?sessionId=session-1&view=2d';
    render(<ReplayInspectorPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Race' }));
    await waitFor(() => expect(screen.getByTestId('mock-race')).toBeInTheDocument());
    expect(window.location.hash).toContain('mode=race');

    fireEvent.click(screen.getByRole('button', { name: 'Race Back' }));
    await waitFor(() => expect(screen.getByTestId('mock-inspector')).toBeInTheDocument());
    expect(window.location.hash).not.toContain('mode=race');
  });

  it('leaves for the page before on Race Back when the race was opened directly, not into a lap view', async () => {
    // The test router has one entry, so going back stays; the old Back turned this race into the lap view.
    window.location.hash = '#/telemetry?sessionId=session-1&view=2d&mode=race';
    render(<ReplayInspectorPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Race Back' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByTestId('mock-inspector')).not.toBeInTheDocument();
    expect(window.location.hash).toContain('mode=race');
  });

  it('keeps the 3D view and the moment between the lap view and the race, both ways', async () => {
    window.location.hash = '#/telemetry?sessionId=session-1&view=3d&driverOrdinal=1&lapOrdinal=4';
    render(<ReplayInspectorPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Race at cursor' }));
    await waitFor(() => expect(screen.getByTestId('mock-race')).toBeInTheDocument());
    expect(screen.getByTestId('race-view')).toHaveTextContent('3d');
    expect(screen.getByTestId('race-lap-sec')).toHaveTextContent('12.5');
    fireEvent.click(screen.getByRole('button', { name: 'Open Lap' }));
    await waitFor(() => expect(screen.getByTestId('mock-inspector')).toBeInTheDocument());
    expect(screen.getByTestId('view-mode')).toHaveTextContent('3d');
    expect(screen.getByTestId('lap-sec')).toHaveTextContent('20');
    expect(screen.getByTestId('lap-ordinal')).toHaveTextContent('9');
    // The race's own 2D/3D switch is the shared one.
    fireEvent.click(screen.getByRole('button', { name: 'Open Race' }));
    await waitFor(() => expect(screen.getByTestId('mock-race')).toBeInTheDocument());
    expect(screen.getByTestId('race-lap-sec')).toHaveTextContent('none');
    fireEvent.click(screen.getByRole('button', { name: 'Race 2D' }));
    await waitFor(() => expect(window.location.hash).toContain('view=2d'));
  });

  it('falls back to the session page when Telemetry is opened with no prior history', async () => {
    const previousState = window.history.state as unknown;
    window.location.hash = '#/telemetry?sessionId=session%2F1&view=2d';
    window.history.replaceState({ idx: 0 }, '');
    try {
      render(<ReplayInspectorPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(window.location.hash).toContain('/session/session%2F1'));
    } finally {
      window.history.replaceState(previousState, '');
    }
  });
});
