import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackSessionsCard } from '../../../src/components/track-detail/TrackSessionsCard';
import { SessionListItem } from '../../../src/components/session-list/SessionList';

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

  it('renders the session controls without a results heading or subtitle', () => {
    render(
      <TrackSessionsCard
        trackName="Monza"
        sortedSessions={[baseSession]}
        totalSessionsCount={1}
        emptyCount={0}
        hideEmpty={false}
        setHideEmpty={vi.fn()}
        hasReplay={false}
        setHasReplay={vi.fn()}
        replayCount={1}
        onSelectSession={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        sortBy="date-desc"
        setSortBy={vi.fn()}
        getPaceBadge={() => null}
        viewMode="table"
        onViewModeChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Sessions Recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('Click any session to view detailed telemetry & sector timings')).not.toBeInTheDocument();
  });

  it('renders singular empty notice when hideEmpty is true and emptyCount is 1', () => {
    render(
      <TrackSessionsCard
        trackName="Monza"
        sortedSessions={[]}
        totalSessionsCount={1}
        emptyCount={1}
        hideEmpty={true}
        setHideEmpty={vi.fn()}
        hasReplay={false}
        setHasReplay={vi.fn()}
        replayCount={1}
        onSelectSession={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        sortBy="date-desc"
        setSortBy={vi.fn()}
        getPaceBadge={() => null}
        viewMode="table"
        onViewModeChange={vi.fn()}
      />
    );

    expect(screen.getByText('1 empty session is hidden.')).toBeInTheDocument();
  });

  it('renders plural empty notice when hideEmpty is true and emptyCount is 3', () => {
    render(
      <TrackSessionsCard
        trackName="Monza"
        sortedSessions={[]}
        totalSessionsCount={3}
        emptyCount={3}
        hideEmpty={true}
        setHideEmpty={vi.fn()}
        hasReplay={false}
        setHasReplay={vi.fn()}
        replayCount={1}
        onSelectSession={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
        sortBy="date-desc"
        setSortBy={vi.fn()}
        getPaceBadge={() => null}
        viewMode="table"
        onViewModeChange={vi.fn()}
      />
    );

    expect(screen.getByText('3 empty sessions are hidden.')).toBeInTheDocument();
  });
});
