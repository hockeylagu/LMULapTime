import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CompareSectorChart,
  CompareSectorChartDataItem,
  CompareSectorTooltip,
  SectorTooltipPayloadItem,
} from '../../src/components/compare-laps/CompareSectorChart.js';
import { ComparableLap } from '../../server/core/types.js';

const baseline: ComparableLap = {
  id: 'baseline',
  tag: 'Baseline',
  lapNum: 1,
  lapTime: 100,
  lapTimeString: '1:40.000',
  s1: 30,
  s2: 35,
  s3: 35,
} as ComparableLap;

const target: ComparableLap = {
  id: 'target',
  tag: 'Target',
  lapNum: 2,
  lapTime: 101,
  lapTimeString: '1:41.000',
  s1: 31,
  s2: 34.5,
  s3: 35.5,
} as ComparableLap;

const chartData: CompareSectorChartDataItem[] = [
  { metric: 'S1', metricKey: 's1', baseline: 0, target: 1 },
  { metric: 'S2', metricKey: 's2', baseline: 0, target: -0.5 },
  { metric: 'S3', metricKey: 's3', baseline: 0, target: 0.5 },
  { metric: 'Lap', metricKey: 'lapTime', baseline: 0, target: 1 },
];

describe('CompareSectorChart component', () => {
  it('renders nothing without a baseline or with fewer than 2 laps', () => {
    const { container: c1 } = render(
      <CompareSectorChart selectedLaps={[baseline]} comparedLaps={[]} baselineLap={null} chartData={chartData} />
    );
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(
      <CompareSectorChart selectedLaps={[]} comparedLaps={[]} baselineLap={baseline} chartData={chartData} />
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders sector comparison context and invokes telemetry comparison for 2 laps', () => {
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

describe('CompareSectorTooltip component', () => {
  it('returns null when inactive, empty payload, or baselineLap is missing', () => {
    const { container: c1 } = render(
      <CompareSectorTooltip active={false} payload={[]} baselineLap={baseline} />
    );
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(
      <CompareSectorTooltip active={true} payload={[]} baselineLap={baseline} />
    );
    expect(c2).toBeEmptyDOMElement();

    const { container: c3 } = render(
      <CompareSectorTooltip active={true} payload={[{ dataKey: 'target', value: 1 }]} baselineLap={null} />
    );
    expect(c3).toBeEmptyDOMElement();
  });

  it('renders tooltip with baseline, faster (negative), slower (positive), and zero deltas', () => {
    const payload: SectorTooltipPayloadItem[] = [
      { dataKey: 'baseline', value: 0, name: 'Baseline' },
      { dataKey: 'target', value: 0.523, name: 'Target' },
      { dataKey: 'target_faster', value: -0.345, name: 'Faster Lap' },
      { dataKey: 'target_even', value: 0, name: 'Even Lap' },
      // Duplicate to test deduplication:
      { dataKey: 'target', value: 0.523, name: 'Target' },
    ];

    const fasterLap: ComparableLap = {
      id: 'target_faster',
      tag: 'Faster Lap',
      lapNum: 3,
      lapTime: 99.5,
      lapTimeString: '1:39.500',
      s1: 29.5,
      s2: 35,
      s3: 35,
    } as ComparableLap;

    const evenLap: ComparableLap = {
      id: 'target_even',
      tag: 'Even Lap',
      lapNum: 4,
      lapTime: 100,
      lapTimeString: '1:40.000',
      s1: 30,
      s2: 35,
      s3: 35,
    } as ComparableLap;

    render(
      <CompareSectorTooltip
        active={true}
        payload={payload}
        label="S1"
        chartData={chartData}
        selectedLaps={[baseline, target, fasterLap, evenLap]}
        baselineLap={baseline}
      />
    );

    expect(screen.getByText(/S1 Delta vs Baseline/i)).toBeInTheDocument();
    expect(screen.getByText('±0.000s (Baseline)')).toBeInTheDocument();
    expect(screen.getByText('+0.523s')).toBeInTheDocument();
    expect(screen.getByText('-0.345s')).toBeInTheDocument();
    expect(screen.getByText('0.000s')).toBeInTheDocument();
    expect(screen.getAllByText('(0:30.000)')).toHaveLength(2);
    expect(screen.getByText('(0:31.000)')).toBeInTheDocument();
    expect(screen.getByText('(0:29.500)')).toBeInTheDocument();
  });
});
