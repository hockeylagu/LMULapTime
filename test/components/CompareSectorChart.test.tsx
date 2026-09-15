import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompareSectorChart, CompareSectorChartDataItem } from '../../src/components/compare-laps/CompareSectorChart.js';
import { ComparableLap } from '../../src/utils/lapComparison.js';

const baseline = {
  id: 'baseline', tag: 'Baseline', lapNum: 1, lapTime: 100, lapTimeString: '1:40.000', s1: 30, s2: 35, s3: 35,
} as ComparableLap;
const target = {
  id: 'target', tag: 'Target', lapNum: 2, lapTime: 101, lapTimeString: '1:41.000', s1: 31, s2: 35, s3: 35,
} as ComparableLap;
const chartData: CompareSectorChartDataItem[] = [
  { metric: 'S1', metricKey: 's1', baseline: 0, target: 1 },
  { metric: 'S2', metricKey: 's2', baseline: 0, target: 0 },
  { metric: 'Lap', metricKey: 'lapTime', baseline: 0, target: 1 },
];

describe('CompareSectorChart', () => {
  it('renders nothing without a baseline or a comparison lap', () => {
    const { container } = render(<CompareSectorChart selectedLaps={[baseline]} comparedLaps={[]} baselineLap={null} chartData={chartData} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders sector comparison context and invokes telemetry comparison', () => {
    const onCompareTelemetry = vi.fn();
    render(
      <CompareSectorChart
        selectedLaps={[baseline, target]}
        comparedLaps={[target]}
        baselineLap={baseline}
        chartData={chartData}
        onCompareTelemetry={onCompareTelemetry}
      />
    );

    expect(screen.getByText(/Sector Telemetry Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Baseline Reference/i)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Compare Telemetry/i });
    fireEvent.click(button);
    expect(onCompareTelemetry).toHaveBeenCalledTimes(1);
  });

  it('does not show telemetry action when more than two laps are selected', () => {
    render(
      <CompareSectorChart
        selectedLaps={[baseline, target, { ...target, id: 'third' }]}
        comparedLaps={[target]}
        baselineLap={baseline}
        chartData={chartData}
        onCompareTelemetry={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Compare Telemetry/i })).not.toBeInTheDocument();
  });
});
