import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TelemetryRpmChannel,
  TelemetryLateralOffsetChannel,
  TelemetryGearChannel,
  TelemetryThrottleChannel,
  TelemetryBrakeChannel,
  TelemetrySteerChannel,
} from '../../src/components/replay/telemetry/index.js';
import { ReplayTrajectoryPoint } from '../../server/types.js';

describe('Authentic VCR Telemetry Channels', () => {
  const mockPoint: ReplayTrajectoryPoint = {
    x: 0,
    y: 0,
    z: 0,
    speedKmh: 200,
    throttle: 85,
    brake: 0,
    gear: 4,
    steerYaw: 12.5,
    engineRpm: 7850,
    lateralOffsetM: 1.85,
  };

  it('renders TelemetryGearChannel with yellow/amber gear styling and label', () => {
    const { container } = render(
      <TelemetryGearChannel
        gearPath="M 0 50 L 1000 50"
        baselineGearPath="M 0 60 L 1000 60"
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/GEAR/i)).toBeInTheDocument();
    expect(screen.getAllByText(/G4/i).length).toBeGreaterThanOrEqual(1);
    // Verify yellow/amber stroke color is used for gear
    const paths = container.querySelectorAll('path');
    const hasYellowStroke = Array.from(paths).some((p) => p.getAttribute('stroke') === '#f59e0b');
    expect(hasYellowStroke).toBe(true);
  });

  it('renders TelemetryThrottleChannel and TelemetryBrakeChannel', () => {
    render(
      <>
        <TelemetryThrottleChannel
          throttlePath="M 0 50 L 1000 50"
          currentPoint={mockPoint}
          isCursorInView={true}
          cursorPct={50}
        />
        <TelemetryBrakeChannel
          brakePath="M 0 100 L 1000 100"
          currentPoint={mockPoint}
          isCursorInView={true}
          cursorPct={50}
        />
      </>
    );

    expect(screen.getByText(/THROTTLE/i)).toBeInTheDocument();
    expect(screen.getByText(/BRAKE/i)).toBeInTheDocument();
    expect(screen.getAllByText(/85%/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetrySteerChannel with steering angle', () => {
    render(
      <TelemetrySteerChannel
        steerPath="M 0 50 L 1000 50"
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/STEERING/i)).toBeInTheDocument();
    expect(screen.getByText(/12\.5°/i)).toBeInTheDocument();
    expect(screen.getByText(/RIGHT/i)).toBeInTheDocument();
  });

  it('renders TelemetryRpmChannel with engine RPM value and violet/purple styling', () => {
    const { container } = render(
      <TelemetryRpmChannel
        rpmPath="M 0 50 L 1000 50"
        rpmArea="M 0 50 L 1000 50 L 1000 95 L 0 95 Z"
        maxRpm={9000}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/ENGINE RPM/i)).toBeInTheDocument();
    expect(screen.getAllByText(/7,850/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/9000 rpm/i)).toBeInTheDocument();
    const paths = container.querySelectorAll('path');
    const hasPurpleStroke = Array.from(paths).some((p) => p.getAttribute('stroke') === '#c084fc');
    expect(hasPurpleStroke).toBe(true);
  });

  it('renders TelemetryLateralOffsetChannel with displacement in meters', () => {
    render(
      <TelemetryLateralOffsetChannel
        lateralOffsetPath="M 0 50 L 1000 50"
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/LATERAL OFFSET/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\+1.85m/i).length).toBeGreaterThanOrEqual(1);
  });
});
