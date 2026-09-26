import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplayCompareLapRow } from '../../../../src/components/replay/inspector/ReplayCompareLapRow.js';
import { ComparableLap } from '../../../../server/core/types.js';

const mockLap: ComparableLap = {
  id: 'lap-test-1',
  matchingReplayFile: 'Monza_R1.Vcr',
  sessionId: 'session-100',
  sessionType: 'Race',
  sessionName: 'Feature Race',
  driverName: 'Robert Kubica',
  isPlayer: false,
  lapNum: 14,
  lapTime: 108.452,
  lapTimeString: '1:48.452',
  s1: 27.2,
  s2: 40.1,
  s3: 41.152,
  topSpeed: 312.4,
  carType: 'Ferrari 499P',
  carClass: 'Hypercar',
  isValid: true,
};

describe('ReplayCompareLapRow', () => {
  it('renders lap information correctly', () => {
    render(
      <ReplayCompareLapRow
        lap={mockLap}
        isSelected={false}
        isCurrentLap={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Robert Kubica')).toBeInTheDocument();
    expect(screen.getByText('Ferrari 499P')).toBeInTheDocument();
    expect(screen.getByText('Feature Race (Race)')).toBeInTheDocument();
    expect(screen.getByText(/Monza_R1\.Vcr/)).toBeInTheDocument();
    expect(screen.getByText('L14')).toBeInTheDocument();
    expect(screen.getByText('1:48.452')).toBeInTheDocument();
  });

  it('renders the Current badge when isCurrentLap is true', () => {
    render(
      <ReplayCompareLapRow
        lap={mockLap}
        isSelected={false}
        isCurrentLap={true}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.queryByText('Baseline')).not.toBeInTheDocument();
  });

  it('renders the Baseline badge when isSelected is true', () => {
    render(
      <ReplayCompareLapRow
        lap={mockLap}
        isSelected={true}
        isCurrentLap={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
  });

  it('highlights all-time PB with gold styling', () => {
    const pbLap: ComparableLap = { ...mockLap, isAllTimePB: true };
    render(
      <ReplayCompareLapRow
        lap={pbLap}
        isSelected={false}
        isCurrentLap={false}
        onSelect={vi.fn()}
      />
    );

    const timeSpan = screen.getByText('1:48.452');
    expect(timeSpan.className).toContain('text-lmu-gold');
  });

  it('highlights session best with blue styling when not all-time PB', () => {
    const sessionBestLap: ComparableLap = { ...mockLap, isSessionBest: true, isAllTimePB: false };
    render(
      <ReplayCompareLapRow
        lap={sessionBestLap}
        isSelected={false}
        isCurrentLap={false}
        onSelect={vi.fn()}
      />
    );

    const timeSpan = screen.getByText('1:48.452');
    expect(timeSpan.className).toContain('text-lmu-blue');
  });

  it('calls onSelect with the lap data when clicked', () => {
    const onSelect = vi.fn();
    render(
      <ReplayCompareLapRow
        lap={mockLap}
        isSelected={false}
        isCurrentLap={false}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(mockLap);
  });
});
