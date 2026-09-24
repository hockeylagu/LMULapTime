import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetryPedalsChannel, TelemetryPedalsChannelProps } from '../../src/components/replay/telemetry/TelemetryPedalsChannel.js';
import { ReplayTelemetryPoint } from '../../server/core/types.js';
import { PointComparison } from '../../src/utils/replayComparison.js';

describe('TelemetryPedalsChannel component', () => {
  const mockPoint: ReplayTelemetryPoint = {
    x: 10,
    y: 0,
    z: 20,
    speedKmh: 240,
    throttle: 85.5,
    brake: 0,
    gear: 5,
    steerYaw: 0.05,
    tcActive: false,
    absActive: false,
  };

  const mockComparison: PointComparison = {
    primary: mockPoint,
    baseline: {
      timeSec: 10.0,
      x: 10,
      y: 0,
      z: 20,
      speedKmh: 242,
      throttle: 90.0,
      brake: 0,
      gear: 5,
      steerYaw: 0.04,
    },
    deltaTimeSec: -0.12,
    deltaSpeedKmh: -2.0,
    deltaThrottle: -4.5,
    deltaBrake: 0,
    deltaSteer: 0,
  };

  const defaultProps: TelemetryPedalsChannelProps = {
    throttlePath: 'M 0 50 L 100 20',
    throttleArea: 'M 0 50 L 100 20 L 100 100 L 0 100 Z',
    brakePath: 'M 0 100 L 100 100',
    brakeArea: 'M 0 100 L 100 100 L 100 100 L 0 100 Z',
    currentPoint: mockPoint,
    currentComparison: null,
    isCursorInView: false,
    cursorPct: 50,
  };

  it('renders throttle and brake channels with values', () => {
    render(<TelemetryPedalsChannel {...defaultProps} />);
    expect(screen.getByText('THROTTLE')).toBeInTheDocument();
    expect(screen.getByText('85.5%')).toBeInTheDocument();
    expect(screen.getByText('BRAKE')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('renders baseline values when comparison is provided', () => {
    render(<TelemetryPedalsChannel {...defaultProps} currentComparison={mockComparison} />);
    expect(screen.getByText('Base: 90%')).toBeInTheDocument();
    expect(screen.getByText('Base: 0%')).toBeInTheDocument();
  });

  it('renders cursor indicator at cursorPct with TC and ABS badges when active', () => {
    const activePedalsPoint: ReplayTelemetryPoint = {
      ...mockPoint,
      throttle: 100,
      brake: 80,
      tcActive: true,
      absActive: true,
    };

    const { rerender } = render(
      <TelemetryPedalsChannel
        {...defaultProps}
        currentPoint={activePedalsPoint}
        currentComparison={mockComparison}
        isCursorInView={true}
        cursorPct={10} // < 15 -> bottom positioning
      />
    );

    expect(screen.getByText('TC')).toBeInTheDocument();
    expect(screen.getByText('ABS')).toBeInTheDocument();
    expect(screen.getByText('B: 90%')).toBeInTheDocument();
    expect(screen.getByText('B: 0%')).toBeInTheDocument();

    // Rerender near right edge (> 85%)
    rerender(
      <TelemetryPedalsChannel
        {...defaultProps}
        currentPoint={activePedalsPoint}
        isCursorInView={true}
        cursorPct={90}
      />
    );
    expect(screen.getByText('TC')).toBeInTheDocument();
  });

  it('renders dashed baseline SVG paths when provided', () => {
    const { container } = render(
      <TelemetryPedalsChannel
        {...defaultProps}
        baselineThrottlePath="M 0 45 L 100 15"
        baselineBrakePath="M 0 95 L 100 95"
      />
    );
    const dashedPaths = container.querySelectorAll('path[stroke-dasharray="4 3"]');
    expect(dashedPaths.length).toBe(2);
  });
});
