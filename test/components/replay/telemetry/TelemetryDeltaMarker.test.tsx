import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryDeltaMarker, measureMarkerSpan } from '../../../../src/components/replay/telemetry/TelemetryDeltaMarker.js';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { PointComparison } from '../../../../src/utils/replayComparison.js';

const points = [0, 1, 2, 3].map(i => ({ x: 0, y: 0, z: i * 50, timeSec: i * 1.5 })) as ReplayTrajectoryPoint[];
const cumDists = [0, 50, 100, 150];
const comparisons = [0, 0.1, 0.25, 0.2].map(deltaTimeSec => ({ deltaTimeSec })) as PointComparison[];

describe('measureMarkerSpan', () => {
  it('measures in lap order whichever side the marker is on', () => {
    const span = measureMarkerSpan(points, cumDists, comparisons, 3, 1);
    expect(span.distanceM).toBe(100);
    expect(span.timeSec).toBeCloseTo(3);
    expect(span.deltaSec).toBeCloseTo(0.1);
    expect(span.baselineTimeSec).toBeCloseTo(2.9);
  });

  it('leaves the reference out without a baseline', () => {
    const span = measureMarkerSpan(points, cumDists, [], 0, 2);
    expect(span.deltaSec).toBeNull();
    expect(span.baselineTimeSec).toBeNull();
  });
});

describe('TelemetryDeltaMarker', () => {
  it('shows a lost delta and clears on the button', () => {
    const onClear = vi.fn();
    render(<TelemetryDeltaMarker span={{ distanceM: 100, timeSec: 3, baselineTimeSec: 2.75, deltaSec: 0.25 }}
      markerPct={20} offscreen={null} cursorPct={60} onClear={onClear} />);
    const readout = screen.getByTestId('telemetry-delta-readout');
    expect(screen.getByTestId('telemetry-delta-marker').contains(readout)).toBe(true);
    expect(readout.textContent).toContain('100 m');
    expect(readout.textContent).toContain('ref 2.750 s');
    expect(screen.getByText('+0.250').className).toContain('text-lmu-loss');
    fireEvent.click(screen.getByRole('button', { name: 'Clear marker' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('pins the readout to the edge the marker is zoomed past', () => {
    render(<TelemetryDeltaMarker span={{ distanceM: 100, timeSec: 3, baselineTimeSec: null, deltaSec: null }}
      markerPct={0} offscreen="left" cursorPct={60} onClear={vi.fn()} />);
    expect(screen.queryByTestId('telemetry-delta-marker')).toBeNull();
    const readout = screen.getByTestId('telemetry-delta-readout');
    expect(readout.className).toContain('left-1');
    expect(readout.textContent).toContain('◂A');
    expect(readout.textContent).toContain('100 m');
  });
});
