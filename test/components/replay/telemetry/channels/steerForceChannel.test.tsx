import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetrySteerForceChannel, formatSteerForce } from '../../../../../src/components/replay/telemetry/channels/inputs/TelemetrySteerForceChannel.js';
import { TelemetryUndersteerChannel } from '../../../../../src/components/replay/telemetry/channels/dynamics/TelemetryUndersteerChannel.js';
import {
  fittedSteerDegrees, formatSteer, steerTraceScale, steeringWheelDeg,
} from '../../../../../src/components/replay/telemetry/channels/inputs/steerDegrees.js';
import { TELEMETRY_COLORS } from '../../../../../src/utils/themeColors.js';

const lapPoint = { x: 0, y: 0, z: 0 };

describe('steering force chart', () => {
  it('reads the lap and the baseline in % of FFB and names the moment under the cursor', () => {
    const baseline = { timeSec: 0, speedKmh: 0, throttle: 0, brake: 0, steerYaw: 0, gear: 3, x: 0, y: 0, z: 0, driverForcePct: -12 };
    render(<TelemetrySteerForceChannel steerForcePath="M 0 50 L 1000 30" holdStillBands="M 10 0 L 20 0 L 20 100 L 10 100 Z" counterSteerBands=""
      hasSteerForce currentPoint={{ ...lapPoint, driverForcePct: 28.4, steerHoldStill: true }}
      currentComparison={{ primary: lapPoint, baseline, deltaTimeSec: 0, deltaSpeedKmh: 0, deltaThrottle: 0, deltaBrake: 0, deltaSteer: 0 }}
      isCursorInView cursorPct={40} />);
    expect(screen.getByText('STEER FORCE')).toBeInTheDocument();
    expect(screen.getByText('+28% L')).toBeInTheDocument();
    expect(screen.getByText('B: -12% R')).toBeInTheDocument();
    expect(screen.getByText('LIGHT HANDS')).toBeInTheDocument();
  });

  it('says a replay-only lap has no steering force', () => {
    render(<TelemetrySteerForceChannel steerForcePath="" holdStillBands="" counterSteerBands="" hasSteerForce={false} isCursorInView cursorPct={0} />);
    expect(screen.getByText('Needs DuckDB telemetry for this lap')).toBeInTheDocument();
    expect(formatSteerForce(undefined)).toBe('—');
    expect(formatSteerForce(0.4)).toBe('+0%');
  });
});

describe('balance chart fill', () => {
  it('fills understeer sky and oversteer amber and says so in the readout colour', () => {
    const { container } = render(<TelemetryUndersteerChannel understeerPath="M 0 50 L 1000 40" understeerArea="M 0 50 L 1000 40 L 1000 50 L 0 50 Z"
      oversteerArea="M 0 50 L 1000 60 L 1000 50 L 0 50 Z" currentPoint={{ ...lapPoint, understeerDeg: -1.5 }} isCursorInView cursorPct={0} />);
    const fills = [...container.querySelectorAll('path')].map(path => path.getAttribute('fill'));
    expect(fills).toContain(TELEMETRY_COLORS.understeer);
    expect(fills).toContain(TELEMETRY_COLORS.oversteer);
    expect(screen.getByText('-1.50° Oversteer (Loose)').className).toContain('text-lmu-warn');
  });
});

describe('steering degrees', () => {
  it('scales each lap by its own wheel range on one degree axis', () => {
    // 50 % of a 524° wheel is 131°; of a 440° wheel, 110°.
    expect(steeringWheelDeg(135, 524)).toBeCloseTo(131, 5);
    expect(steeringWheelDeg(135, 440)).toBeCloseTo(110, 5);
    expect(steeringWheelDeg(135, undefined)).toBeCloseTo(135, 5); // The default 540° wheel.
    expect(steerTraceScale('deg', 100, 150, 524)).toBeCloseTo(262 / 150, 5);
    expect(steerTraceScale('fit', 50, 150, 524)).toBe(2);
    expect(formatSteer('deg', -135, 440)).toBe('-110°');
    expect(formatSteer('fit', -135, 440)).toBe('-50%');
  });

  it('fits the degree axis to both laps, at least 30°', () => {
    const points = [{ ...lapPoint, steerYaw: 135 }];
    const baseline = { timeSec: 0, speedKmh: 0, throttle: 0, brake: 0, steerYaw: -200, gear: 3, x: 0, y: 0, z: 0 };
    const comparisons = [{ primary: points[0], baseline, deltaTimeSec: 0, deltaSpeedKmh: 0, deltaThrottle: 0, deltaBrake: 0, deltaSteer: 0 }];
    // Baseline: 200/270 of a 440° wheel's 220° half is 163°, plus a tenth, in 10° steps.
    expect(fittedSteerDegrees(points, comparisons, { lap: 524, baseline: 440 })).toBe(180);
    expect(fittedSteerDegrees([], [], {})).toBe(30);
  });
});
