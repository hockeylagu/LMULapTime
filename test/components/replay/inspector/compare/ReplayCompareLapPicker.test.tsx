import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplayCompareLapPicker, type ReplayCompareLapPickerProps } from '../../../../../src/components/replay/inspector/compare/ReplayCompareLapPicker.js';
import { DEFAULT_COMPARE_CONTROLS } from '../../../../../src/components/replay/inspector/compare/compareLapControls.js';
import { ComparableLap } from '../../../../../shared/types/index.js';
import { chooseValue, openSelect, selectedValue } from '../../../../helpers/selectControl.js';

const mockLaps: ComparableLap[] = [
  {
    id: 'lap-1', driverOrdinal: 0, lapOrdinal: 1,
    matchingReplayFile: 'Bahrain_Q1_7.Vcr',
    sessionId: 'session-1',
    sessionType: 'Qualifying',
    sessionName: 'Q1',
    driverName: 'Samuel Lague',
    isPlayer: true,
    lapNumber: 2,
    lapTime: 119.5,
    s1: 30.1,
    s2: 45.2,
    s3: 44.2,
    topSpeed: 280,
    carType: 'BMW M4 LMGT3',
    carClass: 'GT3',
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
    lapNumber: 4,
    lapTime: 119.1,
    s1: 30.0,
    s2: 45.0,
    s3: 44.1,
    topSpeed: 281,
    carType: 'BMW M4 LMGT3',
    carClass: 'GT3',
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
    lapNumber: 3,
    lapTime: 119.2,
    s1: 30.1,
    s2: 45.1,
    s3: 44.0,
    topSpeed: 280,
    carType: 'Ferrari 296 LMGT3',
    carClass: 'GT3',
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
    lapNumber: 5,
    lapTime: 118.9,
    s1: 29.9,
    s2: 45.0,
    s3: 44.0,
    topSpeed: 282,
    carType: 'BMW M4 LMGT3',
    carClass: 'GT3',
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
    lapNumber: 6,
    lapTime: 119.6,
    s1: 30.2,
    s2: 45.3,
    s3: 44.1,
    topSpeed: 279,
    carType: 'Porsche 911 GT3 R',
    carClass: 'GT3',
    isValid: true,
  },
];

describe('ReplayCompareLapPicker', () => {
  const baseProps = {
    laps: mockLaps, carTypes: ['BMW M4 LMGT3', 'Ferrari 296 LMGT3', 'Lexus RCF LMGT3'],
    controls: DEFAULT_COMPARE_CONTROLS,
    selectedSessionId: 'session-1', selectedDriverOrdinal: 0, selectedLapOrdinal: 1,
    currentSessionId: 'session-1', currentLapNumber: 4, currentDriverName: 'Samuel Lague',
    filter: 'player' as const, isLoading: false,
    onChangeFilter: vi.fn(), onChangeControls: vi.fn(), onClose: vi.fn(), onSelectLap: vi.fn(),
  };
  const renderPicker = (props: Partial<ReplayCompareLapPickerProps> = {}) =>
    render(<ReplayCompareLapPicker {...baseProps} {...props} />);

  it('lists the laps in the order the server returned them, without filtering or sorting them again', () => {
    renderPicker({ filter: 'all' });
    const rows = screen.getAllByRole('button').filter(b => b.className.includes('grid-cols'));
    expect(rows).toHaveLength(mockLaps.length);
    expect(rows[0]).toHaveTextContent('1:59.500');
    expect(rows[1]).toHaveTextContent('1:59.100');
    expect(rows[3]).toHaveTextContent('1:58.900');
  });

  it('exposes every server page', () => {
    const onPageChange = vi.fn();
    renderPicker({ pagination: { page: 1, pageSize: 50, total: 51, onPageChange } });
    expect(screen.getByRole('button', { name: 'Previous laps' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next laps' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('renders the four scope buttons and reports a click', () => {
    const onChangeFilter = vi.fn();
    renderPicker({ onChangeFilter });
    for (const name of ['Same Session Lap', 'Player', 'Same Sessions', 'All Drivers']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Same Sessions' }));
    expect(onChangeFilter).toHaveBeenCalledWith('same-sessions');
    fireEvent.click(screen.getByRole('button', { name: 'All Drivers' }));
    expect(onChangeFilter).toHaveBeenCalledWith('all');
  });

  it('shows Current and Baseline badges', () => {
    renderPicker({ filter: 'same-session-lap' });
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
  });

  it('marks only the exact baseline when drivers share a lap number', () => {
    const baseline = mockLaps[0];
    const otherDriver = { ...baseline, id: 'other-driver', driverOrdinal: 1, driverName: 'Other Driver' };
    const otherLap = { ...baseline, id: 'other-lap', lapOrdinal: 2 };
    const otherSession = { ...baseline, id: 'other-session', sessionId: 'session-2' };
    const { rerender } = renderPicker({ laps: [baseline, otherDriver, otherLap, otherSession], filter: 'all' });
    expect(screen.getAllByText('Baseline')).toHaveLength(1);
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent(baseline.driverName);
    rerender(<ReplayCompareLapPicker {...baseProps} laps={[baseline, otherDriver, otherLap, otherSession]}
      selectedDriverOrdinal={1} />);
    expect(screen.getAllByText('Baseline')).toHaveLength(1);
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('Other Driver');
  });

  it('does not mark another driver when the baseline is absent from the page', () => {
    renderPicker({ laps: [{ ...mockLaps[0], id: 'other-driver', driverOrdinal: 1 }] });
    expect(screen.queryByText('Baseline')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
  });

  it.each(['same-sessions', 'all', 'player', 'same-session-lap'] as const)(
    'shows player badges only in mixed-driver scopes: %s', (filter) => {
      renderPicker({ filter });
      expect(screen.queryAllByText('You')).toHaveLength(
        filter === 'same-sessions' || filter === 'all' ? mockLaps.filter(lap => lap.isPlayer).length : 0,
      );
    },
  );

  it('selects a lap and closes the picker on click', () => {
    const onSelectLap = vi.fn();
    const onClose = vi.fn();
    renderPicker({ onSelectLap, onClose, filter: 'all' });
    fireEvent.click(screen.getByText('Balazs Borza'));
    expect(onSelectLap).toHaveBeenCalledWith(mockLaps[2]);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes from the header button', () => {
    const onClose = vi.fn();
    renderPicker({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close comparison lap picker' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lists the car types of the whole scope, not only those on the page', () => {
    renderPicker({ laps: [mockLaps[0]] });
    openSelect(screen.getByRole('combobox', { name: 'Filter by car' }));
    expect(screen.getByRole('option', { name: 'Lexus RCF LMGT3' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ferrari 296 LMGT3' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'BMW M4 LMGT3 (Current)' })).toBeInTheDocument();
  });

  it('keeps a selected car listed when the scope no longer contains it', () => {
    renderPicker({ carTypes: ['BMW M4 LMGT3'], controls: { ...DEFAULT_COMPARE_CONTROLS, carType: 'Lexus RCF LMGT3' } });
    expect(selectedValue(screen.getByRole('combobox', { name: 'Filter by car' }))).toBe('Lexus RCF LMGT3');
  });

  it('reports the order and each filter to the server-backed controls', () => {
    const onChangeControls = vi.fn();
    renderPicker({ onChangeControls });
    chooseValue(screen.getByRole('combobox', { name: 'Order comparison laps' }), 'recent');
    expect(onChangeControls).toHaveBeenLastCalledWith({ ...DEFAULT_COMPARE_CONTROLS, sort: 'recent' });
    chooseValue(screen.getByRole('combobox', { name: 'Filter by car' }), 'Ferrari 296 LMGT3');
    expect(onChangeControls).toHaveBeenLastCalledWith({ ...DEFAULT_COMPARE_CONTROLS, carType: 'Ferrari 296 LMGT3' });
    chooseValue(screen.getByRole('combobox', { name: 'Filter by race type' }), 'race');
    expect(onChangeControls).toHaveBeenLastCalledWith({ ...DEFAULT_COMPARE_CONTROLS, sessionKind: 'race' });
    chooseValue(screen.getByRole('combobox', { name: 'Filter by condition' }), 'Wet');
    expect(onChangeControls).toHaveBeenLastCalledWith({ ...DEFAULT_COMPARE_CONTROLS, condition: 'Wet' });
  });

  it('shows the controls it is given', () => {
    renderPicker({ controls: { sort: 'driver', carType: 'BMW M4 LMGT3', sessionKind: 'quali', condition: 'all' } });
    expect(selectedValue(screen.getByRole('combobox', { name: 'Order comparison laps' }))).toBe('driver');
    expect(selectedValue(screen.getByRole('combobox', { name: 'Filter by race type' }))).toBe('quali');
    expect(selectedValue(screen.getByRole('combobox', { name: 'Filter by condition' }))).toBe('all');
  });

  it('names the current condition in the Same condition option', () => {
    const { rerender } = renderPicker({ currentWeatherCondition: 'Wet' });
    openSelect(screen.getByRole('combobox', { name: 'Filter by condition' }));
    expect(screen.getByRole('option', { name: 'Same condition (Wet)' })).toBeInTheDocument();
    rerender(<ReplayCompareLapPicker {...baseProps} currentWeatherCondition="Dynamic Weather" />);
    expect(screen.getByRole('option', { name: 'Same condition (Dynamic Weather)' })).toBeInTheDocument();
  });

  it('reads the current condition from the current lap, and not from another driver or lap', () => {
    const wet = { ...mockLaps[1], weatherCondition: 'Wet' as const };
    const { rerender } = renderPicker({ laps: [wet] });
    openSelect(screen.getByRole('combobox', { name: 'Filter by condition' }));
    expect(screen.getByRole('option', { name: 'Same condition (Wet)' })).toBeInTheDocument();
    rerender(<ReplayCompareLapPicker {...baseProps} laps={[wet]} currentDriverName="Different Driver" currentLapNumber={9} />);
    expect(screen.getByRole('option', { name: /^Same condition$/ })).toBeInTheDocument();
  });

  it('indicates the current and explicitly provided race type and car', () => {
    const { rerender } = renderPicker({ currentLapNumber: 2 });
    openSelect(screen.getByRole('combobox', { name: 'Filter by race type' }));
    expect(screen.getByRole('option', { name: 'Quali (Current)' })).toBeInTheDocument();
    rerender(<ReplayCompareLapPicker {...baseProps} currentCarType="Ferrari 296 LMGT3" currentRaceType="race" />);
    expect(screen.getByRole('option', { name: 'Race (Current)' })).toBeInTheDocument();
    openSelect(screen.getByRole('combobox', { name: 'Filter by car' }));
    expect(screen.getByRole('option', { name: 'Ferrari 296 LMGT3 (Current)' })).toBeInTheDocument();
  });

  it('displays a loading spinner', () => {
    renderPicker({ laps: [], isLoading: true });
    expect(screen.getByText(/Loading available laps.../i)).toBeInTheDocument();
  });

  it('displays the error with a retry', () => {
    const onRetry = vi.fn();
    renderPicker({ laps: [], error: 'Failed to load', onRetry });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('displays an empty state when the server returns no laps', () => {
    renderPicker({ laps: [], filter: 'same-session-lap' });
    expect(screen.getByText('No other valid laps found for this driver in the current session.')).toBeInTheDocument();
  });
});
