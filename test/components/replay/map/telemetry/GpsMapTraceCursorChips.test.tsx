import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsMapTraceCursorChips } from '../../../../../src/components/replay/map/telemetry/GpsMapTraceCursorChips.js';
import type { PointComparison } from '../../../../../src/utils/replayComparison.js';

const point = { x: 0, y: 0, z: 0, speedKmh: 191, timeSec: 10, throttle: 40, brake: 60 };
const comparison = {
  primary: point, deltaTimeSec: 0.123, deltaSpeedKmh: -16, deltaThrottle: 0, deltaBrake: 0, deltaSteer: 0,
  baseline: { timeSec: 9.9, speedKmh: 207, throttle: 0, brake: 80, steerYaw: 0, gear: 4, x: 0, y: 0, z: 0 },
} as PointComparison;

describe('GpsMapTraceCursorChips', () => {
  it('shows the value, the baseline and the difference at the cursor', () => {
    const { rerender } = render(<GpsMapTraceCursorChips channel="speed" point={point} comparison={comparison} cursorPct={40} />);
    expect(screen.getByTestId('trace-cursor-chips')).toHaveTextContent('191 km/h');
    expect(screen.getByTestId('trace-chip-baseline')).toHaveTextContent('B: 207-16');
    rerender(<GpsMapTraceCursorChips channel="pedals" point={point} comparison={comparison} cursorPct={40} />);
    expect(screen.getByTestId('trace-cursor-chips')).toHaveTextContent('THR 40%B: 0%BRK 60%B: 80%');
    rerender(<GpsMapTraceCursorChips channel="delta" point={point} comparison={comparison} cursorPct={40} />);
    expect(screen.getByTestId('trace-cursor-chips')).toHaveTextContent('Δt: +0.123s');
  });
});
