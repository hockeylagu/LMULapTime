import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionTableRow } from '../../src/components/session-list/SessionTableRow';
import { SessionListItem } from '../../src/components/session-list/SessionList';

describe('SessionTableRow', () => {
  const baseSession: SessionListItem = {
    id: 'session-race-1',
    sessionType: 'Race',
    sessionName: 'Race 1',
    timeString: '2026-07-20 15:30',
    trackVenue: 'Autodromo Nazionale Monza',
    trackCourse: 'Grand Prix',
    playerDriver: {
      name: 'Player Driver',
      carType: 'Porsche 963',
      carClass: 'Hypercar',
      lapsCount: 15,
      bestLapTime: 95.123,
      bestLapTimeString: '1:35.123',
      position: 1,
      gridPosition: 3,
      positionGain: 2,
    },
  };

  it('renders race session row with position gain, pace badge, and handles row and button clicks', () => {
    const onSelectSession = vi.fn();
    const onOpenReplay = vi.fn();

    render(
      <table>
        <tbody>
          <SessionTableRow
            session={baseSession}
            onSelectSession={onSelectSession}
            onOpenReplay={onOpenReplay}
            showTrackColumn={true}
            paceBadge={{ category: 'Alien', percentage: 99.8 }}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('Autodromo Nazionale Monza')).toBeInTheDocument();
    expect(screen.getByText('Race 1')).toBeInTheDocument();
    expect(screen.getByText(/P1/)).toBeInTheDocument();
    expect(screen.getByText(/\(\+2\)/)).toBeInTheDocument();
    expect(screen.getByText('Porsche 963')).toBeInTheDocument();
    expect(screen.getByTestId('car-class-badge')).toBeInTheDocument();
    expect(screen.getByText('HY')).toBeInTheDocument();
    expect(screen.getByText('1:35.123')).toBeInTheDocument();
    expect(screen.getByText('Alien')).toBeInTheDocument();

    // Click analyze button (with stop propagation)
    const analyzeBtn = screen.getByRole('button', { name: /Analyze Autodromo Nazionale Monza/ });
    fireEvent.click(analyzeBtn);
    expect(onSelectSession).toHaveBeenCalledWith('session-race-1');

    // Click the entire row
    const row = screen.getByRole('row');
    fireEvent.click(row);
    expect(onSelectSession).toHaveBeenCalledTimes(2);
  });

  it('renders qualifying session with replay indicator and no track column', () => {
    const onSelectSession = vi.fn();
    const onOpenReplay = vi.fn();

    const qualiSession: SessionListItem = {
      ...baseSession,
      id: 'session-quali-1',
      sessionType: 'Qualifying',
      sessionName: 'Qualifying',
      playerDriver: {
        name: 'Player Driver',
        carType: 'BMW M Hybrid V8',
        carClass: 'Hypercar',
        lapsCount: 6,
        bestLapTime: 94.8,
        bestLapTimeString: '1:34.800',
        position: 2,
      },
      matchingReplayFile: {
        name: 'Monza_Quali_2026.Vcr',
        path: 'C:/LMU/Replays/Monza_Quali_2026.Vcr',
      },
    };

    render(
      <table>
        <tbody>
          <SessionTableRow
            session={qualiSession}
            onSelectSession={onSelectSession}
            onOpenReplay={onOpenReplay}
            showTrackColumn={false}
          />
        </tbody>
      </table>
    );

    // Track column hidden
    expect(screen.queryByText('Autodromo Nazionale Monza')).not.toBeInTheDocument();
    expect(screen.getByText('Qualifying')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText('BMW M Hybrid V8')).toBeInTheDocument();

    // Replay indicator clickable
    const replayBtn = screen.getByRole('button', { name: /Open replay telemetry/i });
    fireEvent.click(replayBtn);
    expect(onOpenReplay).toHaveBeenCalledWith('session-quali-1');
  });

  it('renders empty session badge and negative position gain', () => {
    const emptySession: SessionListItem = {
      id: 'empty-sess',
      sessionType: 'Race',
      sessionName: 'Race 2',
      timeString: '2026-07-20 17:00',
      trackVenue: 'Spa Francorchamps',
      playerDriver: {
        name: 'Player',
        carType: 'Oreca 07',
        carClass: 'LMP2',
        lapsCount: 0,
        bestLapTime: null,
        bestLapTimeString: '--:--.---',
        position: 10,
        positionGain: -4,
      },
    };

    render(
      <table>
        <tbody>
          <SessionTableRow
            session={emptySession}
            onSelectSession={vi.fn()}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('(-4)')).toBeInTheDocument();
    expect(screen.getByText('--:--.---')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
