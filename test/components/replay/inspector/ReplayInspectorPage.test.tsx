import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReplayInspectorPage } from '../../../../src/components/replay/ReplayInspectorPage.js';

interface MockInspectorProps {
  replayName: string;
  initialLapNumber?: number;
  initialDriverName: string | null;
  initialCompareMode: boolean;
  initialBaselineReplayName: string | null;
  initialBaselineLapNumber?: number;
  initialBaselineDriverName: string | null;
  onClose: () => void;
  onLapChange: (lapNumber: number) => void;
}

vi.mock('../../../../src/components/replay/inspector/ReplayInspectorContent.js', () => ({
  ReplayInspectorContent: (props: MockInspectorProps): ReactNode => (
    <div data-testid="mock-inspector">
      <span>{props.replayName}</span>
      <span data-testid="initial-lap">{props.initialLapNumber ?? 'none'}</span>
      <span data-testid="driver-name">{props.initialDriverName ?? 'none'}</span>
      <span data-testid="compare-mode">{String(props.initialCompareMode)}</span>
      <span data-testid="baseline-replay">{props.initialBaselineReplayName ?? 'none'}</span>
      <span data-testid="baseline-lap">{props.initialBaselineLapNumber ?? 'none'}</span>
      <span data-testid="baseline-driver">{props.initialBaselineDriverName ?? 'none'}</span>
      <button type="button" onClick={() => props.onLapChange(8)}>Change lap</button>
      <button type="button" onClick={props.onClose}>Close</button>
    </div>
  ),
}));

describe('ReplayInspectorPage', () => {
  beforeEach(() => {
    window.location.hash = '#/replay';
  });

  it('redirects to the dashboard when no replay is selected', async () => {
    render(<ReplayInspectorPage />);

    await waitFor(() => expect(window.location.hash).toContain('/dashboard'));
    expect(screen.queryByTestId('mock-inspector')).not.toBeInTheDocument();
  });

  it('forwards replay query parameters and updates the lap query', async () => {
    window.location.hash = '#/replay?replayName=Spa_R1.vcr&lap=5&driverName=Samuel%20Lague&baselineReplay=Spa_Q1.vcr&compareLapNum=3&compareDriver=Rival';
    render(<ReplayInspectorPage />);

    expect(screen.getByTestId('mock-inspector')).toBeInTheDocument();
    expect(screen.getByText('Spa_R1.vcr')).toBeInTheDocument();
    expect(screen.getByTestId('initial-lap')).toHaveTextContent('5');
    expect(screen.getByTestId('driver-name')).toHaveTextContent('Samuel Lague');
    expect(screen.getByTestId('compare-mode')).toHaveTextContent('true');
    expect(screen.getByTestId('baseline-replay')).toHaveTextContent('Spa_Q1.vcr');
    expect(screen.getByTestId('baseline-lap')).toHaveTextContent('3');
    expect(screen.getByTestId('baseline-driver')).toHaveTextContent('Rival');

    fireEvent.click(screen.getByRole('button', { name: 'Change lap' }));
    await waitFor(() => expect(window.location.hash).toContain('lap=8'));
  });

  it('navigates back when the inspector closes', async () => {
    window.location.hash = '#/replay?replayName=Spa_R1.vcr';
    render(<ReplayInspectorPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(window.location.hash).toContain('/'));
  });

  it('forwards compare lap and baseline replay when present in URL parameters', () => {
    window.location.hash = '#/telemetry?replayName=Daytona+International+Speedway+Road+Course+R1+8.Vcr&lap=11&baselineReplay=Daytona+International+Speedway+Road+Course+Q1+8.Vcr&compareSessionId=2026_08_27_13_39_52-32Q1&compareDriver=Samuel+Lague&compareLapNum=5';
    render(<ReplayInspectorPage />);

    expect(screen.getByTestId('mock-inspector')).toBeInTheDocument();
    expect(screen.getByTestId('initial-lap')).toHaveTextContent('11');
    expect(screen.getByTestId('compare-mode')).toHaveTextContent('true');
    expect(screen.getByTestId('baseline-replay')).toHaveTextContent('Daytona International Speedway Road Course Q1 8.Vcr');
    expect(screen.getByTestId('baseline-lap')).toHaveTextContent('5');
    expect(screen.getByTestId('baseline-driver')).toHaveTextContent('Samuel Lague');
  });
});
