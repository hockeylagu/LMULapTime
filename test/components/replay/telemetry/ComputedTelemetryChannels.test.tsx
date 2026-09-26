import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TelemetryAccelLatChannel,
  TelemetryAccelLonChannel,
  TelemetryAccelTotalChannel,
  TelemetrySlipAngleChannel,
  TelemetryUndersteerChannel,
  TelemetryTireSlipChannel,
  TelemetryYawRateChannel,
} from '../../../../src/components/replay/telemetry/index.js';
import { TelemetryPresetChannelRow } from '../../../../src/components/replay/telemetry/presets/TelemetryPresetChannelRow.js';
import { AVAILABLE_TELEMETRY_CHANNELS } from '../../../../src/components/replay/telemetry/presets/telemetryPresets.js';
import { ReplayTelemetryPoint } from '../../../../server/core/types.js';

const mockPoint: ReplayTelemetryPoint = {
  x: 100,
  y: 10,
  z: 200,
  speedKmh: 180,
  throttle: 80,
  brake: 0,
  steerYaw: 15,
  accelLatG: 2.15,
  accelLonG: -1.25,
  accelTotalG: 2.49,
  slipAngleDeg: 3.45,
  understeerDeg: 2.10,
  tireSlipPct: 65,
  yawRateDeg: 32.5,
  wheelLockActive: false,
};

describe('Computed Telemetry UI Channels', () => {
  it('renders TelemetryAccelLatChannel with computed badge and live readout', () => {
    render(
      <TelemetryAccelLatChannel
        accelLatPath="M 0 50 L 1000 30"
        baselineAccelLatPath="M 0 50 L 1000 35"
        currentPoint={mockPoint}
        currentComparison={{
          primary: mockPoint,
          baseline: {
            timeSec: 10,
            speedKmh: 175,
            throttle: 75,
            brake: 0,
            steerYaw: 12,
            gear: 4,
            x: 100,
            y: 10,
            z: 200,
            accelLatG: 1.95,
          },
          deltaTimeSec: 0.2,
          deltaSpeedKmh: 5,
          deltaThrottle: 5,
          deltaBrake: 0,
          deltaSteer: 3,
        }}
        isCursorInView={true}
        cursorPct={50}
      />
    );

    expect(screen.getByText('LATERAL G')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getAllByText('+2.15 G R').length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryAccelLonChannel with braking / power indicator', () => {
    render(
      <TelemetryAccelLonChannel
        accelLonPath="M 0 50 L 1000 70"
        currentPoint={mockPoint}
        isCursorInView={true}
        cursorPct={40}
      />
    );

    expect(screen.getByText('LONGITUDINAL G')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getAllByText('-1.25 G Braking').length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryAccelTotalChannel with resultant grip readout', () => {
    render(
      <TelemetryAccelTotalChannel
        accelTotalPath="M 0 95 L 1000 30"
        accelTotalArea="M 0 95 L 1000 30 L 1000 95 Z"
        currentPoint={mockPoint}
        isCursorInView={false}
        cursorPct={0}
      />
    );

    expect(screen.getByText('COMBINED G')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getAllByText('2.49 G Resultant').length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetrySlipAngleChannel with beta attitude angle', () => {
    render(
      <TelemetrySlipAngleChannel
        slipAnglePath="M 0 50 L 1000 35"
        currentPoint={mockPoint}
        isCursorInView={false}
        cursorPct={0}
      />
    );

    expect(screen.getByText('BODY SLIP ANGLE (BETA)')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getAllByText('+3.45°').length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryUndersteerChannel with handling push balance', () => {
    render(
      <TelemetryUndersteerChannel
        understeerPath="M 0 50 L 1000 40"
        currentPoint={mockPoint}
        isCursorInView={false}
        cursorPct={0}
      />
    );

    expect(screen.getByText('HANDLING BALANCE')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getAllByText('+2.10° Understeer (Push)').length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryTireSlipChannel with LOCKUP warning on non-ABS lockup', () => {
    const lockedPoint: ReplayTelemetryPoint = {
      ...mockPoint,
      brake: 90,
      tireSlipPct: 94,
      wheelLockActive: true,
      absActive: false,
    };

    render(
      <TelemetryTireSlipChannel
        tireSlipPath="M 0 95 L 1000 15"
        currentPoint={lockedPoint}
        isCursorInView={true}
        cursorPct={60}
      />
    );

    expect(screen.getByText('TIRE SLIP & LOCKUP')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getByText('LOCKUP')).toBeInTheDocument();
    expect(screen.getAllByText('94% Saturation').length).toBeGreaterThanOrEqual(1);
  });

  it('renders TelemetryYawRateChannel with rotation agility readout', () => {
    render(
      <TelemetryYawRateChannel
        yawRatePath="M 0 50 L 1000 35"
        currentPoint={mockPoint}
        isCursorInView={false}
        cursorPct={0}
      />
    );

    expect(screen.getByText('YAW RATE')).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getByText('+32.5°/s R')).toBeInTheDocument();
  });

  it('renders TelemetryPresetChannelRow showing COMPUTED for calculated channels and DIRECT for native', () => {
    const computedChannel = AVAILABLE_TELEMETRY_CHANNELS.find(c => c.id === 'accel-lat')!;
    const directChannel = AVAILABLE_TELEMETRY_CHANNELS.find(c => c.id === 'speed')!;

    const { rerender } = render(
      <TelemetryPresetChannelRow
        channel={computedChannel}
        isActive={true}
        isFirst={false}
        isLast={false}
        onToggle={() => {}}
        onMove={() => {}}
      />
    );
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();

    rerender(
      <TelemetryPresetChannelRow
        channel={directChannel}
        isActive={true}
        isFirst={false}
        isLast={false}
        onToggle={() => {}}
        onMove={() => {}}
      />
    );
    expect(screen.getByText('DIRECT')).toBeInTheDocument();
  });
});
