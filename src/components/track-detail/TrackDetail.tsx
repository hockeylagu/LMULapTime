import React from 'react';
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
  } = useTrackDetailState(trackName, selectedCarClass);

  const selectedClass = selectedCarClass;
  const setSelectedClass = setSelectedCarClass;

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
        <button
          onClick={onBack}
          className="px-4 py-2 bg-lmu-accent text-white rounded-xl font-medium text-xs uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2"
        >
          Return to Tracks
        </button>
      </div>
    );
  }

  const availableCarModels = Array.from(
    new Set(
      data.sessions
        .filter((s) => matchesSessionCarClass(s, selectedClass))
        .map((s) => s.playerDriver?.carType)
        .filter(Boolean)
    )
  ).sort() as string[];

  const classTrackSessions = data.sessions.filter((s) => {
    const matchesClass = matchesSessionCarClass(s, selectedClass);
    const matchesModel = selectedCarModel === 'All' || s.playerDriver?.carType === selectedCarModel;
    return matchesClass && matchesModel;
  });

  const emptyCount = classTrackSessions.filter((s) => isSessionEmpty(s)).length;
  const replayCount = data.sessions.filter((s) => Boolean(s.matchingReplayFile)).length;

  const filteredSessions = classTrackSessions.filter((s) => {
    const matchesType = matchesSessionType(s.sessionType, s.sessionName, filterType);
    const matchesSearch =
      searchQuery === '' ||
      s.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.playerDriver?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEmpty = !hideEmpty || !isSessionEmpty(s);
    const matchesReplay = !hasReplay || Boolean(s.matchingReplayFile);
    return matchesType && matchesSearch && matchesEmpty && matchesReplay;
  });

  const findBenchmarkForClass = (carClass?: string, carType?: string): ReferenceLaptimeEntry | null => {
    if (!carClass && !carType) return null;
    const sessionClass = normalizeCarClass(carClass, carType);
    return data.benchmarks.find(
      (benchmark) =>
        matchesCarClass(benchmark.carClass, benchmark.carClass, sessionClass) ||
        matchesCarClass(sessionClass, sessionClass, benchmark.carClass)
    ) || null;
  };

  const latestSession = [...classTrackSessions].sort((a, b) => compareSessions(a, b, 'desc'))[0];
  const currentBenchmark = selectedClass && selectedClass !== 'All'
    ? data.benchmarks.find((benchmark) => matchesCarClass(benchmark.carClass, benchmark.carClass, selectedClass)) || null
    : findBenchmarkForClass(latestSession?.playerDriver?.carClass, latestSession?.playerDriver?.carType);

  const bestLapSession = classTrackSessions.reduce<SessionMeta | null>((best, session) => {
    const lapTime = session.playerDriver?.bestLapTime;
    if (!lapTime || !Number.isFinite(lapTime) || lapTime <= 0 || (best?.playerDriver?.bestLapTime && best.playerDriver.bestLapTime <= lapTime)) return best;
    return session;
  }, null);
  const bestLapBenchmark = findBenchmarkForClass(
    bestLapSession?.playerDriver?.carClass,
    bestLapSession?.playerDriver?.carType
  );

  const averagePosition = (sessions: SessionMeta[]): number | null => {
    const positions = sessions
      .map((session) => session.playerDriver?.position)
      .filter((position): position is number => typeof position === 'number' && Number.isFinite(position) && position > 0);
    return positions.length > 0
      ? positions.reduce((total, position) => total + position, 0) / positions.length
      : null;
  };
  const qualifyingSessions = classTrackSessions.filter((session) =>
    matchesSessionType(session.sessionType, session.sessionName, 'Qualifying')
  );
  const raceSessions = classTrackSessions.filter((session) =>
    matchesSessionType(session.sessionType, session.sessionName, 'Race')
  );
  const qualifyingAveragePosition = averagePosition(qualifyingSessions);
  const finishAveragePosition = averagePosition(raceSessions);

  const sortedSessions = [...filteredSessions].sort((a, b) =>
    compareSessionsBySortOption(a, b, sortBy, {
      getPacePercentage: (s) =>
        getSessionBestLapPace(s.playerDriver, findBenchmarkForClass(s.playerDriver?.carClass, s.playerDriver?.carType))?.percentage,
    })
  );

  const trackProgression = buildTrackProgression(filteredSessions, data.sessions, progression).map((point) => {
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

  const bestLapSec = bestLapSession?.playerDriver?.bestLapTime || null;

  const paceInfo = getSessionBestLapPace(bestLapSession?.playerDriver, bestLapBenchmark);
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
        trackCourse={data.sessions[0]?.trackCourse}
        sessionsCount={filteredSessions.length}
        onBack={onBack}
        selectedClass={selectedClass}
        setSelectedClass={setSelectedClass}
        selectedCarModel={selectedCarModel}
        setSelectedCarModel={setSelectedCarModel}
        availableCarModels={availableCarModels}
        currentBenchmark={currentBenchmark}
        bestLapTimeString={bestLapSession?.playerDriver?.bestLapTimeString}
        bestLapCar={bestLapSession?.playerDriver?.carType}
        xmlTrackLengthMeters={data.sessions[0]?.trackLengthMeters}
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
        totalSessionsCount={classTrackSessions.length}
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
        onClearFilters={selectedCarModel !== 'All' || filterType !== 'All' || searchQuery !== '' || hasReplay ? () => resetSessionFilters() : undefined}
        onResetFilters={
          selectedCarModel !== 'All' || filterType !== 'All' || searchQuery !== '' || hasReplay || (hideEmpty && emptyCount > 0)
            ? () => resetSessionFilters(true)
            : undefined
        }
      />
    </div>
  );
};
