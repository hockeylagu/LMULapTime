import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsMapTelemetryHud } from '../../../../../src/components/replay/map/display/GpsMapTelemetryHud.js';
import type { ReplayTelemetryPoint } from '../../../../../shared/types/index.js';

describe('GpsMapTelemetryHud', () => {
  const mockPrimary: ReplayTelemetryPoint = {
    x: 100,
    y: 0,
    z: 200,
    speedKmh: 227,
    gear: 5,
    throttle: 100,
    brake: 0,
    steerYaw: 0.3,
    timeSec: 42.5,
  };

  const mockBaseline: ReplayTelemetryPoint = {
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
    const activeAssists: ReplayTelemetryPoint = {
      ...mockPrimary,
      tcActive: true,
      absActive: true,
      brake: 80,
    };

    render(<GpsMapTelemetryHud primaryPoint={activeAssists} />);

    expect(screen.getByText('TC')).toBeInTheDocument();
    expect(screen.getByText('ABS')).toBeInTheDocument();
  });

  it('renders two rows (ME and RIVAL) when baselinePoint is provided', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
      />
    );

    expect(screen.getByTestId('telemetry-hud-primary')).toBeInTheDocument();
    expect(screen.getByTestId('telemetry-hud-baseline')).toBeInTheDocument();

    expect(screen.getByText('ME')).toBeInTheDocument();
    expect(screen.getByText('RIVAL')).toBeInTheDocument();

    // Primary speed
    expect(screen.getByText('227')).toBeInTheDocument();
    // Baseline speed
    expect(screen.getByText('218')).toBeInTheDocument();
  });

  it('toggles collapsed and expanded state on toggle button click', () => {
    render(<GpsMapTelemetryHud primaryPoint={mockPrimary} />);

    const toggleBtn = screen.getByRole('button', { name: /collapse telemetry bar/i });
    expect(toggleBtn).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('telemetry-hud-primary')).toBeNull();
    expect(screen.getByText(/THR 100%/)).toBeInTheDocument();

    // Click to expand
    const expandBtn = screen.getByRole('button', { name: /expand telemetry bar/i });
    fireEvent.click(expandBtn);
    expect(screen.getByTestId('telemetry-hud-primary')).toBeInTheDocument();
  });

  it('renders delta column and values when comparing laps', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
        deltaTimeSec={0.53}
      />
    );

    expect(screen.getByText('DELTA')).toBeInTheDocument();
    expect(screen.getByText('+0.53s')).toBeInTheDocument();
    expect(screen.getByText('losing')).toBeInTheDocument();
    expect(screen.getByText('REF')).toBeInTheDocument();
    expect(screen.getByText('baseline')).toBeInTheDocument();
  });

  it('renders negative delta correctly when gaining time against rival', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
        deltaTimeSec={-0.24}
      />
    );

    expect(screen.getByText('-0.24s')).toBeInTheDocument();
    expect(screen.getByText('gaining')).toBeInTheDocument();
  });

  it('renders delta in collapsed HUD bar when comparing laps', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
        deltaTimeSec={0.42}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /collapse telemetry bar/i });
    fireEvent.click(toggleBtn);

    // Collapsed bar should include delta badge
    expect(screen.getByText('+0.42s')).toBeInTheDocument();
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
    expect(screen.getByText('LINE')).toBeInTheDocument();
    // Computed hypot(100 - 105, 200 - 198) = hypot(-5, 2) = sqrt(29) ≈ 5.4m
    expect(screen.getByText('5.4')).toBeInTheDocument();
    expect(screen.getByText('line gap')).toBeInTheDocument();
  });

  it('renders line distance in collapsed HUD bar when comparing laps', () => {
    render(
      <GpsMapTelemetryHud
        primaryPoint={mockPrimary}
        baselinePoint={mockBaseline}
        lineDistanceM={2.8}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /collapse telemetry bar/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText('2.8m line')).toBeInTheDocument();
  });

  it('maintains fixed width in comparing and single car modes to prevent resizing on steering changes', () => {
    const { rerender } = render(<GpsMapTelemetryHud primaryPoint={mockPrimary} />);
    const hud = screen.getByTestId('gps-map-telemetry-hud');
    expect(hud).toHaveClass('w-[450px]');

    rerender(<GpsMapTelemetryHud primaryPoint={mockPrimary} baselinePoint={mockBaseline} />);
    expect(hud).toHaveClass('w-[596px]');
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
    expect(screen.getByText('1.4R · 0.3A')).toBeInTheDocument();
  });

  it('renders dedicated G-FORCE column and keeps status clean', () => {
    const gPoint: ReplayTelemetryPoint = {
      ...mockPrimary,
      accelLatG: 1.82,
      accelLonG: -0.65,
    };

    render(<GpsMapTelemetryHud primaryPoint={gPoint} />);

    // Dedicated G-FORCE column header
    expect(screen.getByText('G-FORCE')).toBeInTheDocument();
    // Hypotenuse = sqrt(1.82^2 + (-0.65)^2) = sqrt(3.3124 + 0.4225) = sqrt(3.7349) ≈ 1.93G
    expect(screen.getByText('1.93G')).toBeInTheDocument();
    // Lateral and longitudinal breakdown, ISO 8855: positive lateral G is a left turn
    expect(screen.getByText('1.8L · 0.7B')).toBeInTheDocument();

    // STATUS remains clean (not polluted with G-force)
    expect(screen.getByText('ON TRACK')).toBeInTheDocument();
    expect(screen.getByText('green')).toBeInTheDocument();
  });
});

