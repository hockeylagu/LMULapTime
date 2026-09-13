import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TelemetryRpmChannel,
  TelemetryTireTempsChannel,
  TelemetryTireWearChannel,
  TelemetryBrakeTempsChannel,
  TelemetryLateralOffsetChannel,
  TelemetryGearChannel,
  TelemetryThrottleChannel,
  TelemetryBrakeChannel,
  TelemetrySteerChannel,
} from '../../src/components/replay/telemetry/index.js';
import { ReplayTrajectoryPoint } from '../../server/types.js';

describe('Extended Telemetry Channels', () => {
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
    tireTemps: [92, 95, 88, 89],
    tireWear: [240, 241, 238, 239],
    brakeTemps: [520, 530, 410, 420],
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

  it('renders TelemetryTireTempsChannel with 4-corner temperatures', () => {
    render(
      <TelemetryTireTempsChannel
        tireTempsPaths={{ fl: 'M 0 50', fr: 'M 0 50', rl: 'M 0 50', rr: 'M 0 50' }}
        minTireTemp={40}
        maxTireTemp={130}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/TIRE TEMPS/i)).toBeInTheDocument();
    expect(screen.getByText(/FL: 92°C/i)).toBeInTheDocument();
    expect(screen.getByText(/FR: 95°C/i)).toBeInTheDocument();
    expect(screen.getByText(/RL: 88°C/i)).toBeInTheDocument();
    expect(screen.getByText(/RR: 89°C/i)).toBeInTheDocument();
  });

  it('renders TelemetryTireWearChannel with remaining wear percentage', () => {
    render(
      <TelemetryTireWearChannel
        tireWearPaths={{ fl: 'M 0 50', fr: 'M 0 50', rl: 'M 0 50', rr: 'M 0 50' }}
        minTireWearPct={0}
        maxTireWearPct={100}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/TIRE WEAR/i)).toBeInTheDocument();
    // 240 / 255 * 100 = 94.1%
    expect(screen.getByText(/FL: 94.1%/i)).toBeInTheDocument();
  });

  it('renders TelemetryBrakeTempsChannel with rotor temperatures', () => {
    render(
      <TelemetryBrakeTempsChannel
        brakeTempsPaths={{ fl: 'M 0 50', fr: 'M 0 50', rl: 'M 0 50', rr: 'M 0 50' }}
        maxBrakeTemp={750}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/BRAKE ROTOR TEMPS/i)).toBeInTheDocument();
    expect(screen.getByText(/FL: 520°C/i)).toBeInTheDocument();
    expect(screen.getByText(/FR: 530°C/i)).toBeInTheDocument();
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
