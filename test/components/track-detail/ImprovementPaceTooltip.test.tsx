import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ImprovementPaceTooltip,
  ImprovementPaceTooltipProps,
} from '../../../src/components/track-detail/improvement-chart/ImprovementPaceTooltip.js';
import {
  ImprovementTooltipPayloadEntry,
  ImprovementChartPoint,
} from '../../../src/components/track-detail/improvement-chart/ImprovementPaceChart.js';

describe('ImprovementPaceTooltip component', () => {
  const basePointData = {
    session: 'Practice 1',
    fullDate: 'May 28, 2026 14:00',
    car: 'Ferrari 499P #50',
    weather: '☀️ 24°C Dry',
    benchmarkPercentage: 101.5,
    lapPrDelta: -0.325,
    top3AvgStr: '1:42.500',
    theoreticalGap: 0.150,
    consistencyScore: 94.2,
  } as unknown as ImprovementChartPoint;

  const payload: ImprovementTooltipPayloadEntry[] = [
    {
      name: 'Personal Best Over Time',
      value: 100.5,
      dataKey: 'bestLapTime',
      color: '#a855f7',
      payload: basePointData,
    },
    {
      name: 'Pace Consistency Rating',
      value: 94.2,
      dataKey: 'consistencyScore',
      color: '#10b981',
      payload: basePointData,
    },
    // Null value to test filter:
    {
      name: 'Ignored Null',
      value: null,
      dataKey: 'ignored',
      payload: basePointData,
    },
    // Duplicate to test deduplication:
    {
      name: 'Personal Best Over Time',
      value: 100.5,
      dataKey: 'bestLapTime',
      color: '#a855f7',
      payload: basePointData,
    },
  ];

  const defaultProps: ImprovementPaceTooltipProps = {
    active: true,
    payload,
    metric: 'bestPr',
  };

  it('returns null when inactive, without payload, or with empty payload', () => {
    const { container: c1 } = render(<ImprovementPaceTooltip {...defaultProps} active={false} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<ImprovementPaceTooltip {...defaultProps} payload={[]} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders session header, weather badge, car, and PR metric details', () => {
    render(<ImprovementPaceTooltip {...defaultProps} onSelectSession={() => {}} />);

    expect(screen.getByText('Practice 1')).toBeInTheDocument();
    expect(screen.getByText('☀️ 24°C Dry')).toBeInTheDocument();
    expect(screen.getByText('Ferrari 499P #50')).toBeInTheDocument();
    expect(screen.getByText('May 28, 2026 14:00')).toBeInTheDocument();

    // Renames 'Personal Best Over Time' to 'PR:'
    expect(screen.getByText('PR:')).toBeInTheDocument();
    expect(screen.getByText('1:40.500')).toBeInTheDocument();
    expect(screen.getByText('94.2%')).toBeInTheDocument();

    // bestPr details
    expect(screen.getByText(/Benchmark:/i)).toBeInTheDocument();
    expect(screen.getByText('101.5%')).toBeInTheDocument();
    expect(screen.getByText('-0.325s')).toBeInTheDocument();

    // click prompt
    expect(screen.getByText(/Click dot to view session telemetry/i)).toBeInTheDocument();
  });

  it('renders top3, optimal gap, and consistency metrics when metric is not bestPr', () => {
    render(<ImprovementPaceTooltip {...defaultProps} metric="bestLap" />);

    expect(screen.getByText(/Top 3:/i)).toBeInTheDocument();
    expect(screen.getByText('1:42.500')).toBeInTheDocument();
    expect(screen.getByText('+0.150s')).toBeInTheDocument();
    expect(screen.getAllByText('94.2%')).toHaveLength(2);
  });

  it('handles null values for benchmarkPercentage and positive lapPrDelta', () => {
    const nullPropsPayload: ImprovementTooltipPayloadEntry[] = [
      {
        name: 'Lap Time',
        value: 102.0,
        dataKey: 'lapTime',
        payload: {
          ...basePointData,
          weather: undefined,
          benchmarkPercentage: null,
          lapPrDelta: 0.5,
        } as unknown as ImprovementChartPoint,
      },
    ];

    render(<ImprovementPaceTooltip active={true} payload={nullPropsPayload} metric="bestPr" />);
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
