import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplayMapContainer } from '../../src/components/replay/index.js';
import { ReplayTrajectoryData } from '../../server/types';
import { CornerSegmentComparison } from '../../src/utils/cornerAnalysis';

describe('ReplayMapContainer', () => {
  const trajectory: ReplayTrajectoryData = {
    replayName: 'Test_Replay.vcr',
    pointsCount: 3,
    points: [
      { x: 0, y: 0, z: 0, rotY: 0, speedKmh: 180, throttle: 100, brake: 0, timeSec: 0 },
      { x: 10, y: 0, z: 0, rotY: 0, speedKmh: 90, throttle: 0, brake: 80, timeSec: 0.5 },
      { x: 20, y: 0, z: 0, rotY: 0, speedKmh: 160, throttle: 100, brake: 0, timeSec: 1 },
    ],
    bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 0, spanX: 20, spanZ: 0 },
  };

  const corners: CornerSegmentComparison[] = [
    {
      type: 'corner',
      segmentIndex: 0,
      cornerNumber: 1,
      entryDistM: 0,
      minDistM: 10,
      exitDistM: 20,
      lengthM: 20,
      primaryTimeSec: 1,
      primaryEntrySpeedKmh: 180,
      baselineEntrySpeedKmh: 180,
      entrySpeedDeltaKmh: 0,
      primaryMinSpeedKmh: 90,
      baselineMinSpeedKmh: 90,
      minSpeedDeltaKmh: 0,
      primaryExitSpeedKmh: 160,
      baselineExitSpeedKmh: 160,
      exitSpeedDeltaKmh: 0,
      primaryBrakingDistM: null,
      baselineBrakingDistM: null,
      brakingPointDeltaM: null,
      primaryThrottleOnDistM: null,
      baselineThrottleOnDistM: null,
      throttleOnDeltaM: null,
      timeDeltaSec: 0,
    },
  ];

  const mockTrackGeometry = {
    layoutKey: 'monza_gp',
    circuitId: 'monza',
    layoutId: 'gp',
    trackVenue: 'Autodromo Nazionale Monza',
    trackCourse: 'Autodromo Nazionale Monza',
    lengthM: 5787,
    bounds: { minX: 80, maxX: 220, minZ: 180, maxZ: 260, spanX: 140, spanZ: 80 },
    leftBoundary: [
      [90, 190],
      [140, 210],
    ] as Array<[number, number]>,
    rightBoundary: [
      [110, 210],
      [160, 230],
    ] as Array<[number, number]>,
    centerline: [
      [100, 200],
      [150, 220],
      [200, 240],
    ] as Array<[number, number]>,
  };

  const baseProps = {
    trajectory,
    currentIndex: 0,
    onSelectIndex: vi.fn(),
    colorBy: 'speed' as const,
    isCompareMode: false,
    trackGeometry: mockTrackGeometry,
  };

  it('does not render an apex chart when no corner is selected', () => {
    render(<ReplayMapContainer {...baseProps} corners={corners} selectedCornerNumber={null} />);
    expect(screen.queryByText(/Apex Chart/i)).not.toBeInTheDocument();
  });

  it('renders the apex chart for the selected corner', () => {
    render(<ReplayMapContainer {...baseProps} corners={corners} selectedCornerNumber={1} />);
    expect(screen.getByText(/Turn 1 Apex Chart/i)).toBeInTheDocument();
  });

  it('closing the apex chart deselects the corner', () => {
    const onSelectCornerNumber = vi.fn();
    render(
      <ReplayMapContainer
        {...baseProps}
        corners={corners}
        selectedCornerNumber={1}
        onSelectCornerNumber={onSelectCornerNumber}
      />
    );

    screen.getByLabelText(/Close corner detail/i).click();
    expect(onSelectCornerNumber).toHaveBeenCalledWith(null);
  });

  it('renders the apex chart when a corner is selected in the single pane layout', () => {
    render(
      <ReplayMapContainer {...baseProps} corners={corners} selectedCornerNumber={1} />
    );
    expect(screen.getByText(/Turn 1 Apex Chart/i)).toBeInTheDocument();
    expect(screen.getByTestId('gps-circuit-minimap')).toBeInTheDocument();
  });

  it('renders the pedal points button on top near the heatmap selector when corners exist', () => {
    render(<ReplayMapContainer {...baseProps} corners={corners} />);
    const pedalBtn = screen.getByRole('button', { name: /Pedal Points/i });
    expect(pedalBtn).toBeInTheDocument();
  });

  it('toggles pedal points state when clicked', () => {
    render(<ReplayMapContainer {...baseProps} corners={corners} />);
    const pedalBtn = screen.getByRole('button', { name: /Pedal Points/i });
    expect(pedalBtn).toHaveAttribute('title', 'Show brake/throttle points');
    fireEvent.click(pedalBtn);
    expect(pedalBtn).toHaveAttribute('title', 'Hide brake/throttle points');
  });

  it('renders Pedal as the first color mode button before Speed', () => {
    const onChangeColorBy = vi.fn();
    render(<ReplayMapContainer {...baseProps} onChangeColorBy={onChangeColorBy} />);
    const buttons = screen.getAllByRole('button');
    const colorModeButtons = buttons.filter(b => b.textContent === 'Pedal' || b.textContent === 'Speed');
    expect(colorModeButtons.map(b => b.textContent)).toEqual(['Pedal', 'Speed']);
  });
});
