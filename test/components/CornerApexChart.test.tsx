import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CornerApexChart } from '../../src/components/replay/CornerApexChart';
import { CornerSegmentComparison } from '../../src/utils/replayComparison';
import { ReplayTrajectoryPoint } from '../../server/types';

describe('CornerApexChart', () => {
  const corner: CornerSegmentComparison = {
    type: 'corner',
    segmentIndex: 0,
    cornerNumber: 3,
    entryDistM: 0,
    minDistM: 20,
    exitDistM: 40,
    lengthM: 40,
    primaryEntrySpeedKmh: 180,
    baselineEntrySpeedKmh: 175,
    entrySpeedDeltaKmh: 5,
    primaryMinSpeedKmh: 85,
    baselineMinSpeedKmh: 90,
    minSpeedDeltaKmh: -5,
    primaryExitSpeedKmh: 150,
    baselineExitSpeedKmh: 145,
    exitSpeedDeltaKmh: 5,
    primaryBrakingDistM: 5,
    baselineBrakingDistM: 5,
    brakingPointDeltaM: 0,
    primaryThrottleOnDistM: 30,
    baselineThrottleOnDistM: 30,
    throttleOnDeltaM: 0,
    timeDeltaSec: -0.1,
  };

  function buildPoints(speeds: number[]): ReplayTrajectoryPoint[] {
    return speeds.map((speedKmh, i) => ({
      x: i * 10,
      y: 0,
      z: 0,
      rotY: 0,
      speedKmh,
      throttle: 50,
      brake: 0,
      timeSec: i * 0.5,
    }));
  }

  const primaryPoints = buildPoints([180, 150, 120, 85, 110, 150]);
  const primaryDists = primaryPoints.map((_, i) => i * 10);

  it('renders the corner number heading and entry/min/exit speed callouts', () => {
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    expect(screen.getByText(/Turn 3 Apex Chart/i)).toBeInTheDocument();
    expect(screen.getByText(/ENTRY 180/i)).toBeInTheDocument();
    expect(screen.getByText(/MIN 85/i)).toBeInTheDocument();
    expect(screen.getByText(/EXIT 150/i)).toBeInTheDocument();
  });

  it('does not render a close button when onClose is omitted', () => {
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    expect(screen.queryByLabelText(/Close corner detail/i)).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        onClose={onClose}
      />
    );

    screen.getByLabelText(/Close corner detail/i).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a dashed baseline path when baseline points are provided', () => {
    const baselinePoints = buildPoints([175, 145, 115, 90, 105, 145]);
    const baselineDists = baselinePoints.map((_, i) => i * 10);

    const { container } = render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        baselinePoints={baselinePoints}
        baselineDists={baselineDists}
      />
    );

    const chartSvg = Array.from(container.querySelectorAll('svg')).find(el => !el.classList.contains('lucide'));
    const paths = chartSvg?.querySelectorAll('path') ?? [];
    expect(paths.length).toBe(2);
    expect(paths[0].getAttribute('stroke')).toBe('#f59e0b');
  });

  it('renders only the primary path when no baseline is provided', () => {
    const { container } = render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    const chartSvg = Array.from(container.querySelectorAll('svg')).find(el => !el.classList.contains('lucide'));
    const paths = chartSvg?.querySelectorAll('path') ?? [];
    expect(paths.length).toBe(1);
    expect(paths[0].getAttribute('stroke')).toBe('#38bdf8');
  });
});
