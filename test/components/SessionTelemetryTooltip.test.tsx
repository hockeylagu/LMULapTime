import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SessionTelemetryTooltip,
  SessionTelemetryTooltipProps,
  SessionTelemetryTooltipEntry,
} from '../../src/components/session-detail/chart/SessionTelemetryTooltip.js';
import { DetailedSession, DriverData } from '../../server/core/types.js';

describe('SessionTelemetryTooltip component', () => {
  const mockDriver = {
    name: 'Samuel Lague',
    carType: 'Ferrari 499P',
    carClass: 'LMH',
    carNumber: '50',
    teamName: 'AF Corse',
    isPlayer: true,
    lapsCount: 10,
    laps: [],
  } as unknown as DriverData;

  const mockDriver2 = {
    name: 'Rival Driver',
    carType: 'Toyota GR010',
    carClass: 'LMH',
    carNumber: '7',
    teamName: 'Toyota Gazoo',
    isPlayer: false,
    lapsCount: 10,
    laps: [],
  } as unknown as DriverData;

  const mockSession = {
    id: 's1',
    playerDriver: mockDriver,
  } as unknown as DetailedSession;

  const basePayloadItem: SessionTelemetryTooltipEntry = {
    payload: {
      lapNum: 'Lap 5',
      isValid: true,
      isInferred: false,
      isPitStop: false,
      isOutLap: false,
      lapTimeString: '1:45.123',
      avgLapTime: 106.5,
      avgLapTimeString: '1:46.500',
      s1String: '30.100',
      s2String: '35.000',
      s3String: '40.023',
      topSpeed: 312.4,
      twFL: 92.5,
      twFR: 91.0,
      twRL: 88.0,
      twRR: 87.5,
      twAvg: 89.8,
      fuel: 45.2,
      virtualEnergy: 78.5,
      'Samuel Lague': 1,
      'Samuel Lague_lapTime': '1:45.123',
      'Rival Driver': 2,
      'Rival Driver_lapTime': '1:45.800',
      'Rival Driver_isPit': true,
    },
  };

  const defaultProps: SessionTelemetryTooltipProps = {
    active: true,
    payload: [basePayloadItem],
    activeChartMetric: 'lapTime',
    driversToPlot: [mockDriver, mockDriver2],
    session: mockSession,
    selectedDriver: mockDriver,
  };

  it('returns null when inactive or payload is empty', () => {
    const { container: c1 } = render(<SessionTelemetryTooltip {...defaultProps} active={false} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<SessionTelemetryTooltip {...defaultProps} payload={[]} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders lapTime metric with session average and inferred status', () => {
    const inferredPayload: SessionTelemetryTooltipEntry = {
      payload: {
        ...basePayloadItem.payload,
        isInferred: true,
      },
    };

    render(<SessionTelemetryTooltip {...defaultProps} payload={[inferredPayload]} activeChartMetric="lapTime" />);
    expect(screen.getByText(/Lap Time: 1:45.123/i)).toBeInTheDocument();
    expect(screen.getByText('(est)')).toBeInTheDocument();
    expect(screen.getByText(/Session Avg: 1:46.500/i)).toBeInTheDocument();
  });

  it('renders sectors metric', () => {
    render(<SessionTelemetryTooltip {...defaultProps} activeChartMetric="sectors" />);
    expect(screen.getByText('S1: 30.100')).toBeInTheDocument();
    expect(screen.getByText('S2: 35.000')).toBeInTheDocument();
    expect(screen.getByText('S3: 40.023')).toBeInTheDocument();
  });

  it('renders topSpeed metric', () => {
    render(<SessionTelemetryTooltip {...defaultProps} activeChartMetric="topSpeed" />);
    expect(screen.getByText('Top Speed: 312.4 km/h')).toBeInTheDocument();
  });

  it('renders tireWear metric', () => {
    render(<SessionTelemetryTooltip {...defaultProps} activeChartMetric="tireWear" />);
    expect(screen.getByText('FL: 92.5%')).toBeInTheDocument();
    expect(screen.getByText('FR: 91%')).toBeInTheDocument();
    expect(screen.getByText('RL: 88%')).toBeInTheDocument();
    expect(screen.getByText('RR: 87.5%')).toBeInTheDocument();
    expect(screen.getByText('Avg: 89.8%')).toBeInTheDocument();
  });

  it('renders fuelEnergy metric', () => {
    render(<SessionTelemetryTooltip {...defaultProps} activeChartMetric="fuelEnergy" />);
    expect(screen.getByText('Fuel: 45.2%')).toBeInTheDocument();
    expect(screen.getByText('Virtual Energy: 78.5%')).toBeInTheDocument();
  });

  it('renders positions standings metric with player highlighting and pit indicators', () => {
    render(<SessionTelemetryTooltip {...defaultProps} activeChartMetric="positions" />);
    expect(screen.getByText('LMH Standings')).toBeInTheDocument();
    expect(screen.getByText('Samuel Lague')).toBeInTheDocument();
    expect(screen.getByText('Rival Driver')).toBeInTheDocument();
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText(/PIT/i)).toBeInTheDocument();
  });

  it('renders pit stop, out lap, and invalid lap status badges in header', () => {
    const pitPayload: SessionTelemetryTooltipEntry = {
      payload: { ...basePayloadItem.payload, isPitStop: true },
    };
    const { rerender } = render(<SessionTelemetryTooltip {...defaultProps} payload={[pitPayload]} />);
    expect(screen.getByText(/PIT/i)).toBeInTheDocument();

    const outLapPayload: SessionTelemetryTooltipEntry = {
      payload: { ...basePayloadItem.payload, isPitStop: false, isOutLap: true },
    };
    rerender(<SessionTelemetryTooltip {...defaultProps} payload={[outLapPayload]} />);
    expect(screen.getByText(/OUT/i)).toBeInTheDocument();

    const invalidPayload: SessionTelemetryTooltipEntry = {
      payload: { ...basePayloadItem.payload, isPitStop: false, isOutLap: false, isValid: false },
    };
    rerender(<SessionTelemetryTooltip {...defaultProps} payload={[invalidPayload]} />);
    expect(screen.getByText(/Incomplete/i)).toBeInTheDocument();
  });
});
