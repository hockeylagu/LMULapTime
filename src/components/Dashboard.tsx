import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { SessionList } from './SessionList';
import { getHashRouteAndParams, updateHashParams } from '../utils/urlParams';
import { LapData, PaceCategory } from '../../server/types';
import { CircuitsSummaryCard } from './dashboard/CircuitsSummaryCard';
import { CarsSummaryCard } from './dashboard/CarsSummaryCard';
import { BenchmarkLapsSummaryCard } from './dashboard/BenchmarkLapsSummaryCard';
import { DrivingOverviewCard } from './dashboard/DrivingOverviewCard';
import { DashboardFilterBar, DashboardSortOption } from './dashboard/DashboardFilterBar';
import { useDashboardMetrics } from './dashboard/useDashboardMetrics';

export type { DashboardSortOption };

export interface SessionSummary {
  id: string;
  filename: string;
  trackVenue: string;
  trackCourse?: string;
  trackLengthMeters?: number | null;
  timeString: string;
  sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown';
  sessionName: string;
  weatherInfo?: string;
  driversCount: number;
  playerDriver?: {
    name: string;
    carType: string;
    carClass?: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    theoreticalBest: number | null;
    theoreticalBestString: string;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    avgLapTime?: number | null;
    top3LapsCount?: number;
    position?: number;
    lapsCount: number;
    laps?: LapData[];
  };
  bestSessionLap?: {
    driverName: string;
    carType: string;
    lapTime: number;
    lapTimeString: string;
  };
  matchingReplayFile?: {
    name: string;
    path: string;
  };
}

interface DashboardProps {
  sessions: SessionSummary[];
  onSelectSession: (id: string) => void;
  selectedTrack: string;
  setSelectedTrack: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  filterType: string;
  setFilterType: (type: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  sessions,
  onSelectSession,
  selectedTrack,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
}) => {
  const [showMoreTracks, setShowMoreTracks] = useState<boolean>(false);
  const [showMoreCars, setShowMoreCars] = useState<boolean>(false);
  const [showMoreBenchmarks, setShowMoreBenchmarks] = useState<boolean>(false);

  const { params: initialParams } = getHashRouteAndParams();
  const [hideEmpty, setHideEmptyState] = useState<boolean>(initialParams.get('hideEmpty') !== 'false');
  const [sortBy, setSortByState] = useState<DashboardSortOption>(
    (initialParams.get('sort') as DashboardSortOption) || 'date-desc'
  );

  const setSortBy = (sort: DashboardSortOption) => {
    setSortByState(sort);
    updateHashParams({ sort });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateHashParams({ hideEmpty: hide });
  };

  const {
    tracks,
    emptyCount,
    sortedSessions,
    visibleTracks,
    visibleCars,
    visibleRefLaps,
    totalLaps,
    totalDistanceKm,
    totalDrivingSeconds,
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
    sortBy,
    showMoreTracks,
    showMoreCars,
    showMoreBenchmarks,
  });

  return (
    <div className="space-y-6">
      {/* Top Aggregations & Overview Section (4 cards in the same row) */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <CircuitsSummaryCard
            rankedTracks={rankedTracks}
            visibleTracks={visibleTracks}
            showMoreTracks={showMoreTracks}
            setShowMoreTracks={setShowMoreTracks}
          />
          <CarsSummaryCard
            rankedCars={rankedCars}
            visibleCars={visibleCars}
            showMoreCars={showMoreCars}
            setShowMoreCars={setShowMoreCars}
            onSelectCar={(car) => setSearchQuery(car)}
          />
          <BenchmarkLapsSummaryCard
            rankedRefLaps={bestTrackRefLaps}
            visibleRefLaps={visibleRefLaps}
            showMoreBenchmarks={showMoreBenchmarks}
            setShowMoreBenchmarks={setShowMoreBenchmarks}
            onSelectSession={onSelectSession}
          />
          <DrivingOverviewCard
            sessionsCount={sessions.length}
            totalLaps={totalLaps}
            totalDistanceKm={totalDistanceKm}
            totalDrivingSeconds={totalDrivingSeconds}
            uniqueCircuitsCount={rankedTracks.length}
          />
        </div>
      )}

      {/* Sessions View */}
      <div className="space-y-4">
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
          sortBy={sortBy}
          setSortBy={setSortBy}
        />

        <div className="glass-panel rounded-2xl p-5">
          <SessionList
            sessions={sortedSessions}
            onSelectSession={onSelectSession}
            showTrackColumn={true}
            headerTitle={
              <>
                <FileText className="w-5 h-5 text-lmu-accent" />
                <span>Session Results ({sortedSessions.length}{hideEmpty && emptyCount > 0 ? ` / ${sessions.length}` : ''})</span>
              </>
            }
            headerSubtitle={
              hideEmpty && emptyCount > 0 ? `Filtering ${emptyCount} empty session${emptyCount > 1 ? 's' : ''}` : 'Click any session to view detailed telemetry & sector timings'
            }
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
