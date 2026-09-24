import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackSessionsCard } from '../../src/components/track-detail/TrackSessionsCard';
import { SessionListItem } from '../../src/components/session-list/SessionList';

describe('TrackSessionsCard', () => {
  const baseSession: SessionListItem = {
    id: 's-1',
    sessionType: 'Race',
    sessionName: 'Race 1',
    timeString: '2026-07-20 15:30',
    playerDriver: {
      name: 'Player',
      carType: 'Ferrari 499P',
      carClass: 'Hypercar',
      lapsCount: 10,
      bestLapTime: 95.5,
      bestLapTimeString: '1:35.500',
    },
  };

  it('renders default subtitle when hideEmpty is false or emptyCount is 0', () => {
    render(
      <TrackSessionsCard
        trackName="Monza"
        sortedSessions={[baseSession]}
        totalSessionsCount={1}
        emptyCount={0}
        hideEmpty={false}
        setHideEmpty={vi.fn()}
        onSelectSession={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        sortBy="date-desc"
        setSortBy={vi.fn()}
        getPaceBadge={() => null}
      />
    );

    expect(screen.getByText('Sessions Recorded')).toBeInTheDocument();
    expect(screen.getByText('Click any session to view detailed telemetry & sector timings')).toBeInTheDocument();
  });

  it('renders singular empty notice and subtitle when hideEmpty is true and emptyCount is 1', () => {
    render(
      <TrackSessionsCard
        trackName="Monza"
        sortedSessions={[]}
        totalSessionsCount={1}
        emptyCount={1}
        hideEmpty={true}
        setHideEmpty={vi.fn()}
        onSelectSession={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        sortBy="date-desc"
        setSortBy={vi.fn()}
        getPaceBadge={() => null}
      />
    );

    expect(screen.getByText('Filtering 1 empty session')).toBeInTheDocument();
    expect(screen.getByText('1 empty session is hidden.')).toBeInTheDocument();
  });

  it('renders plural empty notice and subtitle when hideEmpty is true and emptyCount is 3', () => {
    render(
      <TrackSessionsCard
        trackName="Monza"
        sortedSessions={[]}
        totalSessionsCount={3}
        emptyCount={3}
        hideEmpty={true}
        setHideEmpty={vi.fn()}
        onSelectSession={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        sortBy="date-desc"
        setSortBy={vi.fn()}
        getPaceBadge={() => null}
      />
    );

    expect(screen.getByText('Filtering 3 empty sessions')).toBeInTheDocument();
    expect(screen.getByText('3 empty sessions are hidden.')).toBeInTheDocument();
  });
});
