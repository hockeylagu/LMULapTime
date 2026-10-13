import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsMapTelemetryHud } from '../../../../../src/components/replay/map/display/GpsMapTelemetryHud.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';

describe('GpsMapTelemetryHud', () => {
  beforeEach(() => localStorage.clear());
  const mockPrimary: ReplayTrajectoryPoint = {
    x: 100,
    y: 0,
    z: 200,
    speedKmh: 227,
    gear: 5,
    throttle: 100,
    brake: 0,
    steerYaw: 0.3,
    timeSec: 42.5,
    inPit: false,
    isOffTrack: false,
  };

  const mockBaseline: ReplayTrajectoryPoint = {
    x: 105,
    y: 0,
    z: 198,
    speedKmh: 218,
    gear: 5,
    throttle: 85,
    brake: 10,
    steerYaw: -12.5,
    timeSec: 42.8,
  };

  it('returns null when primaryPoint is null or undefined', () => {
    const { container } = render(<GpsMapTelemetryHud primaryPoint={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders single-row telemetry HUD when comparing is not active', () => {
    render(<GpsMapTelemetryHud primaryPoint={mockPrimary} />);

    expect(screen.getByTestId('gps-map-telemetry-hud')).toBeInTheDocument();
    expect(screen.getByText('227')).toBeInTheDocument();
    expect(screen.getByText('GEAR 5')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('ON TRACK')).toBeInTheDocument();

    expect(screen.getByTestId('telemetry-hud-primary')).toBeInTheDocument();
    expect(screen.queryByTestId('telemetry-hud-baseline')).toBeNull();
  });

  it('renders TC and ABS badges when active on primary car', () => {
    const activeAssists: ReplayTrajectoryPoint = {
      ...mockPrimary,
      tcActive: true,
      absActive: true,
      brake: 80,
    };

    render(<GpsMapTelemetryHud primaryPoint={activeAssists} />);

    expect(screen.getByText('TC')).toBeInTheDocument();
    expect(screen.getByText('ABS')).toBeInTheDocument();
  });

  it('renders two rows (Primary and Baseline) when baselinePoint is provided', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
      />
    );

    expect(screen.getByTestId('telemetry-hud-primary')).toBeInTheDocument();
    expect(screen.getByTestId('telemetry-hud-baseline')).toBeInTheDocument();

    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.queryByText('ME')).not.toBeInTheDocument();
    expect(screen.queryByText('RIVAL')).not.toBeInTheDocument();
    expect(screen.getByText('5.4 m line')).toHaveAttribute('title', 'Distance between racing lines at the same track distance, not a race gap.');

    // Primary speed
    expect(screen.getByText('227')).toBeInTheDocument();
    // Baseline speed
    expect(screen.getByText('218')).toBeInTheDocument();
  });


  it('renders delta column and values when comparing laps', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
        deltaTimeSec={0.53}
      />
    );

    expect(screen.getByLabelText('Live delta: behind')).toBeInTheDocument();
    expect(screen.getByText('+0.53s')).toBeInTheDocument();
  });

  it('renders negative delta correctly when ahead of the baseline', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
        deltaTimeSec={-0.24}
      />
    );

    expect(screen.getByText('-0.24s')).toBeInTheDocument();
    expect(screen.getByLabelText('Live delta: ahead')).toBeInTheDocument();
  });


  it('renders line separation distance between cars when comparing laps', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
        deltaTimeSec={0.53}
      />
    );

    // Header
    expect(screen.getByText('5.4 m line')).toBeInTheDocument();
    // Computed hypot(100 - 105, 200 - 198) = hypot(-5, 2) = sqrt(29) ≈ 5.4m
  });


  it('keeps the HUD in the full-width bottom bar in both lap modes', () => {
    const { rerender } = render(<GpsMapTelemetryHud primaryPoint={mockPrimary} />);
    const hud = screen.getByTestId('gps-map-telemetry-hud');
    expect(hud).toHaveClass('w-full');

    rerender(<GpsMapTelemetryHud primaryPoint={mockPrimary} baselinePoint={mockBaseline} />);
    expect(hud).toHaveClass('w-full');
  });

  it('renders steering input with tabular-nums and fixed one-decimal format', () => {
    render(<GpsMapTelemetryHud primaryPoint={mockPrimary} />);
    // steerYaw: 0.3 -> angle = 0.3 * 270 = 81 -> steerPct = 81 / 270 * 100 = 30.0% -> 30.0% R
    const steerEl = screen.getByText(/% [LRC]/);
    expect(steerEl).toHaveClass('tabular-nums');
    expect(steerEl.textContent).toMatch(/^\d+\.\d% [LRC]$/);
  });

  it('labels negative lateral G as a right turn (ISO 8855)', () => {
    render(<GpsMapTelemetryHud primaryPoint={{ ...mockPrimary, accelLatG: -1.42, accelLonG: 0.31 }} />);
    expect(screen.getByLabelText('G-force: 1.4R · 0.3A')).toBeInTheDocument();
  });

  it('keeps the G-force breakdown and weather accessible without repeating them in the bar', () => {
    const gPoint: ReplayTrajectoryPoint = {
      ...mockPrimary,
      accelLatG: 1.82,
      accelLonG: -0.65,
    };

    render(<GpsMapTelemetryHud primaryPoint={gPoint} />);

    // Dedicated G-FORCE column header
    // Hypotenuse = sqrt(1.82^2 + (-0.65)^2) = sqrt(3.3124 + 0.4225) = sqrt(3.7349) ≈ 1.93G
    expect(screen.getByText('1.93G')).toBeInTheDocument();
    // Lateral and longitudinal breakdown, ISO 8855: positive lateral G is a left turn
    expect(screen.getByLabelText('G-force: 1.8L · 0.7B')).toBeInTheDocument();

    // STATUS remains clean (not polluted with G-force)
    expect(screen.getByText('ON TRACK')).toBeInTheDocument();
    expect(screen.getByLabelText('ON TRACK, air --')).toBeInTheDocument();
  });

  it('keeps missing and non-finite channels unavailable', () => {
    render(<GpsMapTelemetryHud primaryPoint={{ x: 0, y: 0, z: 0, speedKmh: NaN, throttle: Infinity }} />);
    const row = screen.getByTestId('telemetry-hud-primary');
    expect(row).toHaveTextContent('GEAR --');
    expect(row).toHaveTextContent('UNKNOWN');
    expect(row).not.toHaveTextContent('0.00G');
    expect(row).not.toHaveTextContent('NaN');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([[0, 'N'], [-1, 'R'], [8, '8']])('preserves recorded gear %s as %s', (gear, label) => {
    render(<GpsMapTelemetryHud primaryPoint={{ ...mockPrimary, gear }} />);
    expect(screen.getByText(`GEAR ${label}`)).toBeInTheDocument();
  });

  it('does not invent a pit speed or penalty validity from status flags', () => {
    const { rerender } = render(<GpsMapTelemetryHud primaryPoint={{ ...mockPrimary, pitLimiter: true }} />);
    expect(screen.getByLabelText('LIMITER, enabled')).toBeInTheDocument();
    expect(screen.queryByText('60 km/h')).not.toBeInTheDocument();
    rerender(<GpsMapTelemetryHud primaryPoint={{ ...mockPrimary, isOffTrack: true }} />);
    expect(screen.getByLabelText('OFF TRACK, outside road')).toBeInTheDocument();
    expect(screen.queryByText('limits cut')).not.toBeInTheDocument();
  });

  it('retains real zero channels and zero ambient temperature', () => {
    render(<GpsMapTelemetryHud primaryPoint={{ ...mockPrimary, ambientTemp: 0, gear: 0,
      speedKmh: 0, throttle: 0, brake: 0, steerYaw: 0, accelLatG: 0, accelLonG: 0 }} />);
    expect(screen.getByText('0.00G')).toBeInTheDocument();
    expect(screen.getByLabelText('ON TRACK, air 0.0°C')).toBeInTheDocument();
    expect(screen.getByText('0.0% C')).toBeInTheDocument();
  });
});

