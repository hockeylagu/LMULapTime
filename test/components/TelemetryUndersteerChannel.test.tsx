import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetryUndersteerChannel } from '../../src/components/replay/telemetry/TelemetryUndersteerChannel';
import { PointComparison } from '../../src/utils/replayComparison';

describe('TelemetryUndersteerChannel', () => {
  it('renders awaiting telemetry when no path and no point provided', () => {
    render(
      <TelemetryUndersteerChannel
        understeerPath=""
        isCursorInView={false}
        cursorPct={50}
      />
    );

    expect(screen.getByText('HANDLING BALANCE')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getByText('Awaiting telemetry')).toBeInTheDocument();
  });

  it('renders neutral balance when deg is within +/-0.2', () => {
    render(
      <TelemetryUndersteerChannel
        understeerPath="M 0 50 L 1000 50"
        currentPoint={{ understeerDeg: 0.1 } as unknown as import('../../server/core/types').ReplayTelemetryPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getAllByText('0.00° Neutral').length).toBeGreaterThanOrEqual(1);
  });

  it('renders understeer (push) when deg > 0 with positive baseline', () => {
    const mockComparison = {
      baseline: { understeerDeg: 1.5 },
    } as unknown as PointComparison;

    render(
      <TelemetryUndersteerChannel
        understeerPath="M 0 50 L 1000 40"
        baselineUndersteerPath="M 0 50 L 1000 45"
        currentPoint={{ understeerDeg: 2.3 } as unknown as import('../../server/core/types').ReplayTelemetryPoint}
        currentComparison={mockComparison}
        isCursorInView={true}
        cursorPct={10}
      />
    );

    expect(screen.getAllByText('+2.30° Understeer (Push)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Base: +1.50°')).toBeInTheDocument();
    expect(screen.getByText('B: +1.50°')).toBeInTheDocument();
  });

  it('renders oversteer (loose) when deg < 0 with negative baseline and cursorPct > 85', () => {
    const mockComparison = {
      baseline: { understeerDeg: -1.2 },
    } as unknown as PointComparison;

    render(
      <TelemetryUndersteerChannel
        understeerPath="M 0 50 L 1000 60"
        currentPoint={{ understeerDeg: -2.7 } as unknown as import('../../server/core/types').ReplayTelemetryPoint}
        currentComparison={mockComparison}
        isCursorInView={true}
        cursorPct={90}
      />
    );

    expect(screen.getAllByText('-2.70° Oversteer (Loose)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Base: -1.20°')).toBeInTheDocument();
    expect(screen.getByText('B: -1.20°')).toBeInTheDocument();
  });
});
