import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetrySlipAngleChannel } from '../../../../src/components/replay/telemetry/channels/dynamics/TelemetrySlipAngleChannel';
import { PointComparison } from '../../../../src/utils/replayComparison';

describe('TelemetrySlipAngleChannel', () => {
  it('renders awaiting telemetry when no path and no point provided', () => {
    render(
      <TelemetrySlipAngleChannel
        slipAnglePath=""
        isCursorInView={false}
        cursorPct={50}
      />
    );

    expect(screen.getByText('BODY SLIP ANGLE (BETA)')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getByText('Awaiting telemetry')).toBeInTheDocument();
  });

  it('renders positive slip angle with cursor tooltip in bottom position when cursorPct < 15', () => {
    const mockComparison = {
      baseline: { slipAngleDeg: 1.85 },
    } as unknown as PointComparison;

    render(
      <TelemetrySlipAngleChannel
        slipAnglePath="M 0 50 L 1000 40"
        baselineSlipAnglePath="M 0 50 L 1000 45"
        currentPoint={{ slipAngleDeg: 2.45 } as unknown as import('../../../../server/core/types').ReplayTelemetryPoint}
        currentComparison={mockComparison}
        isCursorInView={true}
        cursorPct={10}
      />
    );

    expect(screen.getAllByText('+2.45°').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Base: 1.85°')).toBeInTheDocument();
    expect(screen.getByText('B: 1.85°')).toBeInTheDocument();
  });

  it('renders negative slip angle with cursor tooltip flipped when cursorPct > 85', () => {
    render(
      <TelemetrySlipAngleChannel
        slipAnglePath="M 0 50 L 1000 60"
        currentPoint={{ slipAngleDeg: -3.2 } as unknown as import('../../../../server/core/types').ReplayTelemetryPoint}
        isCursorInView={true}
        cursorPct={90}
      />
    );

    expect(screen.getAllByText('-3.20°').length).toBeGreaterThanOrEqual(1);
  });

  it('renders 0.00° fallback when slipAnglePath exists but currentPoint is undefined', () => {
    render(
      <TelemetrySlipAngleChannel
        slipAnglePath="M 0 50 L 1000 50"
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getAllByText('0.00°').length).toBeGreaterThanOrEqual(1);
  });
});
