import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplayCompareLapPicker } from '../../src/components/replay/inspector/ReplayCompareLapPicker.js';
import { ComparableLap } from '../../src/utils/lapComparison.js';

const mockLaps: ComparableLap[] = [
  {
    id: 'lap-1',
    matchingReplayFile: 'Bahrain_Q1_7.Vcr',
    sessionId: 'session-1',
    sessionType: 'Qualifying',
    sessionName: 'Q1',
    driverName: 'Samuel Lague',
    isPlayer: true,
    lapNum: 2,
    lapTime: 119.5,
    lapTimeString: '1:59.500',
    s1: 30.1,
    s2: 45.2,
    s3: 44.2,
    topSpeed: 280,
    carType: 'BMW M4 LMGT3',
    carClass: 'LMGT3',
    isValid: true,
  },
  {
    id: 'lap-2',
    matchingReplayFile: 'Bahrain_Q1_7.Vcr',
    sessionId: 'session-1',
    sessionType: 'Qualifying',
    sessionName: 'Q1',
    driverName: 'Samuel Lague',
    isPlayer: true,
    lapNum: 4,
    lapTime: 119.1,
    lapTimeString: '1:59.100',
    s1: 30.0,
    s2: 45.0,
    s3: 44.1,
    topSpeed: 281,
    carType: 'BMW M4 LMGT3',
    carClass: 'LMGT3',
    isValid: true,
  },
  {
    id: 'lap-3',
    matchingReplayFile: 'Bahrain_Q1_7.Vcr',
    sessionId: 'session-1',
    sessionType: 'Qualifying',
    sessionName: 'Q1',
    driverName: 'Balazs Borza',
    isPlayer: false,
    lapNum: 3,
    lapTime: 119.2,
    lapTimeString: '1:59.200',
    s1: 30.1,
    s2: 45.1,
    s3: 44.0,
    topSpeed: 280,
    carType: 'Ferrari 296 LMGT3',
    carClass: 'LMGT3',
    isValid: true,
  },
  {
    id: 'lap-4',
    matchingReplayFile: 'Bahrain_FP1_9.Vcr',
    sessionId: 'session-2',
    sessionType: 'Practice',
    sessionName: 'FP1',
    driverName: 'Samuel Lague',
    isPlayer: true,
    lapNum: 5,
    lapTime: 118.9,
    lapTimeString: '1:58.900',
    s1: 29.9,
    s2: 45.0,
    s3: 44.0,
    topSpeed: 282,
    carType: 'BMW M4 LMGT3',
    carClass: 'LMGT3',
    isValid: true,
  },
  {
    id: 'lap-5',
    matchingReplayFile: 'Bahrain_R1_7.Vcr',
    sessionId: 'session-3',
    sessionType: 'Race',
    sessionName: 'R1',
    driverName: 'Patrick Eichmeier',
    isPlayer: false,
    lapNum: 6,
    lapTime: 119.6,
    lapTimeString: '1:59.600',
    s1: 30.2,
    s2: 45.3,
    s3: 44.1,
    topSpeed: 279,
    carType: 'Porsche 911 GT3 R',
    carClass: 'LMGT3',
    isValid: true,
  },
];

describe('ReplayCompareLapPicker', () => {
  it('renders all four filter buttons: Same Session Lap, Player, Same Sessions, All Drivers', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={4}
        currentDriverName="Samuel Lague"
        filter="player"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Same Session Lap' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Player' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Same Sessions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Drivers' })).toBeInTheDocument();
  });

  it('filters to current session player laps when filter is same-session-lap', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={4}
        currentDriverName="Samuel Lague"
        filter="same-session-lap"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByText('1:59.500')).toBeInTheDocument();
    expect(screen.getByText('1:59.100')).toBeInTheDocument();
    // Opponents in same session should not appear
    expect(screen.queryByText('Balazs Borza')).not.toBeInTheDocument();
    // Other session laps should not appear
    expect(screen.queryByText('1:58.900')).not.toBeInTheDocument();
    expect(screen.queryByText('Patrick Eichmeier')).not.toBeInTheDocument();
  });

  it('filters to player laps across all sessions when filter is player', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={4}
        currentDriverName="Samuel Lague"
        filter="player"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByText('1:59.500')).toBeInTheDocument();
    expect(screen.getByText('1:59.100')).toBeInTheDocument();
    expect(screen.getByText('1:58.900')).toBeInTheDocument();
    expect(screen.queryByText('Balazs Borza')).not.toBeInTheDocument();
    expect(screen.queryByText('Patrick Eichmeier')).not.toBeInTheDocument();
  });

  it('filters to all drivers in the current session when filter is same-sessions', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={4}
        currentDriverName="Samuel Lague"
        filter="same-sessions"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByText('1:59.500')).toBeInTheDocument();
    expect(screen.getByText('1:59.100')).toBeInTheDocument();
    expect(screen.getByText('Balazs Borza')).toBeInTheDocument();
    // Laps from other sessions should not appear
    expect(screen.queryByText('1:58.900')).not.toBeInTheDocument();
    expect(screen.queryByText('Patrick Eichmeier')).not.toBeInTheDocument();
  });

  it('shows all drivers across all sessions when filter is all', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={4}
        currentDriverName="Samuel Lague"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByText('1:59.500')).toBeInTheDocument();
    expect(screen.getByText('1:59.100')).toBeInTheDocument();
    expect(screen.getByText('Balazs Borza')).toBeInTheDocument();
    expect(screen.getByText('1:58.900')).toBeInTheDocument();
    expect(screen.getByText('Patrick Eichmeier')).toBeInTheDocument();
  });

  it('displays Current badge on the current lap and Baseline badge on the selected lap', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={4}
        currentDriverName="Samuel Lague"
        filter="same-session-lap"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
  });

  it('calls onChangeFilter when clicking a filter button', () => {
    const onChangeFilter = vi.fn();
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        filter="player"
        isLoading={false}
        onChangeFilter={onChangeFilter}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Same Session Lap' }));
    expect(onChangeFilter).toHaveBeenCalledWith('same-session-lap');

    fireEvent.click(screen.getByRole('button', { name: 'Same Sessions' }));
    expect(onChangeFilter).toHaveBeenCalledWith('same-sessions');

    fireEvent.click(screen.getByRole('button', { name: 'All Drivers' }));
    expect(onChangeFilter).toHaveBeenCalledWith('all');
  });

  it('selects a lap and closes the picker on click', () => {
    const onSelectLap = vi.fn();
    const onClose = vi.fn();
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={onClose}
        onSelectLap={onSelectLap}
      />
    );

    fireEvent.click(screen.getByText('Balazs Borza'));
    expect(onSelectLap).toHaveBeenCalledWith(mockLaps[2]);
    expect(onClose).toHaveBeenCalled();
  });

  it('filters laps by car model dropdown', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    const carSelect = screen.getByRole('combobox', { name: 'Filter by car' });
    fireEvent.change(carSelect, { target: { value: 'Ferrari 296 LMGT3' } });

    expect(screen.getByText('Balazs Borza')).toBeInTheDocument();
    expect(screen.queryByText('Patrick Eichmeier')).not.toBeInTheDocument();
    expect(screen.getAllByText('Ferrari 296 LMGT3')).toHaveLength(2);
    expect(screen.getByRole('option', { name: '🏎️ BMW M4 LMGT3 (Current)' })).toBeInTheDocument();
  });

  it('filters laps by race type dropdown (Practice, Quali, Race)', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    const raceTypeSelect = screen.getByRole('combobox', { name: 'Filter by race type' });

    // Select Race
    fireEvent.change(raceTypeSelect, { target: { value: 'race' } });
    expect(screen.getByText('Patrick Eichmeier')).toBeInTheDocument();
    expect(screen.queryByText('Balazs Borza')).not.toBeInTheDocument();
    expect(screen.queryByText('1:58.900')).not.toBeInTheDocument();

    // Select Practice
    fireEvent.change(raceTypeSelect, { target: { value: 'practice' } });
    expect(screen.getByText('1:58.900')).toBeInTheDocument();
    expect(screen.queryByText('Patrick Eichmeier')).not.toBeInTheDocument();
    expect(screen.queryByText('Balazs Borza')).not.toBeInTheDocument();
  });

  it('calls onClose when clicking the header close button', () => {
    const onClose = vi.fn();
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={onClose}
        onSelectLap={vi.fn()}
      />
    );

    const closeButton = screen.getByRole('button', { name: 'Close comparison lap picker' });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('indicates current lap car badge in the car dropdown', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={2}
        currentDriverName="Samuel Lague"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    const carOption = screen.getByRole('option', { name: '🏎️ BMW M4 LMGT3 (Current)' });
    expect(carOption).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ferrari 296 LMGT3' })).toBeInTheDocument();
  });

  it('indicates current race type badge in the race type dropdown', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentLapNumber={2}
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    const qualiOption = screen.getByRole('option', { name: '🏁 Quali (Current)' });
    expect(qualiOption).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Practice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Race' })).toBeInTheDocument();
  });

  it('respects explicitly provided currentCarType and currentRaceType props', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        currentCarType="Ferrari 296 LMGT3"
        currentRaceType="race"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByRole('option', { name: '🏎️ Ferrari 296 LMGT3 (Current)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '🏁 Race (Current)' })).toBeInTheDocument();
  });

  it('filters by combining car and race type simultaneously', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    const carSelect = screen.getByRole('combobox', { name: 'Filter by car' });
    const raceTypeSelect = screen.getByRole('combobox', { name: 'Filter by race type' });

    // Select BMW M4 LMGT3 and Practice
    fireEvent.change(carSelect, { target: { value: 'BMW M4 LMGT3' } });
    fireEvent.change(raceTypeSelect, { target: { value: 'practice' } });

    // Only lap-4 should match
    expect(screen.getByText('1:58.900')).toBeInTheDocument();
    expect(screen.queryByText('1:59.500')).not.toBeInTheDocument();
    expect(screen.queryByText('1:59.600')).not.toBeInTheDocument();
  });

  it('sorts laps using the order dropdown', () => {
    render(
      <ReplayCompareLapPicker
        laps={mockLaps}
        selectedReplayName="Bahrain_Q1_7.Vcr"
        selectedLapNumber={2}
        currentReplayName="Bahrain_Q1_7.Vcr"
        filter="all"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    const orderSelect = screen.getByRole('combobox', { name: 'Order comparison laps' });

    // Sort by Driver name ascending
    fireEvent.change(orderSelect, { target: { value: 'driver-asc' } });
    const lapRows = screen.getAllByRole('button').filter(b => b.className.includes('grid-cols'));
    // Balazs Borza should appear first
    expect(lapRows[0]).toHaveTextContent('Balazs Borza');

    // Sort by Date descending
    fireEvent.change(orderSelect, { target: { value: 'date-desc' } });
    expect(screen.getByRole('combobox', { name: 'Order comparison laps' })).toHaveValue('date-desc');
  });

  it('displays loading spinner when isLoading is true', () => {
    render(
      <ReplayCompareLapPicker
        laps={[]}
        selectedReplayName={null}
        selectedLapNumber={null}
        filter="all"
        isLoading={true}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(screen.getByText(/Loading available laps.../i)).toBeInTheDocument();
  });

  it('displays empty state message when no laps match filter', () => {
    render(
      <ReplayCompareLapPicker
        laps={[]}
        selectedReplayName={null}
        selectedLapNumber={null}
        filter="same-session-lap"
        isLoading={false}
        onChangeFilter={vi.fn()}
        onClose={vi.fn()}
        onSelectLap={vi.fn()}
      />
    );

    expect(
      screen.getByText('No other valid laps found for this driver in the current session.')
    ).toBeInTheDocument();
  });
});



