import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompareLapsTable, CompareLapsTableProps } from '../../src/components/compare-laps/CompareLapsTable.js';
import { ComparableLap } from '../../src/utils/lapComparison.js';

describe('CompareLapsTable component', () => {
  const mockLap1: ComparableLap = {
    id: 'lap1',
    sessionId: 'sess1',
    sessionName: 'Qualifying',
    carClass: 'LMH',
    carType: 'Ferrari 499P',
    driverName: 'Driver One',
    lapNum: 3,
    lapTime: 120.5,
    lapTimeString: '2:00.500',
    s1: 34.2,
    s2: 41.5,
    s3: 44.8,
    topSpeed: 320.5,
    isValid: true,
    isPitStop: false,
    pacePercentage: 101.2,
  };

  const mockLap2: ComparableLap = {
    id: 'lap2',
    sessionId: 'sess2',
    sessionName: 'Race',
    carClass: 'LMH',
    carType: 'Toyota GR010',
    driverName: 'Driver Two',
    lapNum: 5,
    lapTime: 121.2,
    lapTimeString: '2:01.200',
    s1: 34.5,
    s2: 41.8,
    s3: 44.9,
    topSpeed: 318.0,
    isValid: true,
    isPitStop: false,
    pacePercentage: 101.8,
  };

  const defaultProps: CompareLapsTableProps = {
    selectedTrack: 'Spa GP',
    selectedCarClass: 'LMH',
    playerOnly: true,
    displayLaps: [mockLap1, mockLap2],
    emptyCount: 0,
    hideEmpty: true,
    setHideEmpty: vi.fn(),
    availableLapsSort: 'lap-asc',
    setAvailableLapsSort: vi.fn(),
    loading: false,
    selectedLaps: [mockLap1],
    baselineLap: mockLap1,
    allTimeBestLapId: 'lap1',
    bestAvailableS1: 34.2,
    bestAvailableS2: 41.5,
    bestAvailableS3: 44.8,
    onToggleLap: vi.fn(),
  };

  it('renders loading spinner when loading is true', () => {
    render(<CompareLapsTable {...defaultProps} loading={true} />);
    expect(screen.getByText(/Scanning sessions on Spa GP/i)).toBeInTheDocument();
  });

  it('renders empty state when displayLaps is empty without hidden laps', () => {
    render(<CompareLapsTable {...defaultProps} displayLaps={[]} emptyCount={0} />);
    expect(screen.getByText(/No completed laps found for Spa GP in LMH/i)).toBeInTheDocument();
  });

  it('renders empty state with clickable prompt to show hidden empty laps', () => {
    const setHideEmpty = vi.fn();
    render(<CompareLapsTable {...defaultProps} displayLaps={[]} emptyCount={3} hideEmpty={true} setHideEmpty={setHideEmpty} />);
    
    expect(screen.getByText(/3 invalid \/ pit \/ empty laps are hidden/i)).toBeInTheDocument();
    const showBtn = screen.getByRole('button', { name: /Click here to show empty laps/i });
    fireEvent.click(showBtn);
    expect(setHideEmpty).toHaveBeenCalledWith(false);
  });

  it('renders table headers and laps correctly with driver and car details', () => {
    render(<CompareLapsTable {...defaultProps} playerOnly={false} />);
    expect(screen.getByText(/Available Laps on Spa GP \(2 Laps\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Showing the fastest 100 all-driver laps/i)).toBeInTheDocument();
    expect(screen.getByText('Driver One')).toBeInTheDocument();
    expect(screen.getByText('Driver Two')).toBeInTheDocument();
    expect(screen.getByText('2:00.500')).toBeInTheDocument();
    expect(screen.getByText('2:01.200')).toBeInTheDocument();
  });

  it('triggers sorting callbacks when clicking sortable column headers', () => {
    const setAvailableLapsSort = vi.fn();
    render(<CompareLapsTable {...defaultProps} setAvailableLapsSort={setAvailableLapsSort} />);

    // Click Date
    fireEvent.click(screen.getByTitle(/Sort by Session Date/i));
    expect(setAvailableLapsSort).toHaveBeenCalled();

    // Click Lap Time
    fireEvent.click(screen.getByTitle(/Sort by Lap Time/i));
    expect(setAvailableLapsSort).toHaveBeenCalled();

    // Click Pace
    fireEvent.click(screen.getByTitle(/Sort by Benchmark Pace Percentage/i));
    expect(setAvailableLapsSort).toHaveBeenCalledWith('pace-asc');

    // Click S1, S2, S3
    fireEvent.click(screen.getByTitle(/Sort by Sector 1/i));
    expect(setAvailableLapsSort).toHaveBeenCalledWith('s1-asc');
    fireEvent.click(screen.getByTitle(/Sort by Sector 2/i));
    expect(setAvailableLapsSort).toHaveBeenCalledWith('s2-asc');
    fireEvent.click(screen.getByTitle(/Sort by Sector 3/i));
    expect(setAvailableLapsSort).toHaveBeenCalledWith('s3-asc');

    // Click Top Speed
    fireEvent.click(screen.getByTitle(/Sort by Top Speed/i));
    expect(setAvailableLapsSort).toHaveBeenCalled();
  });

  it('toggles lap selection when clicking action buttons on table rows', () => {
    const onToggleLap = vi.fn();
    render(<CompareLapsTable {...defaultProps} onToggleLap={onToggleLap} />);

    const removeBtn = screen.getByRole('button', { name: /Added/i });
    fireEvent.click(removeBtn);
    expect(onToggleLap).toHaveBeenCalledWith(mockLap1);

    const addBtn = screen.getByRole('button', { name: /Compare/i });
    fireEvent.click(addBtn);
    expect(onToggleLap).toHaveBeenCalledWith(mockLap2);
  });
});
