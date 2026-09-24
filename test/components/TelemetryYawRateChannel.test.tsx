import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetryYawRateChannel } from '../../src/components/replay/telemetry/TelemetryYawRateChannel';
import { PointComparison } from '../../src/utils/replayComparison';

describe('TelemetryYawRateChannel', () => {
  it('renders awaiting telemetry when no path and no point provided', () => {
    render(
      <TelemetryYawRateChannel
        yawRatePath=""
        isCursorInView={false}
        cursorPct={50}
      />
    );

    expect(screen.getByText('YAW RATE')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getByText('Awaiting telemetry')).toBeInTheDocument();
  });

  it('renders positive yaw rate with right direction and baseline', () => {
    const mockComparison = {
      baseline: { yawRateDeg: 15.2 },
    } as unknown as PointComparison;

    render(
      <TelemetryYawRateChannel
        yawRatePath="M 0 50 L 1000 40"
        baselineYawRatePath="M 0 50 L 1000 45"
        currentPoint={{ yawRateDeg: 35.6 } as unknown as import('../../server/core/types').ReplayTelemetryPoint}
        currentComparison={mockComparison}
        isCursorInView={true}
        cursorPct={10}
      />
    );

    expect(screen.getAllByText('+35.6°/s R').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Base: +15.2°/s R')).toBeInTheDocument();
    expect(screen.getByText('B: +15.2°/s R')).toBeInTheDocument();
  });

  it('renders negative yaw rate with left direction and near-zero without direction letter', () => {
    render(
      <TelemetryYawRateChannel
        yawRatePath="M 0 50 L 1000 60"
        currentPoint={{ yawRateDeg: -22.4 } as unknown as import('../../server/core/types').ReplayTelemetryPoint}
        isCursorInView={true}
        cursorPct={90}
      />
    );

    expect(screen.getAllByText('-22.4°/s L').length).toBeGreaterThanOrEqual(1);

    // Near zero test
    render(
      <TelemetryYawRateChannel
        yawRatePath="M 0 50 L 1000 50"
        currentPoint={{ yawRateDeg: 0.2 } as unknown as import('../../server/core/types').ReplayTelemetryPoint}
        isCursorInView={false}
        cursorPct={50}
      />
    );

    expect(screen.getByText('+0.2°/s')).toBeInTheDocument();
  });
});
