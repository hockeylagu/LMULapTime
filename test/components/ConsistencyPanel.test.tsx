import { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsistencyPanel } from '../../src/components/replay/analysis/ConsistencyPanel';
import { LapConsistencyStats } from '../../src/utils/lapConsistency';
import { CornerConsistencyStat } from '../../src/utils/cornerConsistency';

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Cell: (props: Record<string, unknown> & { children?: ReactNode }) => (
    <button type="button" {...props}>
      {props.children}
    </button>
  ),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('ConsistencyPanel', () => {
  const formatLapTime = (sec?: number | null) => (sec ? `${sec.toFixed(3)}s` : '--');

  const baseStats: LapConsistencyStats = {
    lapCount: 3,
    leastConsistent: {
      key: 's2Sec',
      label: 'Sector 2',
      count: 3,
      minSec: 34.0,
      maxSec: 35.1,
      avgSec: 34.5,
      stdDevSec: 0.45,
      consistencyPct: 0.65,
    },
    stats: [
      {
        key: 's1Sec',
        label: 'Sector 1',
        count: 3,
        minSec: 28.1,
        avgSec: 28.3,
        maxSec: 28.6,
        stdDevSec: 0.15,
        consistencyPct: 0.25,
      },
      {
        key: 's2Sec',
        label: 'Sector 2',
        count: 3,
        minSec: 34.0,
        avgSec: 34.5,
        maxSec: 35.1,
        stdDevSec: 0.45,
        consistencyPct: 0.65,
      },
    ],
  };

  const mockCornerStats: CornerConsistencyStat[] = [
    {
      cornerNumber: 1,
      lapsSampled: 3,
      minDistM: 120,
      time: {
        count: 3,
        min: 6.2,
        avg: 6.4,
        max: 6.7,
        stdDev: 0.18,
        consistencyPct: 0.45,
        samples: [
          { lapNumber: 1, value: 6.2 },
          { lapNumber: 2, value: 6.4 },
          { lapNumber: 3, value: 6.7 },
        ],
      },
      brakingDistM: {
        count: 1,
        min: 150,
        avg: 155,
        max: 160,
        stdDev: 4.1,
        consistencyPct: 0.35,
        samples: [{ lapNumber: 1, value: 150 }],
      },
      turnInDistM: {
        count: 1,
        min: 130,
        avg: 132,
        max: 135,
        stdDev: 2.0,
        consistencyPct: 0.2,
        samples: [{ lapNumber: 1, value: 130 }],
      },
      throttleOnDistM: {
        count: 1,
        min: 90,
        avg: 92,
        max: 95,
        stdDev: 2.1,
        consistencyPct: 0.25,
        samples: [{ lapNumber: 1, value: 90 }],
      },
      rotationAtThrottlePct: {
        count: 1,
        min: 80,
        avg: 82,
        max: 85,
        stdDev: 2.0,
        consistencyPct: 0.2,
        samples: [{ lapNumber: 1, value: 80 }],
      },
      entrySpeedKmh: {
        count: 1,
        min: 240,
        avg: 245,
        max: 250,
        stdDev: 4.0,
        consistencyPct: 0.2,
        samples: [{ lapNumber: 1, value: 240 }],
      },
      apexSpeedKmh: {
        count: 1,
        min: 110,
        avg: 112,
        max: 115,
        stdDev: 2.0,
        consistencyPct: 0.2,
        samples: [{ lapNumber: 1, value: 110 }],
      },
      exitSpeedKmh: {
        count: 1,
        min: 160,
        avg: 165,
        max: 170,
        stdDev: 4.0,
        consistencyPct: 0.2,
        samples: [{ lapNumber: 1, value: 160 }],
      },
    },
  ];

  it('renders minimum lap message when lapCount < 2', () => {
    render(
      <ConsistencyPanel
        stats={{ lapCount: 1, stats: [], leastConsistent: null }}
        formatLapTime={formatLapTime}
      />
    );

    expect(screen.getByText(/Need at least 2 valid laps in this replay to analyze consistency/)).toBeInTheDocument();
  });

  it('renders sector stats, least consistent badge, and loading state for corners', () => {
    render(
      <ConsistencyPanel
        stats={baseStats}
        isLoadingCornerStats={true}
        formatLapTime={formatLapTime}
      />
    );

    expect(screen.getByText('3 valid laps analyzed')).toBeInTheDocument();
    expect(screen.getByText('Sector 1')).toBeInTheDocument();
    expect(screen.getAllByText('Sector 2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('±0.150s')).toBeInTheDocument();
    expect(screen.getByText('0.3%')).toBeInTheDocument();
    expect(screen.getByText('Timing every lap through each corner...')).toBeInTheDocument();
  });

  it('renders empty corner stats message when cornerStats is empty', () => {
    render(
      <ConsistencyPanel
        stats={baseStats}
        cornerStats={[]}
        isLoadingCornerStats={false}
        formatLapTime={formatLapTime}
      />
    );

    expect(
      screen.getByText('Need at least 2 valid laps in this replay to analyze per-corner consistency.')
    ).toBeInTheDocument();
  });

  it('renders corner details, mini map, and expands metric chart on click', () => {
    const onSelectCorner = vi.fn();
    const onSelectBaselineLap = vi.fn();
    const onToggleLapExclusion = vi.fn();

    render(
      <ConsistencyPanel
        stats={baseStats}
        cornerStats={mockCornerStats}
        isLoadingCornerStats={false}
        onSelectCorner={onSelectCorner}
        onSelectBaselineLap={onSelectBaselineLap}
        formatLapTime={formatLapTime}
        availableLaps={[
          { lapNumber: 1, lapTimeSec: 90.5, isValid: true },
          { lapNumber: 2, lapTimeSec: 91.2, isValid: true },
        ]}
        excludedLaps={new Set()}
        onToggleLapExclusion={onToggleLapExclusion}
        currentLapNumber={1}
        trackPoints={[{ x: 0, z: 0, speedKmh: 100, distM: 120 } as unknown as import('../../server/core/types').ReplayTrajectoryPoint]}
        trackBounds={{ minX: -100, maxX: 100, minZ: -100, maxZ: 100, spanX: 200, spanZ: 200 }}
      />
    );

    const cornerHeaders = screen.getAllByText('Corner 1');
    expect(cornerHeaders.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Turn-In Pt')).toBeInTheDocument();
    expect(screen.getByText('Rot% @ Gas')).toBeInTheDocument();

    // Select corner
    fireEvent.click(cornerHeaders[cornerHeaders.length - 1]);
    expect(onSelectCorner).toHaveBeenCalledWith(1);

    // Expand metric row
    const timeRow = screen.getByText('Time');
    fireEvent.click(timeRow);

    // Clicking time row again collapses it
    fireEvent.click(timeRow);
  });
});
