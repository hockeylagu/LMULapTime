import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReplayInspectorPage } from '../../../../src/components/replay/ReplayInspectorPage.js';

interface MockInspectorProps {
  sessionId: string;
  initialDriverOrdinal?: number;
  initialLapOrdinal?: number;
  initialCompareMode: boolean;
  initialBaselineSessionId: string | null;
  initialBaselineDriverOrdinal?: number;
  initialBaselineLapOrdinal?: number | null;
  initialCornerNumber?: number;
  onClose: () => void;
  onLocatorChange: (driverOrdinal: number, lapOrdinal: number) => void;
}

vi.mock('../../../../src/components/replay/inspector/ReplayInspectorContent.js', () => ({
  ReplayInspectorContent: (props: MockInspectorProps): ReactNode => (
    <div data-testid="mock-inspector">
      <span data-testid="session-id">{props.sessionId}</span>
      <span data-testid="driver-ordinal">{props.initialDriverOrdinal}</span>
      <span data-testid="lap-ordinal">{props.initialLapOrdinal}</span>
      <span data-testid="compare-mode">{String(props.initialCompareMode)}</span>
      <span data-testid="baseline-session">{props.initialBaselineSessionId ?? 'none'}</span>
      <span data-testid="baseline-driver">{props.initialBaselineDriverOrdinal}</span>
      <span data-testid="baseline-lap">{props.initialBaselineLapOrdinal ?? 'none'}</span>
      <span data-testid="corner">{props.initialCornerNumber ?? 'none'}</span>
      <button type="button" onClick={() => props.onLocatorChange(2, 8)}>Change locator</button>
      <button type="button" onClick={props.onClose}>Close</button>
    </div>
  ),
}));

describe('ReplayInspectorPage', () => {
  beforeEach(() => { window.location.hash = '#/replay'; });

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

  it('navigates back when the inspector closes', async () => {
    window.location.hash = '#/replay?sessionId=session-1';
    render(<ReplayInspectorPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(window.location.hash).toContain('/'));
  });
});
