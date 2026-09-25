import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { SessionList } from '../session-list/SessionList.js';
import { SessionViewModeToggle } from '../session-list/SessionListHeader.js';
import { updateSearchParams } from '../../utils/urlParams.js';
import { CircuitsSummaryCard } from './CircuitsSummaryCard.js';
import { CarsSummaryCard } from './CarsSummaryCard.js';
import { BenchmarkLapsSummaryCard } from './BenchmarkLapsSummaryCard.js';
import { DrivingOverviewCard } from './DrivingOverviewCard.js';
import { DashboardHero } from './DashboardHero.js';
import { DashboardFilterBar, DashboardSortOption } from './DashboardFilterBar.js';
import { useDashboardMetrics } from './useDashboardMetrics.js';
import { SessionSummary } from './dashboardTypes.js';

export type { DashboardSortOption, SessionSummary };

export interface DashboardProps {
  sessions: SessionSummary[];
  onSelectSession: (id: string) => void;
  selectedTrack?: string;
  setSelectedTrack?: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  filterType?: string;
  setFilterType?: (type: string) => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  sessions,
  onSelectSession,
  selectedTrack: initialSelectedTrack = 'All',
  setSelectedTrack: legacySetSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  filterType: initialFilterType = 'All',
  setFilterType: legacySetFilterType,
  searchQuery: initialSearchQuery = '',
  setSearchQuery: legacySetSearchQuery,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionViewMode, setSessionViewMode] = useState<'grid' | 'table'>(() => {
    const queryView = searchParams.get('view');
    if (queryView === 'grid' || queryView === 'table') return queryView;
    if (typeof window !== 'undefined') {
      const savedView = localStorage.getItem('lmu_dashboard_view');
      if (savedView === 'grid' || savedView === 'table') return savedView;
    }
    return 'grid';
  });
  const setSessionListViewMode = (mode: 'grid' | 'table') => {
    setSessionViewMode(mode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('lmu_dashboard_view', mode);
      } catch {}
    }
    updateSearchParams(searchParams, setSearchParams, { view: mode });
  };
  const handleOpenReplay = (id: string) => {
    const session = sessions.find(item => item.id === id);
    if (!session?.matchingReplayFile) return;
    const replayParams = new URLSearchParams(searchParams);
    replayParams.set('replayName', session.matchingReplayFile.name);
    replayParams.set('lap', '1');
    navigate(`/telemetry?${replayParams.toString()}`);
  };
  const [selectedTrack, setSelectedTrackState] = useState<string>(
    () => searchParams.get('track') || initialSelectedTrack
  );
  const [filterType, setFilterTypeState] = useState<string>(
    () => searchParams.get('type') || initialFilterType
  );
  const [searchQuery, setSearchQueryState] = useState<string>(
    () => searchParams.get('q') || initialSearchQuery
  );

  useEffect(() => {
    setSelectedTrackState(searchParams.get('track') || initialSelectedTrack);
    setFilterTypeState(searchParams.get('type') || initialFilterType);
    setSearchQueryState(searchParams.get('q') || initialSearchQuery);
  }, [initialFilterType, initialSearchQuery, initialSelectedTrack, searchParams]);

  const setSelectedTrack = (track: string) => {
    setSelectedTrackState(track);
    legacySetSelectedTrack?.(track);
    updateSearchParams(searchParams, setSearchParams, { track });
  };

  const setFilterType = (type: string) => {
    setFilterTypeState(type);
    legacySetFilterType?.(type);
    updateSearchParams(searchParams, setSearchParams, { type });
  };

  const setSearchQuery = (query: string) => {
    setSearchQueryState(query);
    legacySetSearchQuery?.(query);
    updateSearchParams(searchParams, setSearchParams, { q: query });
  };

  const toggleExpanded = (val?: boolean | ((prev: boolean) => boolean)) => {
    if (typeof val === 'boolean') {
      setIsExpanded(val);
    } else if (typeof val === 'function') {
      setIsExpanded(val);
    } else {
      setIsExpanded((prev) => !prev);
    }
  };

  const [hideEmpty, setHideEmptyState] = useState<boolean>(searchParams.get('hideEmpty') !== 'false');
  const [hasReplay, setHasReplayState] = useState<boolean>(searchParams.get('hasReplay') === 'true');
  const [sortBy, setSortByState] = useState<DashboardSortOption>(
    (searchParams.get('sort') as DashboardSortOption) || 'date-desc'
  );

  const setSortBy = (sort: DashboardSortOption) => {
    setSortByState(sort);
    updateSearchParams(searchParams, setSearchParams, { sort });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateSearchParams(searchParams, setSearchParams, { hideEmpty: hide });
  };

  const setHasReplay = (replayOnly: boolean) => {
    setHasReplayState(replayOnly);
    updateSearchParams(searchParams, setSearchParams, { hasReplay: replayOnly ? 'true' : null });
  };

  const {
    tracks,
    emptyCount,
    replayCount,
    sortedSessions,
    visibleTracks,
    visibleCars,
    visibleRefLaps,
    totalLaps,
    cleanLaps,
    cleanLapsPercentage,
    totalDistanceKm,
    totalDrivingSeconds,
    maxTopSpeed,
    maxTopSpeedTrack,
    averageBenchmarkPacePercentage,
    averageBenchmarkPaceCategory,
    practiceSessionsCount,
    qualifyingSessionsCount,
    raceSessionsCount,
    raceWinsCount,
    racePodiumsCount,
    totalPitStops,
    rankedTracks,
    rankedCars,
    bestTrackRefLaps,
  } = useDashboardMetrics({
    sessions,
    selectedTrack,
    selectedCarClass,
    filterType,
    searchQuery,
    hideEmpty,
    hasReplay,
    sortBy,
    isExpanded,
  });

  return (
    <div className="space-y-6">
      {/* Driver Command Center: Welcome & Latest Outing Spotlight */}
      <DashboardHero
        sessions={sessions}
        onSelectSession={onSelectSession}
        onOpenReplay={handleOpenReplay}
      />

      {/* Top Aggregations & Overview Section (4 cards in the same row) */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <CircuitsSummaryCard
            rankedTracks={rankedTracks} visibleTracks={visibleTracks}
            showMoreTracks={isExpanded} setShowMoreTracks={toggleExpanded}
            selectedCarClass={selectedCarClass}
          />
          <CarsSummaryCard
            rankedCars={rankedCars} visibleCars={visibleCars}
            showMoreCars={isExpanded} setShowMoreCars={toggleExpanded}
            onSelectCar={(car) => setSearchQuery(car)}
          />
          <BenchmarkLapsSummaryCard
            rankedRefLaps={bestTrackRefLaps} visibleRefLaps={visibleRefLaps}
            showMoreBenchmarks={isExpanded} setShowMoreBenchmarks={toggleExpanded}
            onSelectSession={onSelectSession}
          />
          <DrivingOverviewCard
            sessionsCount={sessions.length} totalLaps={totalLaps}
            cleanLaps={cleanLaps} cleanLapsPercentage={cleanLapsPercentage}
            totalDistanceKm={totalDistanceKm} totalDrivingSeconds={totalDrivingSeconds}
            maxTopSpeed={maxTopSpeed} maxTopSpeedTrack={maxTopSpeedTrack}
            averageBenchmarkPacePercentage={averageBenchmarkPacePercentage}
            averageBenchmarkPaceCategory={averageBenchmarkPaceCategory}
            practiceSessionsCount={practiceSessionsCount} qualifyingSessionsCount={qualifyingSessionsCount}
            raceSessionsCount={raceSessionsCount} raceWinsCount={raceWinsCount}
            racePodiumsCount={racePodiumsCount} totalPitStops={totalPitStops}
            showMore={isExpanded} setShowMore={toggleExpanded}
          />
        </div>
      )}

      {/* Sessions View */}
      <div className="space-y-4">
        <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] rounded-2xl overflow-hidden">
          <DashboardFilterBar
            tracks={tracks}
            selectedTrack={selectedTrack}
            setSelectedTrack={setSelectedTrack}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
            filterType={filterType}
            setFilterType={setFilterType}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            hideEmpty={hideEmpty}
            setHideEmpty={setHideEmpty}
            emptyCount={emptyCount}
            hasReplay={hasReplay}
            setHasReplay={setHasReplay}
            replayCount={replayCount}
            sortBy={sortBy}
            setSortBy={setSortBy}
            embedded
            viewToggle={<SessionViewModeToggle viewMode={sessionViewMode} onViewModeChange={setSessionListViewMode} />}
          />
          <SessionList
            sessions={sortedSessions}
            onSelectSession={onSelectSession}
            onOpenReplay={handleOpenReplay}
            showTrackColumn={true}
            viewMode={sessionViewMode}
            onViewModeChange={setSessionListViewMode}
            hideHeader
            className="p-5"
            onResetFilters={(selectedTrack !== 'All' || selectedCarClass !== 'All' || filterType !== 'All' || searchQuery !== '') ? () => {
              setSelectedTrack('All');
              setSelectedCarClass('All');
              setFilterType('All');
              setSearchQuery('');
            } : undefined}
            hideEmptyNotice={hideEmpty && emptyCount > 0 ? (
              <span>
                Note: {emptyCount} empty session{emptyCount > 1 ? 's are' : ' is'} hidden. <button onClick={() => setHideEmpty(false)} className="text-lmu-accent underline hover:text-white">Click here to show empty results</button>.
              </span>
            ) : undefined}
          />
        </div>
      </div>
    </div>
  );
};
