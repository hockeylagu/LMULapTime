import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SessionList, SessionListItem } from '../../src/components/SessionList';

describe('SessionList component', () => {
  const mockSessions: SessionListItem[] = [
    {
      id: 'sess-1',
      filename: 'spa_1.xml',
      trackVenue: 'Spa-Francorchamps',
      trackCourse: 'GP',
      timeString: '2026/05/28 14:00',
      sessionType: 'Race',
      sessionName: 'R1',
      weatherInfo: 'Dry / 22°C',
      driversCount: 20,
      matchingReplayFile: { name: 'spa_replay.vcr', path: 'C:\\spa_replay.vcr' },
      playerDriver: {
        name: 'Player 1',
        carType: 'Ferrari 499P',
        carClass: 'LMH',
        bestLapTime: 122.345,
        bestLapTimeString: '2:02.345',
        bestLapPaceCategory: 'Alien',
        bestLapPacePercentage: 100.2,
        lapsCount: 15,
        position: 2,
        gridPosition: 5,
        positionGain: 3,
      },
    },
    {
      id: 'sess-2',
      filename: 'le_mans_1.xml',
      trackVenue: 'Circuit de la Sarthe',
      trackCourse: '',
      timeString: '2026/05/29 10:00',
      sessionType: 'Qualifying',
      sessionName: 'Q1',
      weatherInfo: 'Cloudy / 19°C',
      playerDriver: {
        name: 'Player 1',
        carType: 'Porsche 911 GT3',
        carClass: 'LMGT3',
        bestLapTime: 235.123,
        bestLapTimeString: '3:55.123',
        bestLapPaceCategory: 'Competitive',
        bestLapPacePercentage: 101.4,
        lapsCount: 8,
        position: 3,
      },
    },
    {
      id: 'sess-empty',
      filename: 'empty_sess.xml',
      trackVenue: 'Monza',
      timeString: '2026/05/30 08:00',
      sessionType: 'Practice',
      playerDriver: {
        name: 'Player 1',
        carType: 'Oreca 07',
        carClass: 'LMP2',
        bestLapTime: null,
        bestLapTimeString: '--:--.---',
        lapsCount: 0,
      },
    },
  ];

  it('renders in Cards (grid) mode by default and allows clicking cards', () => {
    const onSelectSession = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        onSelectSession={onSelectSession}
        showTrackColumn={true}
      />
    );

    expect(screen.getByText('Spa-Francorchamps')).toBeInTheDocument();
    expect(screen.getByText('Circuit de la Sarthe')).toBeInTheDocument();
    expect(screen.getByText('Ferrari 499P')).toBeInTheDocument();
    expect(screen.getByText('2:02.345')).toBeInTheDocument();
    expect(screen.getByText('Alien')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();

    // Check race finish badge and quali badge
    expect(screen.getByText(/Finish:/i)).toBeInTheDocument();
    expect(screen.getByText(/Qual:/i)).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText('P3')).toBeInTheDocument();

    const card = screen.getByText('Spa-Francorchamps').closest('div.glass-panel');
    expect(card).not.toBeNull();
    if (card) {
      fireEvent.click(card);
      expect(onSelectSession).toHaveBeenCalledWith('sess-1');
    }
  });

  it('toggles to Table mode, renders all columns, and handles row clicks', () => {
    const onSelectSession = vi.fn();
    render(
      <SessionList
        sessions={mockSessions}
        onSelectSession={onSelectSession}
        showTrackColumn={true}
      />
    );

    const tableButton = screen.getByRole('button', { name: /Table view/i });
    fireEvent.click(tableButton);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(within(table).getByText('Track / Layout')).toBeInTheDocument();
    expect(within(table).getByText('Session')).toBeInTheDocument();
    expect(within(table).getByText('Date & Time')).toBeInTheDocument();
    expect(within(table).getByText('Car / Class')).toBeInTheDocument();
    expect(within(table).getByText('Laps')).toBeInTheDocument();
    expect(within(table).getByText('Best Lap')).toBeInTheDocument();
    expect(within(table).getByText('Benchmark Pace')).toBeInTheDocument();
    expect(within(table).getByText('Replay')).toBeInTheDocument();

    const row = within(table).getByText('Circuit de la Sarthe').closest('tr');
    expect(row).not.toBeNull();
    if (row) {
      fireEvent.click(row);
      expect(onSelectSession).toHaveBeenCalledWith('sess-2');
    }
  });

  it('hides track column when showTrackColumn is false', () => {
    render(
      <SessionList
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        showTrackColumn={false}
      />
    );

    const tableButton = screen.getByRole('button', { name: /Table view/i });
    fireEvent.click(tableButton);

    const table = screen.getByRole('table');
    expect(within(table).queryByText('Track / Layout')).not.toBeInTheDocument();
  });

  it('renders custom empty message and reset filters button when sessions is empty', () => {
    const onResetFilters = vi.fn();
    render(
      <SessionList
        sessions={[]}
        onSelectSession={vi.fn()}
        emptyMessage="Custom empty query message"
        onResetFilters={onResetFilters}
        hideEmptyNotice={<span>1 session is hidden</span>}
      />
    );

    expect(screen.getByText('Custom empty query message')).toBeInTheDocument();
    expect(screen.getByText('1 session is hidden')).toBeInTheDocument();

    const resetBtn = screen.getByRole('button', { name: /Reset All Filters/i });
    fireEvent.click(resetBtn);
    expect(onResetFilters).toHaveBeenCalled();
  });

  it('supports custom getPaceBadge resolver', () => {
    const customGetPaceBadge = vi.fn().mockReturnValue({
      category: 'Good',
      percentage: 102.1,
    });

    render(
      <SessionList
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        getPaceBadge={customGetPaceBadge}
      />
    );

    expect(customGetPaceBadge).toHaveBeenCalled();
    expect(screen.getAllByText('Good').length).toBeGreaterThan(0);
  });
});
