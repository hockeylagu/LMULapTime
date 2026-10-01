import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetryAccelLatChannel } from '../../../../../src/components/replay/telemetry/channels/dynamics/TelemetryAccelLatChannel';
import { TelemetryAccelLonChannel } from '../../../../../src/components/replay/telemetry/channels/dynamics/TelemetryAccelLonChannel';
import { TelemetryAccelTotalChannel } from '../../../../../src/components/replay/telemetry/channels/dynamics/TelemetryAccelTotalChannel';
import { TelemetrySlipAngleChannel } from '../../../../../src/components/replay/telemetry/channels/dynamics/TelemetrySlipAngleChannel';
import { TelemetryUndersteerChannel } from '../../../../../src/components/replay/telemetry/channels/dynamics/TelemetryUndersteerChannel';
import { TelemetryYawRateChannel } from '../../../../../src/components/replay/telemetry/channels/dynamics/TelemetryYawRateChannel';
import type { PointComparison } from '../../../../../src/utils/replayComparison';
import type { ReplayTelemetryPoint } from '../../../../../server/core/types';

const point = (values: Partial<ReplayTelemetryPoint>) => values as ReplayTelemetryPoint;
const baseline = (values: Partial<ReplayTelemetryPoint>) => ({ baseline: values }) as unknown as PointComparison;
const cursor = { isCursorInView: false, cursorPct: 50 };

// Each computed dynamics channel, rendered with no trace yet.
const emptyChannels: Array<[string, string, () => React.ReactElement]> = [
  ['lateral G', 'LATERAL G', () => <TelemetryAccelLatChannel accelLatPath="" {...cursor} />],
  ['longitudinal G', 'LONGITUDINAL G', () => <TelemetryAccelLonChannel accelLonPath="" {...cursor} />],
  ['combined G', 'COMBINED G', () => <TelemetryAccelTotalChannel accelTotalPath="" {...cursor} />],
  ['slip angle', 'BODY SLIP ANGLE (BETA)', () => <TelemetrySlipAngleChannel slipAnglePath="" {...cursor} />],
  ['handling balance', 'HANDLING BALANCE', () => <TelemetryUndersteerChannel understeerPath="" {...cursor} />],
  ['yaw rate', 'YAW RATE', () => <TelemetryYawRateChannel yawRatePath="" {...cursor} />],
];

describe('computed dynamics channels', () => {
  it.each(emptyChannels)('%s waits for telemetry and is marked computed', (_name, title, renderChannel) => {
    render(renderChannel());
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText('COMPUTED')).toBeInTheDocument();
    expect(screen.getByText('Awaiting telemetry')).toBeInTheDocument();
  });

  it('G channels are not marked computed when the values come from DuckDB', () => {
    render(<TelemetryAccelLatChannel accelLatPath="" source="duckdb" {...cursor} />);
    expect(screen.getByText('LATERAL G')).toBeInTheDocument();
    expect(screen.queryByText('COMPUTED')).not.toBeInTheDocument();
  });
});

describe('TelemetrySlipAngleChannel', () => {
  it('shows a positive slip angle and its baseline', () => {
    render(
      <TelemetrySlipAngleChannel
        slipAnglePath="M 0 50 L 1000 40"
        baselineSlipAnglePath="M 0 50 L 1000 45"
        currentPoint={point({ slipAngleDeg: 2.45 })}
        currentComparison={baseline({ slipAngleDeg: 1.85 })}
        isCursorInView={true}
        cursorPct={10}
      />
    );
    expect(screen.getAllByText('+2.45°').length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('B: 1.85°')).toBeInTheDocument();
  });

  it('shows a negative slip angle with the cursor near the right edge', () => {
    render(<TelemetrySlipAngleChannel slipAnglePath="M 0 50 L 1000 60" currentPoint={point({ slipAngleDeg: -3.2 })} isCursorInView={true} cursorPct={90} />);
    expect(screen.getAllByText('-3.20°').length).toBeGreaterThanOrEqual(1);
  });

  it('shows 0.00° when there is a trace but no point under the cursor', () => {
    render(<TelemetrySlipAngleChannel slipAnglePath="M 0 50 L 1000 50" isCursorInView={true} cursorPct={50} />);
    expect(screen.getAllByText('0.00°').length).toBeGreaterThanOrEqual(1);
  });
});

describe('TelemetryUndersteerChannel', () => {
  it('reads within ±0.2° as neutral', () => {
    render(<TelemetryUndersteerChannel understeerPath="M 0 50 L 1000 50" currentPoint={point({ understeerDeg: 0.1 })} isCursorInView={true} cursorPct={50} />);
    expect(screen.getAllByText('0.00° Neutral').length).toBeGreaterThanOrEqual(1);
  });

  it('reads a positive angle as understeer, with a positive baseline', () => {
    render(
      <TelemetryUndersteerChannel
        understeerPath="M 0 50 L 1000 40"
        baselineUndersteerPath="M 0 50 L 1000 45"
        currentPoint={point({ understeerDeg: 2.3 })}
        currentComparison={baseline({ understeerDeg: 1.5 })}
        isCursorInView={true}
        cursorPct={10}
      />
    );
    expect(screen.getAllByText('+2.30° Understeer (Push)').length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('B: +1.50°')).toBeInTheDocument();
  });

  it('reads a negative angle as oversteer, with a negative baseline', () => {
    render(
      <TelemetryUndersteerChannel
        understeerPath="M 0 50 L 1000 60"
        currentPoint={point({ understeerDeg: -2.7 })}
        currentComparison={baseline({ understeerDeg: -1.2 })}
        isCursorInView={true}
        cursorPct={90}
      />
    );
    expect(screen.getAllByText('-2.70° Oversteer (Loose)').length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('B: -1.20°')).toBeInTheDocument();
  });
});

describe('TelemetryYawRateChannel', () => {
  it('shows a positive yaw rate as rotating right, with its baseline', () => {
    render(
      <TelemetryYawRateChannel
        yawRatePath="M 0 50 L 1000 40"
        baselineYawRatePath="M 0 50 L 1000 45"
        currentPoint={point({ yawRateDeg: 35.6 })}
        currentComparison={baseline({ yawRateDeg: 15.2 })}
        isCursorInView={true}
        cursorPct={10}
      />
    );
    expect(screen.getAllByText('+35.6°/s R').length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('B: +15.2°/s R')).toBeInTheDocument();
  });

  it('shows a negative yaw rate as rotating left', () => {
    render(<TelemetryYawRateChannel yawRatePath="M 0 50 L 1000 60" currentPoint={point({ yawRateDeg: -22.4 })} isCursorInView={true} cursorPct={90} />);
    expect(screen.getAllByText('-22.4°/s L').length).toBeGreaterThanOrEqual(1);
  });

  it('gives no direction to a rate close to zero', () => {
    render(<TelemetryYawRateChannel yawRatePath="M 0 50 L 1000 50" currentPoint={point({ yawRateDeg: 0.2 })} isCursorInView={true} cursorPct={50} />);
    expect(screen.getByText('+0.2°/s')).toBeInTheDocument();
  });
});
