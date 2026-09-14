import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TelemetryRpmChannel,
  TelemetryLateralOffsetChannel,
  TelemetryGearChannel,
  TelemetryThrottleChannel,
  TelemetryBrakeChannel,
  TelemetrySteerChannel,
  TelemetryBrakeTempsChannel,
  TelemetrySuspPosChannel,
  TelemetryWheelSpeedsChannel,
  TelemetryTirePressuresChannel,
  TelemetryTireWearChannel,
  TelemetryTireTempsChannel,
  TelemetryAccelLatChannel,
  TelemetryAccelLonChannel,
  TelemetryAccelTotalChannel,
} from '../../src/components/replay/telemetry/index.js';
import { ReplayTrajectoryPoint } from '../../server/types.js';
import { computeTelemetryChartPaths } from '../../src/components/replay/telemetry/telemetryChartPaths.js';
import { TelemetryChannelRenderer } from '../../src/components/replay/telemetry/TelemetryChannelRenderer.js';

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
    brakeTemps: [450, 445, 380, 375],
    rideHeight: [24.5, 25.0, 32.1, 31.8],
    wheelSpeeds: [201.2, 200.8, 202.5, 202.0],
    tirePressures: [185.2, 186.1, 192.4, 193.0],
    tireWear: [98.5, 98.2, 97.6, 97.4],
    tireTemps: [88, 89, 94, 95],
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

  it('renders TelemetrySteerChannel with steering input percentage', () => {
    render(
      <TelemetrySteerChannel
        steerPath="M 0 50 L 1000 50"
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/STEERING/i)).toBeInTheDocument();
    expect(screen.getByText(/4\.6%/i)).toBeInTheDocument();
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

  it('renders TelemetryBrakeTempsChannel with 4-corner brake temperatures and orange header', () => {
    render(
      <TelemetryBrakeTempsChannel
        brakeTempsPaths={{ fl: 'M 0 50 L 1000 50', fr: 'M 0 50 L 1000 50', rl: 'M 0 60 L 1000 60', rr: 'M 0 60 L 1000 60' }}
        maxBrakeTemp={800}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/BRAKE ROTOR TEMPS/i)).toBeInTheDocument();
    expect(screen.getAllByText(/FL:\s*450°C/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FR:\s*445°C/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RL:\s*380°C/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RR:\s*375°C/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetrySuspPosChannel with 4-corner ride height and emerald header', () => {
    render(
      <TelemetrySuspPosChannel
        suspPosPaths={{ fl: 'M 0 50 L 1000 50', fr: 'M 0 50 L 1000 50', rl: 'M 0 60 L 1000 60', rr: 'M 0 60 L 1000 60' }}
        minSuspPos={0}
        maxSuspPos={50}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/RIDE HEIGHT/i)).toBeInTheDocument();
    expect(screen.getAllByText(/FL:\s*24\.5mm/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FR:\s*25\.0mm/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RL:\s*32\.1mm/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RR:\s*31\.8mm/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryWheelSpeedsChannel with 4-corner wheel speeds and cyan header', () => {
    render(
      <TelemetryWheelSpeedsChannel
        wheelSpeedsPaths={{ fl: 'M 0 50 L 1000 50', fr: 'M 0 50 L 1000 50', rl: 'M 0 60 L 1000 60', rr: 'M 0 60 L 1000 60' }}
        maxWheelSpeed={260}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/WHEEL SPEEDS/i)).toBeInTheDocument();
    expect(screen.getAllByText(/FL:\s*201/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FR:\s*201/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RL:\s*203/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RR:\s*202/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryTirePressuresChannel with 4-corner pressures and sky header', () => {
    render(
      <TelemetryTirePressuresChannel
        tirePressuresPaths={{ fl: 'M 0 50 L 1000 50', fr: 'M 0 50 L 1000 50', rl: 'M 0 60 L 1000 60', rr: 'M 0 60 L 1000 60' }}
        minTirePressure={150}
        maxTirePressure={210}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/TIRE PRESSURES/i)).toBeInTheDocument();
    expect(screen.getAllByText(/FL:\s*185\.2/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FR:\s*186\.1/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RL:\s*192\.4/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RR:\s*193\.0/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryTireWearChannel with 4-corner wear and amber header', () => {
    render(
      <TelemetryTireWearChannel
        tireWearPaths={{ fl: 'M 0 50 L 1000 50', fr: 'M 0 50 L 1000 50', rl: 'M 0 60 L 1000 60', rr: 'M 0 60 L 1000 60' }}
        minTireWear={80}
        maxTireWear={100}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/TIRE WEAR/i)).toBeInTheDocument();
    expect(screen.getAllByText(/FL:\s*98\.5%/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FR:\s*98\.2%/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RL:\s*97\.6%/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RR:\s*97\.4%/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryTireTempsChannel with 4-corner tire carcass temps and rose header', () => {
    render(
      <TelemetryTireTempsChannel
        tireTempsPaths={{ fl: 'M 0 50 L 1000 50', fr: 'M 0 50 L 1000 50', rl: 'M 0 60 L 1000 60', rr: 'M 0 60 L 1000 60' }}
        minTireTemp={40}
        maxTireTemp={120}
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText(/TIRE CARCASS TEMPS/i)).toBeInTheDocument();
    expect(screen.getAllByText(/FL:\s*88°C/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/FR:\s*89°C/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RL:\s*94°C/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/RR:\s*95°C/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe('TelemetryChannelRenderer & Preset Rows', () => {
  it('hides the computed badge for native DuckDB G channels and keeps it for VCR', () => {
    const point = { ...mockPoint, accelLatG: 1.2, accelLonG: -0.4, accelTotalG: 1.3 };
    const shared = { currentPoint: point, currentComparison: null, isCursorInView: false, cursorPct: 50 };

    const { rerender } = render(<TelemetryAccelLatChannel accelLatPath="M 0 50" {...shared} source="duckdb" />);
    expect(screen.queryByText('COMPUTED')).not.toBeInTheDocument();
    rerender(<TelemetryAccelLonChannel accelLonPath="M 0 50" {...shared} source="vcr" />);
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    rerender(<TelemetryAccelTotalChannel accelTotalPath="M 0 50" {...shared} source="duckdb" />);
    expect(screen.queryByText('COMPUTED')).not.toBeInTheDocument();
  });

  it('passes native acceleration telemetry through the channel renderer', () => {
    const point = { ...mockPoint, accelLatG: 1.2 };
    const paths = computeTelemetryChartPaths([], [], 0, 0);

    render(
      <TelemetryChannelRenderer
        channelId="accel-lat"
        currentPoint={point}
        pointComparisons={[]}
        paths={paths}
        isCursorInView={true}
        cursorPct={50}
        source="duckdb"
      />
    );

    expect(screen.getAllByText('+1.20 G R').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('COMPUTED')).not.toBeInTheDocument();
  });

  it('renders canonical signs and labels for every acceleration channel', () => {
    const point = {
      ...mockPoint,
      accelLatG: 1.2,
      accelLonG: -0.4,
      accelTotalG: 1.3,
    };
    const paths = computeTelemetryChartPaths([], [], 0, 0);
    const shared = {
      currentPoint: point,
      currentComparison: null,
      pointComparisons: [],
      paths,
      isCursorInView: true,
      cursorPct: 50,
    };

    const { rerender } = render(
      <TelemetryChannelRenderer channelId="accel-lat" source="duckdb" {...shared} />
    );
    expect(screen.getAllByText('+1.20 G R').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('COMPUTED')).not.toBeInTheDocument();

    rerender(
      <TelemetryChannelRenderer channelId="accel-lon" source="vcr" {...shared} />
    );
    expect(screen.getAllByText('-0.40 G Braking').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('COMPUTED').length).toBeGreaterThanOrEqual(1);

    rerender(
      <TelemetryChannelRenderer channelId="accel-total" source="duckdb" {...shared} />
    );
    expect(screen.getAllByText('1.30 G Resultant').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('COMPUTED')).not.toBeInTheDocument();
  });

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
    brakeTemps: [450, 445, 380, 375],
    rideHeight: [24.5, 25.0, 32.1, 31.8],
    wheelSpeeds: [201.2, 200.8, 202.5, 202.0],
    tirePressures: [185.2, 186.1, 192.4, 193.0],
    tireWear: [98.5, 98.2, 97.6, 97.4],
    tireTemps: [88, 89, 94, 95],
  };

  it('renders all 6 wheel/tire/suspension channels via TelemetryChannelRenderer', async () => {
    const { TelemetryChannelRenderer } = await import('../../src/components/replay/telemetry/TelemetryChannelRenderer.js');
    const { computeTelemetryChartPaths } = await import('../../src/components/replay/telemetry/telemetryChartPaths.js');
    const mockPaths = computeTelemetryChartPaths([mockPoint], [], 0, 0);

    const { rerender } = render(
      <TelemetryChannelRenderer
        channelId="ride-height"
        currentPoint={mockPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={mockPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/RIDE HEIGHT/i)).toBeInTheDocument();

    rerender(
      <TelemetryChannelRenderer
        channelId="wheel-speeds"
        currentPoint={mockPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={mockPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/WHEEL SPEEDS/i)).toBeInTheDocument();

    rerender(
      <TelemetryChannelRenderer
        channelId="tire-pressures"
        currentPoint={mockPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={mockPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/TIRE PRESSURES/i)).toBeInTheDocument();

    rerender(
      <TelemetryChannelRenderer
        channelId="tire-wear"
        currentPoint={mockPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={mockPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/TIRE WEAR/i)).toBeInTheDocument();

    rerender(
      <TelemetryChannelRenderer
        channelId="tire-temps"
        currentPoint={mockPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={mockPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/TIRE CARCASS TEMPS/i)).toBeInTheDocument();

    rerender(
      <TelemetryChannelRenderer
        channelId="brake-temps"
        currentPoint={mockPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={mockPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/BRAKE ROTOR TEMPS/i)).toBeInTheDocument();
  });

  it('renders WHEEL / TIRE badge in TelemetryPresetChannelRow for wheel category channels', async () => {
    const { TelemetryPresetChannelRow } = await import('../../src/components/replay/telemetry/TelemetryPresetChannelRow.js');
    const { AVAILABLE_TELEMETRY_CHANNELS } = await import('../../src/components/replay/telemetry/telemetryPresets.js');

    const rideHeightChannel = AVAILABLE_TELEMETRY_CHANNELS.find(c => c.id === 'ride-height')!;
    render(
      <TelemetryPresetChannelRow
        channel={rideHeightChannel}
        isActive={true}
        isFirst={false}
        isLast={false}
        onToggle={() => {}}
        onMove={() => {}}
      />
    );

    expect(screen.getByText(/WHEEL \/ TIRE/i)).toBeInTheDocument();
    expect(screen.getByText(rideHeightChannel.name)).toBeInTheDocument();
  });
});
