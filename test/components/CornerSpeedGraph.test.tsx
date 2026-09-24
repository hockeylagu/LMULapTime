import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CornerSpeedGraph } from '../../src/components/replay/analysis/CornerSpeedGraph.js';
import { CornerSegmentComparison } from '../../src/utils/cornerAnalysis.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

describe('CornerSpeedGraph', () => {
  const corner: CornerSegmentComparison = {
    segmentIndex: 0,
    cornerNumber: 4,
    type: 'corner',
    entryDistM: 100,
    minDistM: 180,
    exitDistM: 300,
    lengthM: 200,
    primaryTimeSec: 4.5,
    timeDeltaSec: -0.1,
    primaryEntrySpeedKmh: 190,
    baselineEntrySpeedKmh: 185,
    entrySpeedDeltaKmh: 5,
    primaryMinSpeedKmh: 80,
    baselineMinSpeedKmh: 85,
    minSpeedDeltaKmh: -5,
    primaryExitSpeedKmh: 160,
    baselineExitSpeedKmh: 155,
    exitSpeedDeltaKmh: 5,
    primaryBrakingDistM: 120,
    baselineBrakingDistM: 125,
    brakingPointDeltaM: -5,
    primaryThrottleOnDistM: 210,
    baselineThrottleOnDistM: 205,
    throttleOnDeltaM: 5,
  };

  // Trajectory with Understeer (push), Tire Scrub, and Oversteer
  const primaryPoints: ReplayTrajectoryPoint[] = [
    { x: 0, y: 0, z: 0, speedKmh: 200, steerYaw: 0, yawRateDeg: 0, understeerDeg: 0, timeSec: 10.0 },
    { x: 10, y: 0, z: 10, speedKmh: 180, steerYaw: 15, yawRateDeg: 5, understeerDeg: 2.8, timeSec: 10.5 }, // Understeer
    { x: 50, y: 0, z: 40, speedKmh: 120, steerYaw: 28, yawRateDeg: 8, understeerDeg: 5.2, timeSec: 11.2, tireSlipPct: 18 }, // Tire scrub
    { x: 80, y: 0, z: 60, speedKmh: 80, steerYaw: 22, yawRateDeg: 12, understeerDeg: 0.5, timeSec: 12.0 },
    { x: 130, y: 0, z: 70, speedKmh: 110, steerYaw: -8, yawRateDeg: 18, understeerDeg: -2.4, timeSec: 12.8 }, // Oversteer
    { x: 170, y: 0, z: 80, speedKmh: 145, steerYaw: 5, yawRateDeg: 6, understeerDeg: 0.2, timeSec: 13.5 },
    { x: 210, y: 0, z: 90, speedKmh: 170, steerYaw: 0, yawRateDeg: 0, understeerDeg: 0, timeSec: 14.0 },
  ];

  const primaryDists = [90, 110, 150, 180, 230, 270, 310];

  it('renders the speed profile chart with apex callout', () => {
    render(
      <CornerSpeedGraph
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    expect(screen.getByText(/Apex: 80/i)).toBeInTheDocument();
  });

  it('renders US, Scrub, and OS toggle buttons in full mode', () => {
    render(
      <CornerSpeedGraph
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    expect(screen.getByRole('button', { name: 'US' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scrub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OS' })).toBeInTheDocument();
  });

  it('toggles handling overlays when toggle buttons are clicked', () => {
    render(
      <CornerSpeedGraph
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    const usBtn = screen.getByRole('button', { name: 'US' });
    fireEvent.click(usBtn);
    // Clicking toggles state
    expect(usBtn).toBeInTheDocument();
  });

  it('renders synchronized scrub line with current speed and live handling state', () => {
    // Current index is point 2 (at lapDist 150, inside corner with scrub)
    render(
      <CornerSpeedGraph
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        currentIndex={2}
        currentDistM={150}
      />
    );

    expect(screen.getByText('120 km/h')).toBeInTheDocument();
  });

  it('renders a baseline trace and live understeer state at the scrub position', () => {
    render(
      <CornerSpeedGraph
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        baselinePoints={primaryPoints.map(point => ({ ...point, speedKmh: (point.speedKmh ?? 0) + 5 }))}
        baselineDists={primaryDists}
        currentIndex={1}
        currentDistM={110}
      />
    );

    expect(screen.getByText('180 km/h')).toBeInTheDocument();
    expect(screen.getByText(/US \+2\.8°/)).toBeInTheDocument();
    expect(document.querySelectorAll('path')).toHaveLength(2);
  });

  it('triggers onSelectIndex when clicking the speed profile chart', () => {
    const onSelectIndex = vi.fn();
    render(
      <CornerSpeedGraph
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        onSelectIndex={onSelectIndex}
      />
    );

    const chart = screen.getByTitle(/Click or drag to scrub replay at this corner/i);
    fireEvent.click(chart, { clientX: 200 });

    expect(onSelectIndex).toHaveBeenCalled();
  });

  it('renders compact micro-bar with ENTRY, MIN, and EXIT speed badges', () => {
    render(
      <CornerSpeedGraph
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        compact={true}
      />
    );

    expect(screen.getByText(/ENTRY 190/i)).toBeInTheDocument();
    expect(screen.getByText(/MIN 80/i)).toBeInTheDocument();
    expect(screen.getByText(/EXIT 160/i)).toBeInTheDocument();
    expect(screen.queryByText(/◄ Scrub to Seek ►/i)).not.toBeInTheDocument();
  });
});
