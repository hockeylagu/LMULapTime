import React from 'react';
import { Link } from 'react-router';
import { formatTime, matchesSessionType, compareSessions, compareSessionsBySortOption, isSessionEmpty } from '../../../shared/domain/formatters.js';
import { matchesCarClass, matchesSessionCarClass, normalizeCarClass } from '../../../shared/domain/paceCategory.js';
import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';
import { ImprovementChart, SessionProgressionPoint } from './improvement-chart/index.js';
import { TrackDetailHeader } from './TrackDetailHeader.js';
import { TrackSessionsCard } from './TrackSessionsCard.js';
import { TrackDetailSortOption } from './TrackSessionsToolbar.js';
import { SessionMeta, getPaceCategoryForLap, getSessionBestLapPace, buildTrackProgression } from './trackDetailHelpers.js';
import { useTrackDetailState } from './useTrackDetailState.js';
import { useSessionViewMode } from '../session-list/useSessionViewMode.js';
import { LoadingState } from '../common/index.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { linkClickHandler } from '../../utils/linkClick.js';

export type { TrackDetailSortOption };

export interface TrackDetailProps {
  trackName: string;
  onBack: () => void;
  onSelectSession: (sessionId: string) => void;
  onOpenReplay?: (sessionId: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  progression?: SessionProgressionPoint[];
  trackGeometry?: import('../replay/map/index.js').TrackBoundaryGeometry | null;
}

export const TrackDetail: React.FC<TrackDetailProps> = ({
  trackName,
  onBack,
  onSelectSession,
  onOpenReplay,
  selectedCarClass,
  setSelectedCarClass,
  progression = [],
  trackGeometry,
}) => {
  const { viewMode: sessionViewMode, setViewMode: setSessionListViewMode } = useSessionViewMode();
  const {
    loading,
    data,
    error,
    retry,
    hideEmpty,
    setHideEmpty,
    hasReplay,
    setHasReplay,
    resetSessionFilters,
    selectedCarModel,
    setSelectedCarModel,
    filterType,
    setFilterType,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    handleOpenReplay,
    progressionPage,
    setProgressionPage,
  } = useTrackDetailState(trackName, selectedCarClass);

  const selectedClass = selectedCarClass;
  const setSelectedClass = (carClass: string) => setSelectedCarClass(carClass);

  if (loading) {
    return (
      <LoadingState
        title="Loading Circuit Intelligence"
        subtitle="Loading circuit telemetry and benchmark targets..."
        dataTestId="track-detail-loading"
      />
    );
  }

  if (!data) {
    return (
      <div role={error ? 'alert' : 'status'} className="py-12 text-center text-lmu-muted bg-lmu-card border border-lmu-border rounded-2xl">
        <p className="text-lg font-bold text-white mb-3">{error ? 'Unable to load track details' : 'Track Not Found'}</p>
        {error && <p className="text-xs mb-4 px-6 break-words">{error}</p>}
        {error && <button type="button" onClick={retry} className="px-4 py-2 mr-3 bg-lmu-raised text-lmu-text rounded-xl text-xs focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2">Try again</button>}
        <Link
          to="/tracks"
          onClick={linkClickHandler(() => onBack())}
          className="inline-block px-4 py-2 bg-lmu-accent text-white rounded-xl font-medium text-xs uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2"
        >
          Return to Tracks
        </Link>
      </div>
    );
  }

  const hasServerContract = Boolean(data.filters);
  const availableCarModels = data.filters?.carModels ?? [...new Set(data.sessions.filter(session => matchesSessionCarClass(session, selectedClass))
    .map(session => session.playerDriver?.carType).filter((car): car is string => Boolean(car)))].sort();
  const classTrackSessions = data.sessions.filter(session => matchesSessionCarClass(session, selectedClass) &&
    (selectedCarModel === 'All' || session.playerDriver?.carType === selectedCarModel));
  const emptyCount = data.filters?.emptyCount ?? classTrackSessions.filter(isSessionEmpty).length;
  const replayCount = data.filters?.replayCount ?? classTrackSessions.filter(session => Boolean(session.matchingReplayFile)).length;
  const filteredSessions = hasServerContract ? data.sessions : classTrackSessions.filter(session =>
    matchesSessionType(session.sessionType, session.sessionName, filterType) &&
    (!searchQuery || session.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.filename.toLowerCase().includes(searchQuery.toLowerCase()) || session.playerDriver?.name?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!hideEmpty || !isSessionEmpty(session)) && (!hasReplay || Boolean(session.matchingReplayFile)));
  const findBenchmarkForClass = (carClass?: string, carType?: string): ReferenceLaptimeEntry | null => {
    if (!carClass && !carType) return null;
    const sessionClass = normalizeCarClass(carClass, carType);
    return data.benchmarks.find(
      (benchmark) =>
        matchesCarClass(benchmark.carClass, benchmark.carClass, sessionClass) ||
        matchesCarClass(sessionClass, sessionClass, benchmark.carClass)
    ) || null;
  };
  const sortedSessions = hasServerContract ? filteredSessions : [...filteredSessions].sort((a, b) => compareSessionsBySortOption(a, b, sortBy, {
    getPacePercentage: session => getSessionBestLapPace(session.playerDriver, findBenchmarkForClass(session.playerDriver?.carClass, session.playerDriver?.carType))?.percentage,
  }));

  const latestSession = [...classTrackSessions].sort((a, b) => compareSessions(a, b, 'desc'))[0];
  const currentBenchmark = selectedClass && selectedClass !== 'All'
    ? data.benchmarks.find((benchmark) => matchesCarClass(benchmark.carClass, benchmark.carClass, selectedClass)) || null
    : findBenchmarkForClass(data.latestSession?.carClass ?? latestSession?.playerDriver?.carClass ?? data.summary?.bestLapClass,
      data.latestSession?.carType ?? latestSession?.playerDriver?.carType ?? data.summary?.bestLapCar);
  const fallbackBest = classTrackSessions.reduce<SessionMeta | null>((best, session) => {
    const time = session.playerDriver?.bestLapTime;
    return time && (!best?.playerDriver?.bestLapTime || time < best.playerDriver.bestLapTime) ? session : best;
  }, null);
  const averagePosition = (kind: string) => {
    const positions = classTrackSessions.filter(session => matchesSessionType(session.sessionType, session.sessionName, kind))
      .map(session => session.playerDriver?.position).filter((position): position is number => typeof position === 'number' && position > 0);
    return positions.length ? positions.reduce((sum, position) => sum + position, 0) / positions.length : null;
  };
  const fallbackProgression = buildTrackProgression(filteredSessions, data.sessions, progression);
  const trackProgression = (data.progression?.points ?? fallbackProgression).map((point) => {
    const paceInfo = point.bestLapWet ? null : getPaceCategoryForLap(
      point.bestLapTime,
      findBenchmarkForClass(point.carClass, point.carType)
    );

    return {
      ...point,
      benchmarkCategory: paceInfo?.category ?? null,
      benchmarkPercentage: paceInfo?.percentage ?? null,
    };
  });

  const bestLapSec = data.summary?.bestLapTime ?? fallbackBest?.playerDriver?.bestLapTime ?? null;
  const bestLapCar = data.summary?.bestLapCar ?? fallbackBest?.playerDriver?.carType;
  const bestLapClass = data.summary?.bestLapClass ?? fallbackBest?.playerDriver?.carClass;
  const paceInfo = data.summary?.bestLapWet ?? fallbackBest?.playerDriver?.bestLapWet
    ? null : getPaceCategoryForLap(bestLapSec, findBenchmarkForClass(bestLapClass, bestLapCar));
  const qualifyingAveragePosition = data.positions?.qualifyingAveragePosition ?? averagePosition('Qualifying');
  const finishAveragePosition = data.positions?.finishAveragePosition ?? averagePosition('Race');
  const currentClassDriverStats = {
    bestTimeStr: bestLapSec ? formatTime(bestLapSec) : '--:--.---',
    bestPaceCat: paceInfo?.category || null,
    bestPacePct: paceInfo?.percentage || null,
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-lmu-warn-strong/40 bg-lmu-warn-strong/10 text-sm">
          <p className="text-lmu-warn-soft">Track data could not be refreshed: {error}</p>
          <button type="button" onClick={retry} className={`text-xs font-bold text-lmu-info hover:text-lmu-info-soft whitespace-nowrap ${FOCUS_RING}`}>Try again</button>
        </div>
      )}
      <TrackDetailHeader
        trackName={trackName}
        trackCourse={data.latestSession?.trackCourse ?? data.sessions[0]?.trackCourse}
        sessionsCount={data.total ?? data.sessionsCount}
        onBack={onBack}
        selectedClass={selectedClass}
        setSelectedClass={setSelectedClass}
        selectedCarModel={selectedCarModel}
        setSelectedCarModel={setSelectedCarModel}
        availableCarModels={availableCarModels}
        currentBenchmark={currentBenchmark}
        bestLapTimeString={bestLapSec ? formatTime(bestLapSec) : null}
        bestLapCar={bestLapCar}
        xmlTrackLengthMeters={data.latestSession?.trackLengthMeters ?? data.sessions[0]?.trackLengthMeters}
        trackGeometry={trackGeometry}
      />

      <ImprovementChart
        progression={trackProgression}
        selectedTrack={trackName}
        setSelectedTrack={() => {}}
        selectedCarClass={selectedCarClass}
        setSelectedCarClass={setSelectedCarClass}
        selectedCarModel={selectedCarModel}
        filterType={filterType}
        searchQuery={searchQuery}
        tracks={[trackName]}
        hideEmpty={hideEmpty}
        embedded={true}
        onSelectSession={onSelectSession}
        yourBest={{
          timeStr: currentClassDriverStats.bestTimeStr,
          paceCat: currentClassDriverStats.bestPaceCat,
          pacePct: currentClassDriverStats.bestPacePct,
        }}
        qualifyingAveragePosition={qualifyingAveragePosition}
        finishAveragePosition={finishAveragePosition}
      />

      <TrackSessionsCard
        trackName={trackName}
        sortedSessions={sortedSessions}
        totalSessionsCount={data.total ?? filteredSessions.length}
        emptyCount={emptyCount}
        hideEmpty={hideEmpty}
        setHideEmpty={setHideEmpty}
        hasReplay={hasReplay}
        setHasReplay={setHasReplay}
        replayCount={replayCount}
        onSelectSession={onSelectSession}
        onOpenReplay={onOpenReplay || handleOpenReplay}
        filterType={filterType}
        setFilterType={setFilterType}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        getPaceBadge={(s) =>
          s.playerDriver?.bestLapWet
            ? { wet: true }
            : getPaceCategoryForLap(s.playerDriver?.bestLapTime || null, findBenchmarkForClass(s.playerDriver?.carClass, s.playerDriver?.carType))
        }
        viewMode={sessionViewMode}
        onViewModeChange={setSessionListViewMode}
        serverPaginated
        totalCount={data.total ?? filteredSessions.length}
        onClearFilters={selectedCarModel !== 'All' || filterType !== 'All' || searchQuery !== '' || hasReplay ? () => resetSessionFilters() : undefined}
        onResetFilters={
          selectedCarModel !== 'All' || filterType !== 'All' || searchQuery !== '' || hasReplay || (hideEmpty && emptyCount > 0)
            ? () => resetSessionFilters(true)
            : undefined
        }
      />
      {data.progression && data.progression.total > data.progression.pageSize && (
        <div className="flex items-center justify-center gap-3 text-xs text-lmu-muted">
          <button type="button" disabled={progressionPage <= 1} onClick={() => setProgressionPage(progressionPage - 1)} className="rounded-lg border border-lmu-border px-3 py-1.5 disabled:opacity-40">Older points</button>
          <span>Progression page {data.progression.page} of {Math.max(1, Math.ceil(data.progression.total / data.progression.pageSize))} · {data.progression.total} sessions</span>
          <button type="button" disabled={progressionPage >= Math.ceil(data.progression.total / data.progression.pageSize)} onClick={() => setProgressionPage(progressionPage + 1)} className="rounded-lg border border-lmu-border px-3 py-1.5 disabled:opacity-40">Newer points</button>
        </div>
      )}
    </div>
  );
};
