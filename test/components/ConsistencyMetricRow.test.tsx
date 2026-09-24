import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  consistencyClass,
  MetricRow,
  LeastConsistentBadge,
} from '../../src/components/replay/analysis/ConsistencyMetricRow.js';
import { ConsistencyMetricStat } from '../../src/utils/cornerAnalysis.js';

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Cell: (props: Record<string, unknown> & { children?: ReactNode }) => <button type="button" {...props}>{props.children}</button>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('ConsistencyMetricRow helpers and components', () => {
  const mockStat: ConsistencyMetricStat = {
    count: 3,
    min: 78.5,
    avg: 81.2,
    max: 84.0,
    stdDev: 1.45,
    consistencyPct: 0.65,
    samples: [
      { lapNumber: 1, value: 78.5 },
      { lapNumber: 2, value: 81.2 },
      { lapNumber: 3, value: 84.0 },
    ],
  };

  it('consistencyClass returns appropriate color classes based on threshold', () => {
    expect(consistencyClass(0.2)).toBe('text-lmu-green');
    expect(consistencyClass(0.3)).toBe('text-lmu-green');
    expect(consistencyClass(0.5)).toBe('text-amber-400');
    expect(consistencyClass(0.8)).toBe('text-amber-400');
    expect(consistencyClass(0.9)).toBe('text-rose-400');
  });

  it('renders MetricRow with null stat displaying dashes', () => {
    render(
      <table>
        <tbody>
          <MetricRow
            label="Apex Speed"
            stat={null}
            unit=" km/h"
            decimals={1}
            isExpanded={false}
            onToggle={vi.fn()}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('Apex Speed')).toBeInTheDocument();
    const dashes = screen.getAllByText('--');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it('renders MetricRow with stat, toggles on click, and renders MetricChart when expanded', () => {
    const onToggle = vi.fn();
    const onSelectBaselineLap = vi.fn();

    const { rerender } = render(
      <table>
        <tbody>
          <MetricRow
            label="Apex Speed"
            stat={mockStat}
            unit=" km/h"
            decimals={1}
            isExpanded={false}
            onToggle={onToggle}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('Apex Speed')).toBeInTheDocument();
    expect(screen.getByText('78.5 km/h')).toBeInTheDocument();
    expect(screen.getByText('81.2 km/h')).toBeInTheDocument();
    expect(screen.getByText('84.0 km/h')).toBeInTheDocument();
    expect(screen.getByText('±1.4 km/h')).toBeInTheDocument();
    expect(screen.getByText('0.7%')).toBeInTheDocument();

    // Click row
    fireEvent.click(screen.getByText('Apex Speed'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    // Rerender expanded
    rerender(
      <table>
        <tbody>
          <MetricRow
            label="Apex Speed"
            stat={mockStat}
            unit=" km/h"
            decimals={1}
            isExpanded={true}
            onToggle={onToggle}
            currentLapNumber={1}
            bestLapNumber={2}
            onSelectBaselineLap={onSelectBaselineLap}
          />
        </tbody>
      </table>
    );

    expect(screen.getByTestId('baseline-bar-1')).toBeInTheDocument();
    expect(screen.getByTestId('baseline-bar-2')).toBeInTheDocument();

    // Double-click bar 2
    fireEvent.doubleClick(screen.getByTestId('baseline-bar-2'));
    expect(onSelectBaselineLap).toHaveBeenCalledWith(2);

    // KeyDown on bar 3
    fireEvent.keyDown(screen.getByTestId('baseline-bar-3'), { key: 'Enter' });
    expect(onSelectBaselineLap).toHaveBeenCalledWith(3);
  });

  it('renders LeastConsistentBadge with alert icon and values', () => {
    render(
      <LeastConsistentBadge
        label="Turn 4 Apex"
        stdDevSec={0.425}
        consistencyPct={2.8}
      />
    );

    expect(screen.getByText(/Turn 4 Apex/i)).toBeInTheDocument();
    expect(screen.getByText(/is your least consistent section/i)).toBeInTheDocument();
    expect(screen.getByText(/±0.425s, 2.8% variance/i)).toBeInTheDocument();
  });
});
