import React, { useState } from 'react';
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
import { useSessionViewMode } from '../session-list/useSessionViewMode.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { useDashboardData } from './useDashboardData.js';
import type { DashboardTrends } from '../../../shared/types/dashboard.js';

export type { DashboardSortOption, SessionSummary };

export interface DashboardProps {
  sessions?: SessionSummary[];
  dataRevision?: string;
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
  sessions: legacySessions,
  dataRevision = '',
  onSelectSession,
  selectedTrack: initialSelectedTrack = 'All',
  setSelectedTrack: legacySetSelectedTrack,
  selectedCarClass: initialSelectedCarClass,
  setSelectedCarClass,
  filterType: initialFilterType = 'All',
  setFilterType: legacySetFilterType,
  searchQuery: initialSearchQuery = '',
  setSearchQuery: legacySetSearchQuery,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { viewMode: sessionViewMode, setViewMode: setSessionListViewMode } = useSessionViewMode();
  const dashboardState = useDashboardData(dataRevision, !legacySessions);
  const dashboardData = dashboardState.data;
  const sessions = legacySessions ?? [];
  const selectedCarClass = searchParams.get('carClass') || initialSelectedCarClass;
  const handleOpenReplay = (id: string) => {
    const session = sessions.find(item => item.id === id) ?? dashboardData?.sessions.find(item => item.id === id);
    const outing = dashboardData?.trends.latestOuting?.id === id ? dashboardData.trends.latestOuting : null;
    const driverOrdinal = session?.playerDriver?.driverOrdinal ?? outing?.driverOrdinal;
    const lapOrdinal = session?.playerDriver?.bestLapOrdinal ?? outing?.bestLapOrdinal;
    if (!(session?.matchingReplayFile || outing?.hasReplay) || !Number.isInteger(driverOrdinal) || !Number.isInteger(lapOrdinal)) return;
    const replayParams = new URLSearchParams(searchParams);
    replayParams.set('sessionId', id);
    replayParams.set('driverOrdinal', String(driverOrdinal));
    replayParams.set('lapOrdinal', String(lapOrdinal));
    navigate(`/telemetry?${replayParams.toString()}`);
  };
  const selectedTrack = searchParams.get('track') || initialSelectedTrack;
  const filterType = searchParams.get('type') || initialFilterType;
  const searchQuery = searchParams.get('q') || initialSearchQuery;

  const setSelectedTrack = (track: string) => {
    legacySetSelectedTrack?.(track);
    updateSearchParams(searchParams, setSearchParams, { track });
  };

  const setCarClass = (carClass: string) => {
    setSelectedCarClass(carClass);
    updateSearchParams(searchParams, setSearchParams, { carClass: carClass === 'All' ? null : carClass });
  };

  const setFilterType = (type: string) => {
    legacySetFilterType?.(type);
    updateSearchParams(searchParams, setSearchParams, { type });
  };

  const setSearchQuery = (query: string) => {
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

  const hideEmpty = searchParams.get('hideEmpty') !== 'false';
  const hasReplay = searchParams.get('hasReplay') === 'true';
  const sortBy = (searchParams.get('sort') as DashboardSortOption) || 'date-desc';

  const setSortBy = (sort: DashboardSortOption) => {
    updateSearchParams(searchParams, setSearchParams, { sort });
  };

  const setHideEmpty = (hide: boolean) => {
    updateSearchParams(searchParams, setSearchParams, { hideEmpty: hide });
  };

  const setHasReplay = (replayOnly: boolean) => {
    updateSearchParams(searchParams, setSearchParams, { hasReplay: replayOnly ? 'true' : null });
  };

  const {
    tracks,
    emptyCount,
    replayCount,
    sortedSessions,
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

  const isFiltered = selectedTrack !== 'All' || selectedCarClass !== 'All' || filterType !== 'All' || searchQuery !== '' || hasReplay;
  // One URL update: separate setters would each start from the same params and undo one another.
  const resetFilters = isFiltered
    ? () => {
    setCarClass('All');
        legacySetSelectedTrack?.('All');
        legacySetFilterType?.('All');
        legacySetSearchQuery?.('');
        updateSearchParams(searchParams, setSearchParams, { track: null, carClass: null, type: null, q: null, hasReplay: null });
      }
    : undefined;

  const sessionCards = dashboardData?.sessions ?? sortedSessions;
  const displayTracks = dashboardData?.tracks ?? tracks;
  const displayEmptyCount = dashboardData?.emptyCount ?? emptyCount;
  const displayReplayCount = dashboardData?.replayCount ?? replayCount;
  const displayMetrics = dashboardData?.metrics;
  const displayTrends = dashboardData?.trends as DashboardTrends | undefined;
  const dashboardHasSessions = (displayMetrics?.sessionsCount ?? sessions.length) > 0;
  const expandSummaries = isExpanded;
  const displayRankedTracks = displayMetrics?.rankedTracks ?? rankedTracks;
  const displayRankedCars = displayMetrics?.rankedCars ?? rankedCars;
  const displayBestRefLaps = displayMetrics?.bestTrackRefLaps ?? bestTrackRefLaps;

  return (
    <div className="space-y-6">
      {dashboardState.error && !legacySessions && <div role="alert" className="rounded-xl border border-lmu-loss/40 bg-lmu-loss/10 p-3 text-sm text-lmu-loss">{dashboardState.error}</div>}
      {/* Driver Command Center: Welcome & Latest Outing Spotlight */}
      <DashboardHero
        sessions={sessions}
        trends={displayTrends}
        onSelectSession={onSelectSession}
        onOpenReplay={handleOpenReplay}
      />

      {/* Top Aggregations & Overview Section (4 cards in the same row) */}
      {dashboardHasSessions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <CircuitsSummaryCard
            rankedTracks={displayRankedTracks} visibleTracks={expandSummaries ? displayRankedTracks : displayRankedTracks.slice(0, 3)}
            showMoreTracks={isExpanded} setShowMoreTracks={toggleExpanded}
            selectedCarClass={selectedCarClass}
          />
          <CarsSummaryCard
            rankedCars={displayRankedCars} visibleCars={expandSummaries ? displayRankedCars : displayRankedCars.slice(0, 3)}
            showMoreCars={isExpanded} setShowMoreCars={toggleExpanded}
            onSelectCar={(car) => setSearchQuery(car)}
          />
          <BenchmarkLapsSummaryCard
            rankedRefLaps={displayBestRefLaps} visibleRefLaps={expandSummaries ? displayBestRefLaps : displayBestRefLaps.slice(0, 3)}
            showMoreBenchmarks={isExpanded} setShowMoreBenchmarks={toggleExpanded}
            onSelectSession={onSelectSession}
          />
          <DrivingOverviewCard
            sessionsCount={displayMetrics?.sessionsCount ?? sessions.length} totalLaps={displayMetrics?.totalLaps ?? totalLaps}
            cleanLaps={displayMetrics?.cleanLaps ?? cleanLaps} cleanLapsPercentage={displayMetrics?.cleanLapsPercentage ?? cleanLapsPercentage}
            totalDistanceKm={displayMetrics?.totalDistanceKm ?? totalDistanceKm} totalDrivingSeconds={displayMetrics?.totalDrivingSeconds ?? totalDrivingSeconds}
            maxTopSpeed={displayMetrics?.maxTopSpeed ?? maxTopSpeed} maxTopSpeedTrack={displayMetrics?.maxTopSpeedTrack ?? maxTopSpeedTrack}
            averageBenchmarkPacePercentage={displayMetrics?.averageBenchmarkPacePercentage ?? averageBenchmarkPacePercentage}
            averageBenchmarkPaceCategory={displayMetrics?.averageBenchmarkPaceCategory ?? averageBenchmarkPaceCategory}
            practiceSessionsCount={displayMetrics?.practiceSessionsCount ?? practiceSessionsCount} qualifyingSessionsCount={displayMetrics?.qualifyingSessionsCount ?? qualifyingSessionsCount}
            raceSessionsCount={displayMetrics?.raceSessionsCount ?? raceSessionsCount} raceWinsCount={displayMetrics?.raceWinsCount ?? raceWinsCount}
            racePodiumsCount={displayMetrics?.racePodiumsCount ?? racePodiumsCount} totalPitStops={displayMetrics?.totalPitStops ?? totalPitStops}
            showMore={isExpanded} setShowMore={toggleExpanded}
          />
        </div>
      )}

      {/* Sessions View */}
      <div className="space-y-4">
        <div className="bg-lmu-card border border-lmu-border rounded-2xl overflow-hidden">
          <DashboardFilterBar
            tracks={displayTracks}
            selectedTrack={selectedTrack}
            setSelectedTrack={setSelectedTrack}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setCarClass}
            filterType={filterType}
            setFilterType={setFilterType}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            hideEmpty={hideEmpty}
            setHideEmpty={setHideEmpty}
            emptyCount={displayEmptyCount}
            hasReplay={hasReplay}
            setHasReplay={setHasReplay}
            replayCount={displayReplayCount}
            sortBy={sortBy}
            setSortBy={setSortBy}
            embedded
            viewToggle={<SessionViewModeToggle viewMode={sessionViewMode} onViewModeChange={setSessionListViewMode} />}
            onClearFilters={resetFilters}
          />
          <SessionList
            sessions={sessionCards}
            onSelectSession={onSelectSession}
            onOpenReplay={handleOpenReplay}
            showTrackColumn={true}
            viewMode={sessionViewMode}
            onViewModeChange={setSessionListViewMode}
            hideHeader
            serverPaginated={Boolean(dashboardData)}
            totalCount={dashboardData?.total}
            className="p-5"
            onResetFilters={resetFilters}
            hideEmptyNotice={hideEmpty && displayEmptyCount > 0 ? (
              <span>
                Note: {displayEmptyCount} empty session{displayEmptyCount > 1 ? 's are' : ' is'} hidden. <button onClick={() => setHideEmpty(false)} className={`text-lmu-accent-text underline hover:text-white ${FOCUS_RING}`}>Click here to show empty results</button>.
              </span>
            ) : undefined}
          />
        </div>
      </div>
    </div>
  );
};
