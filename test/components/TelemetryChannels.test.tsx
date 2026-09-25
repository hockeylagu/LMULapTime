import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
import { ReplayTrajectoryPoint } from '../../server/core/types.js';
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
    const hasYellowStroke = Array.from(paths).some((p) => p.getAttribute('stroke') === '#F59E0B');
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

  it('renders understeer and oversteer overlay and toggles overlay visibility', () => {
    // Generate synthetic lap with an understeer section
    const testPoints: ReplayTrajectoryPoint[] = [];
    for (let i = 0; i < 20; i++) {
      testPoints.push({
        x: 0,
        y: 0,
        z: i * 20,
        speedKmh: 130,
        timeSec: i * 0.1,
        steerYaw: 20,
        yawRateDeg: 8,
        accelLatG: 1.2,
        understeerDeg: i >= 5 && i <= 12 ? 5.0 : 0, // US event
      });
    }
    const cumDists = testPoints.map((_, i) => i * 20);

    const { container } = render(
      <TelemetrySteerChannel
        steerPath="M 0 50 L 1000 50"
        currentPoint={testPoints[8]}
        isCursorInView={true}
        cursorPct={40}
        points={testPoints}
        cumDists={cumDists}
        viewStart={0}
        viewEnd={19}
      />
    );

    // Toggle button is present
    const toggleBtn = screen.getByTitle(/Understeer \/ Oversteer Overlay/i);
    expect(toggleBtn).toBeInTheDocument();

    // With overlay enabled by default, US badge is rendered
    expect(screen.getAllByText(/US/i).length).toBeGreaterThanOrEqual(1);

    // SVG rect with understeer fill is present
    const rects = container.querySelectorAll('rect');
    const hasUSFill = Array.from(rects).some((r) => r.getAttribute('fill')?.includes('56, 189, 248'));
    expect(hasUSFill).toBe(true);

    // Click toggle button to disable overlay
    fireEvent.click(toggleBtn);

    // After disabling, SVG rects for US/OS should be hidden
    const updatedRects = container.querySelectorAll('rect');
    const hasUSFillAfter = Array.from(updatedRects).some((r) => r.getAttribute('fill')?.includes('56, 189, 248'));
    expect(hasUSFillAfter).toBe(false);

    // Click again to re-enable
    fireEvent.click(toggleBtn);
    const reenabledRects = container.querySelectorAll('rect');
    expect(Array.from(reenabledRects).some((r) => r.getAttribute('fill')?.includes('56, 189, 248'))).toBe(true);
  });

  it('renders tire scrub (SCRUB) overlay with rose/red shaded regions and badges', () => {
    // Generate synthetic lap with excessive tire scrub (steering gain collapse)
    const testPoints: ReplayTrajectoryPoint[] = [];
    for (let i = 0; i < 20; i++) {
      testPoints.push({
        x: 0,
        y: 0,
        z: i * 20,
        speedKmh: 110,
        timeSec: i * 0.1,
        steerYaw: i >= 5 && i <= 12 ? 15 + (i - 5) * 4 : 5, // steer increases 15° to 43°
        yawRateDeg: i >= 5 && i <= 12 ? 18 - (i - 5) * 1.5 : 5, // yaw rate collapses
        accelLatG: 1.1,
        understeerDeg: i >= 5 && i <= 12 ? 5.5 : 0, // severe push
      });
    }
    const cumDists = testPoints.map((_, i) => i * 20);

    const { container } = render(
      <TelemetrySteerChannel
        steerPath="M 0 50 L 1000 50"
        currentPoint={testPoints[8]}
        isCursorInView={true}
        cursorPct={40}
        points={testPoints}
        cumDists={cumDists}
        viewStart={0}
        viewEnd={19}
      />
    );

    // SCRUB badge is rendered
    expect(screen.getAllByText(/SCRUB/i).length).toBeGreaterThanOrEqual(1);

    // SVG rect with rose tire scrub fill (244, 63, 94) is present
    let rects = container.querySelectorAll('rect');
    let hasScrubFill = Array.from(rects).some((r) => r.getAttribute('fill')?.includes('244, 63, 94'));
    expect(hasScrubFill).toBe(true);

    // Click + SCRUB button to toggle scrub mode off (switching to pure US / OS mode)
    const scrubToggleBtn = screen.getByTitle(/Remove Tire Scrub Zones/i);
    fireEvent.click(scrubToggleBtn);

    // Scrub fill should now be gone, converted to clean sky blue understeer
    rects = container.querySelectorAll('rect');
    hasScrubFill = Array.from(rects).some((r) => r.getAttribute('fill')?.includes('244, 63, 94'));
    expect(hasScrubFill).toBe(false);
    const hasUSFill = Array.from(rects).some((r) => r.getAttribute('fill')?.includes('56, 189, 248'));
    expect(hasUSFill).toBe(true);

    // Click + SCRUB again to restore scrub zones
    const addScrubBtn = screen.getByTitle(/Add Tire Scrub Zones/i);
    fireEvent.click(addScrubBtn);
    rects = container.querySelectorAll('rect');
    hasScrubFill = Array.from(rects).some((r) => r.getAttribute('fill')?.includes('244, 63, 94'));
    expect(hasScrubFill).toBe(true);
  });

  it('allows tire scrub overlay to be enabled independently without US / OS', () => {
    const testPoints: ReplayTrajectoryPoint[] = [];
    for (let i = 0; i < 20; i++) {
      testPoints.push({
        x: 0,
        y: 0,
        z: i * 20,
        speedKmh: 110,
        timeSec: i * 0.1,
        steerYaw: i >= 5 && i <= 12 ? 15 + (i - 5) * 4 : 5,
        yawRateDeg: i >= 5 && i <= 12 ? 18 - (i - 5) * 1.5 : 5,
        accelLatG: 1.1,
        understeerDeg: i >= 5 && i <= 12 ? 5.5 : 0,
      });
    }
    const cumDists = testPoints.map((_, i) => i * 20);

    const { container } = render(
      <TelemetrySteerChannel
        steerPath="M 0 50 L 1000 50"
        currentPoint={testPoints[8]}
        isCursorInView={true}
        cursorPct={40}
        points={testPoints}
        cumDists={cumDists}
        viewStart={0}
        viewEnd={19}
      />
    );

    const balanceToggleBtn = screen.getByTitle(/Understeer \/ Oversteer Overlay/i);
    const scrubToggleBtn = screen.getByRole('button', { name: /Tire Push Overlay/i });

    // Both start enabled
    expect(screen.getAllByText(/SCRUB/i).length).toBeGreaterThanOrEqual(1);

    // Disable US / OS balance overlay while leaving SCRUB enabled
    fireEvent.click(balanceToggleBtn);

    // Rose scrub rects should still exist!
    let rects = container.querySelectorAll('rect');
    const hasScrubFill = Array.from(rects).some((r) => r.getAttribute('fill')?.includes('244, 63, 94'));
    expect(hasScrubFill).toBe(true);

    // Sky blue normal US rects should NOT exist
    const hasUSFill = Array.from(rects).some((r) => r.getAttribute('fill')?.includes('56, 189, 248'));
    expect(hasUSFill).toBe(false);

    // Top badge still displays SCRUB
    expect(screen.getAllByText(/SCRUB/i).length).toBeGreaterThanOrEqual(1);

    // Disable scrub as well -> all rects hidden
    fireEvent.click(scrubToggleBtn);
    rects = container.querySelectorAll('rect');
    expect(Array.from(rects).some((r) => r.getAttribute('fill')?.includes('244, 63, 94'))).toBe(false);

    // Re-enable SCRUB only
    fireEvent.click(scrubToggleBtn);
    rects = container.querySelectorAll('rect');
    expect(Array.from(rects).some((r) => r.getAttribute('fill')?.includes('244, 63, 94'))).toBe(true);
    expect(Array.from(rects).some((r) => r.getAttribute('fill')?.includes('56, 189, 248'))).toBe(false);
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
    const hasPurpleStroke = Array.from(paths).some((p) => p.getAttribute('stroke')?.toUpperCase() === '#C084FC');
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

  it('renders ENERGY / FUEL badge in TelemetryPresetChannelRow for energy category channels', async () => {
    const { TelemetryPresetChannelRow } = await import('../../src/components/replay/telemetry/TelemetryPresetChannelRow.js');
    const { AVAILABLE_TELEMETRY_CHANNELS, DEFAULT_TELEMETRY_PRESETS } = await import('../../src/components/replay/telemetry/telemetryPresets.js');

    const fuelChannel = AVAILABLE_TELEMETRY_CHANNELS.find(c => c.id === 'fuel')!;
    render(
      <TelemetryPresetChannelRow
        channel={fuelChannel}
        isActive={true}
        isFirst={false}
        isLast={false}
        onToggle={() => {}}
        onMove={() => {}}
      />
    );

    expect(screen.getByText(/ENERGY \/ FUEL/i)).toBeInTheDocument();
    expect(screen.getByText(fuelChannel.name)).toBeInTheDocument();

    const energyPreset = DEFAULT_TELEMETRY_PRESETS.find(p => p.id === 'energy-fuel');
    expect(energyPreset).toBeDefined();
    expect(energyPreset?.channels).toContain('fuel');
    expect(energyPreset?.channels).toContain('virtual-energy');
    expect(energyPreset?.channels).toContain('soc');
    expect(energyPreset?.channels).toContain('regen-rate');
  });

  it('renders TelemetryFuelChannel, TelemetryVirtualEnergyChannel, TelemetrySocChannel, TelemetryRegenRateChannel via TelemetryChannelRenderer', () => {
    const energyPoint: ReplayTrajectoryPoint = {
      ...mockPoint,
      fuel: 62.4,
      virtualEnergy: 78.5,
      soc: 85.0,
      regenRate: 180.5,
    };
    const energyPaths = computeTelemetryChartPaths([energyPoint], [], 0, 0);

    const { rerender } = render(
      <TelemetryChannelRenderer
        channelId="fuel"
        currentPoint={energyPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={energyPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/FUEL LEVEL/i)).toBeInTheDocument();
    expect(screen.getAllByText(/62.4/i).length).toBeGreaterThanOrEqual(1);

    rerender(
      <TelemetryChannelRenderer
        channelId="virtual-energy"
        currentPoint={energyPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={energyPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/VIRTUAL ENERGY/i)).toBeInTheDocument();
    expect(screen.getAllByText(/78.5/i).length).toBeGreaterThanOrEqual(1);

    rerender(
      <TelemetryChannelRenderer
        channelId="soc"
        currentPoint={energyPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={energyPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/BATTERY SOC/i)).toBeInTheDocument();
    expect(screen.getAllByText(/85.0/i).length).toBeGreaterThanOrEqual(1);

    rerender(
      <TelemetryChannelRenderer
        channelId="regen-rate"
        currentPoint={energyPoint}
        currentComparison={null}
        pointComparisons={[]}
        paths={energyPaths}
        isCursorInView={true}
        cursorPct={50}
      />
    );
    expect(screen.getByText(/REGEN RATE/i)).toBeInTheDocument();
    expect(screen.getAllByText(/180.5/i).length).toBeGreaterThanOrEqual(1);
  });
});
