import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CornerSpeedTable } from '../../../../src/components/replay/index.js';
import { LapSegmentComparison } from '../../../../src/utils/cornerAnalysis.js';

describe('CornerSpeedTable', () => {
  const cornerSegment: LapSegmentComparison = {
    type: 'corner',
    segmentIndex: 0,
    cornerNumber: 1,
    entryDistM: 30,
    minDistM: 50,
    exitDistM: 70,
    lengthM: 40,
    primaryEntrySpeedKmh: 180,
    baselineEntrySpeedKmh: 190,
    entrySpeedDeltaKmh: -10,
    primaryMinSpeedKmh: 90,
    baselineMinSpeedKmh: 100,
    minSpeedDeltaKmh: -10,
    primaryExitSpeedKmh: 160,
    baselineExitSpeedKmh: 150,
    exitSpeedDeltaKmh: 10,
    primaryBrakingDistM: 35,
    baselineBrakingDistM: 32,
    brakingPointDeltaM: 3,
    primaryThrottleOnDistM: 60,
    baselineThrottleOnDistM: 65,
    throttleOnDeltaM: -5,
    primaryTimeSec: 0.85,
    timeDeltaSec: -0.2,
  };

  const straightSegment: LapSegmentComparison = {
    type: 'straight',
    segmentIndex: 1,
    entryDistM: 70,
    exitDistM: 200,
    lengthM: 130,
    primaryTopSpeedKmh: 280,
    baselineTopSpeedKmh: 275,
    topSpeedDeltaKmh: 5,
    primaryExitSpeedKmh: 280,
    baselineExitSpeedKmh: 275,
    exitSpeedDeltaKmh: 5,
    primaryTimeSec: 0.5,
    timeDeltaSec: 0.1,
  };

  it('keeps the corner list unscrolled above selected corner data', () => {
    const { container } = render(
      <CornerSpeedTable
        segments={[cornerSegment, straightSegment]}
        selectedCornerChart={<div>Selected corner data</div>}
      />
    );

    const tableContainer = container.querySelector('table')?.parentElement;
    expect(tableContainer).toHaveClass('shrink-0');
    expect(tableContainer).not.toHaveClass('overflow-y-auto');
    expect(screen.getByText('Selected corner data')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no segments', () => {
    render(<CornerSpeedTable segments={[]} />);
    expect(screen.getByText(/Not enough distinct braking\/apex events/i)).toBeInTheDocument();
  });

  it('renders corner and straight rows with speeds, deltas, and the whole-lap total', () => {
    render(<CornerSpeedTable segments={[cornerSegment, straightSegment]} />);

    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText(/Straight \(130m\)/i)).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument(); // primary min speed
    expect(screen.getByText('280')).toBeInTheDocument(); // straight top speed
    // Whole lap = -0.2 + 0.1 = -0.100s
    expect(screen.getByText(/Whole lap: -0\.100s/i)).toBeInTheDocument();
  });

  it('clicking a corner row selects its apex distance and reports the corner number', async () => {
    const user = userEvent.setup();
    const onSelectDistance = vi.fn();
    const onSelectCorner = vi.fn();
    render(
      <CornerSpeedTable
        segments={[cornerSegment, straightSegment]}
        onSelectDistance={onSelectDistance}
        onSelectCorner={onSelectCorner}
      />
    );

    await user.click(screen.getByText('T1'));

    expect(onSelectDistance).toHaveBeenCalledWith(50);
    expect(onSelectCorner).toHaveBeenCalledWith(1);
  });

  it('clicking a straight row selects its midpoint distance and does not report a corner', async () => {
    const user = userEvent.setup();
    const onSelectDistance = vi.fn();
    const onSelectCorner = vi.fn();
    render(
      <CornerSpeedTable
        segments={[cornerSegment, straightSegment]}
        onSelectDistance={onSelectDistance}
        onSelectCorner={onSelectCorner}
      />
    );

    await user.click(screen.getByText(/Straight \(130m\)/i));

    expect(onSelectDistance).toHaveBeenCalledWith(135); // round((70+200)/2)
    expect(onSelectCorner).not.toHaveBeenCalled();
  });

  it('highlights the currently selected corner row', () => {
    render(
      <CornerSpeedTable
        segments={[cornerSegment, straightSegment]}
        selectedCornerNumber={1}
      />
    );

    const row = screen.getByText('T1').closest('tr');
    expect(row?.className).toContain('bg-lmu-accent/15');
  });

  it('shows absolute entry/min/exit speeds and brake/throttle points (no deltas) in self-analysis mode', () => {
    render(
      <CornerSpeedTable
        segments={[cornerSegment, straightSegment]}
        selfAnalysis
        primaryLabel="Lap 3"
      />
    );

    expect(screen.getByText('Lap 3')).toBeInTheDocument();
    expect(screen.queryByText(/vs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Whole lap:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/-10/)).not.toBeInTheDocument(); // no delta annotations
    expect(screen.getByText('15m')).toBeInTheDocument(); // braking point, meters before apex
    expect(screen.getByText('10m')).toBeInTheDocument(); // throttle-on point, meters after apex
    expect(screen.getByText('0.850s')).toBeInTheDocument(); // absolute corner duration in self-analysis
    expect(screen.getByText('0.500s')).toBeInTheDocument(); // absolute straight duration
  });

  it('only lists the most egregious losses in the quick-jump corner shortlist', () => {
    const tinyLoss = { ...cornerSegment, segmentIndex: 0, cornerNumber: 1, timeDeltaSec: 0.03 };
    const mediumLoss = { ...cornerSegment, segmentIndex: 1, cornerNumber: 2, timeDeltaSec: 0.12 };
    const hugeLoss = { ...cornerSegment, segmentIndex: 2, cornerNumber: 3, timeDeltaSec: 0.21 };
    const trailingStraight = { ...straightSegment, segmentIndex: 3 };

    render(<CornerSpeedTable segments={[tinyLoss, mediumLoss, hugeLoss, trailingStraight]} />);

    expect(screen.queryByText(/T1 \+0.030s/i)).not.toBeInTheDocument();
    expect(screen.getByText(/T2 \+0.120s/i)).toBeInTheDocument();
    expect(screen.getByText(/T3 \+0.210s/i)).toBeInTheDocument();
  });

  it('switches to Technique view mode and displays measured corner observations', async () => {
    const user = userEvent.setup();
    const techniqueCorner: LapSegmentComparison = {
      ...cornerSegment,
      cornerAngleDeg: 88,
      turnDirection: 'right',
      primaryTurnInDistM: 38,
      primaryRotationAtThrottlePct: 84,
      trailBrakeDistM: 12,
      phaseTiming: {
        rotation: { startDistM: 40, endDistM: 50, timeDeltaSec: 0.091 },
        exit: { startDistM: 50, endDistM: 70, timeDeltaSec: 0.109 },
      },
    };

    render(<CornerSpeedTable segments={[techniqueCorner, straightSegment]} />);

    // In speed mode by default:
    expect(screen.getByText('Entry')).toBeInTheDocument();

    // Click Technique button:
    await user.click(screen.getByRole('button', { name: /Technique/i }));

    expect(screen.getByText('Arc / Dir')).toBeInTheDocument();
    expect(screen.getByText('Head @ 15%')).toBeInTheDocument();
    expect(screen.getByText('↱ 88°')).toBeInTheDocument();
    expect(screen.getAllByText('12m')).toHaveLength(2); // Turn-in 12m, Trail-brake 12m
    expect(screen.getByText('84%')).toBeInTheDocument();
    expect(screen.getByText('Head @ 15%')).toBeInTheDocument();
    expect(screen.getByText('+0.091s')).toBeInTheDocument();
  });

  it('renders selectedCornerChart flowing naturally below table inside scrollable container', () => {
    render(
      <CornerSpeedTable
        segments={[cornerSegment, straightSegment]}
        selectedCornerNumber={1}
        selectedCornerChart={<div data-testid="test-apex-chart">Turn 1 Apex Details</div>}
      />
    );

    expect(screen.getByTestId('test-apex-chart')).toBeInTheDocument();
    expect(screen.getByText('Turn 1 Apex Details')).toBeInTheDocument();
  });
});
