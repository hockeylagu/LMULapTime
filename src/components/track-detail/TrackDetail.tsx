import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { formatTime, matchesSessionType, getSessionTypeSortRank, compareSessions, isSessionEmpty } from '../../utils/formatters.js';
import { matchesCarClass, matchesSessionCarClass, normalizeCarClass } from '../../utils/paceCategory.js';
import { updateSearchParams } from '../../utils/urlParams.js';
import { ReferenceLaptimeEntry } from '../../../server/core/types';
import { ImprovementChart, SessionProgressionPoint } from './improvement-chart/index.js';
import { TrackDetailHeader } from './TrackDetailHeader.js';
import { TrackSessionsCard } from './TrackSessionsCard.js';
import { TrackDetailSortOption } from './TrackSessionsToolbar.js';
import { SessionMeta, getPaceCategoryForLap, buildTrackProgression } from './trackDetailHelpers.js';

export type { TrackDetailSortOption };

export interface TrackDetailProps {
  trackName: string;
  onBack: () => void;
  onSelectSession: (sessionId: string) => void;
  onOpenReplay?: (sessionId: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  progression?: SessionProgressionPoint[];
}

export const TrackDetail: React.FC<TrackDetailProps> = ({
  trackName,
  onBack,
  onSelectSession,
  onOpenReplay,
  selectedCarClass,
  setSelectedCarClass,
  progression = [],
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState<boolean>(true);
  const [hideEmpty, setHideEmptyState] = useState<boolean>(searchParams.get('hideEmpty') !== 'false');
  const [selectedCarModel, setSelectedCarModelState] = useState<string>(searchParams.get('model') || 'All');
  const [filterType, setFilterTypeState] = useState<string>(searchParams.get('type') || 'All');
  const [searchQuery, setSearchQueryState] = useState<string>(searchParams.get('q') || '');
  const [sortBy, setSortByState] = useState<TrackDetailSortOption>(
    (searchParams.get('sort') as TrackDetailSortOption) || 'date-desc'
  );
  const [data, setData] = useState<{
    trackName: string;
    normalizedTrackName: string;
    sessionsCount: number;
    sessions: SessionMeta[];
    benchmarks: ReferenceLaptimeEntry[];
  } | null>(null);

  const selectedClass = selectedCarClass;
  const setSelectedClass = setSelectedCarClass;
  const handleOpenReplay = (sessionId: string) => {
    const session = data?.sessions.find(item => item.id === sessionId);
    if (!session?.matchingReplayFile) return;
    const replayParams = new URLSearchParams(searchParams);
    replayParams.set('replayName', session.matchingReplayFile.name);
    replayParams.set('lap', '1');
    navigate(`/telemetry?${replayParams.toString()}`);
  };

  const setSortBy = (val: TrackDetailSortOption) => {
    setSortByState(val);
    updateSearchParams(searchParams, setSearchParams, { sort: val });
  };

  const setSelectedCarModel = (model: string) => {
    setSelectedCarModelState(model);
    updateSearchParams(searchParams, setSearchParams, { model });
  };

  const setFilterType = (type: string) => {
    setFilterTypeState(type);
    updateSearchParams(searchParams, setSearchParams, { type });
  };

  const setSearchQuery = (q: string) => {
    setSearchQueryState(q);
    updateSearchParams(searchParams, setSearchParams, { q });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateSearchParams(searchParams, setSearchParams, { hideEmpty: hide });
  };

  useEffect(() => {
    // Skip the no-op reset so this doesn't race with the carClass URL update happening the same tick.
    if (selectedCarModel !== 'All') setSelectedCarModel('All');
  }, [selectedClass]);

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/track/${encodeURIComponent(trackName)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((resData) => {
        if (!isCurrent) return;
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        if (!isCurrent || err?.name === 'AbortError') return;
        console.error('Failed to fetch track details:', err);
        setLoading(false);
      });
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [trackName]);

  if (loading) {
    return (
      <div className="py-20 text-center text-lmu-muted glass-panel rounded-2xl">
        <div className="inline-block animate-spin w-8 h-8 border-4 border-lmu-accent border-t-transparent rounded-full mb-3" />
        <p className="text-sm font-medium">Loading circuit telemetry and benchmark targets...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center text-lmu-muted glass-panel rounded-2xl">
        <p className="text-lg font-bold text-white mb-3">Track Not Found</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-lmu-accent text-white rounded-xl font-medium text-xs uppercase"
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

  const filteredSessions = classTrackSessions.filter((s) => {
    const matchesType = matchesSessionType(s.sessionType, s.sessionName, filterType);
    const matchesSearch =
      searchQuery === '' ||
      s.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.playerDriver?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEmpty = !hideEmpty || !isSessionEmpty(s);
    return matchesType && matchesSearch && matchesEmpty;
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
    if (!lapTime || (best?.playerDriver?.bestLapTime && best.playerDriver.bestLapTime <= lapTime)) return best;
    return session;
  }, null);
  const bestLapBenchmark = findBenchmarkForClass(
    bestLapSession?.playerDriver?.carClass,
    bestLapSession?.playerDriver?.carType
  );

  const averagePosition = (sessions: SessionMeta[]): number | null => {
    const positions = sessions
      .map((session) => session.playerDriver?.position)
      .filter((position): position is number => typeof position === 'number' && position > 0);
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

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (sortBy === 'date-desc' || sortBy === 'date-asc') {
      return compareSessions(a, b, sortBy === 'date-desc' ? 'desc' : 'asc');
    }
    if (sortBy === 'pos-asc') {
      const typeRankA = getSessionTypeSortRank(a.sessionType, a.sessionName);
      const typeRankB = getSessionTypeSortRank(b.sessionType, b.sessionName);
      if (typeRankA !== typeRankB) return typeRankA - typeRankB;
      const posA = a.playerDriver?.position && a.playerDriver.position > 0 ? a.playerDriver.position : 9999;
      const posB = b.playerDriver?.position && b.playerDriver.position > 0 ? b.playerDriver.position : 9999;
      if (posA !== posB) return posA - posB;
      return compareSessions(a, b, 'desc');
    }
    if (sortBy === 'lap-asc') {
      const lapA = a.playerDriver?.bestLapTime && a.playerDriver.bestLapTime > 0 ? a.playerDriver.bestLapTime : 999999;
      const lapB = b.playerDriver?.bestLapTime && b.playerDriver.bestLapTime > 0 ? b.playerDriver.bestLapTime : 999999;
      if (lapA !== lapB) return lapA - lapB;
      return compareSessions(a, b, 'desc');
    }
    const paceA = getPaceCategoryForLap(
      a.playerDriver?.bestLapTime || null,
      findBenchmarkForClass(a.playerDriver?.carClass, a.playerDriver?.carType)
    );
    const paceB = getPaceCategoryForLap(
      b.playerDriver?.bestLapTime || null,
      findBenchmarkForClass(b.playerDriver?.carClass, b.playerDriver?.carType)
    );
    const pctA = paceA?.percentage ?? 999;
    const pctB = paceB?.percentage ?? 999;
    if (pctA !== pctB) {
      return sortBy === 'pace-asc' ? pctA - pctB : pctB - pctA;
    }
    return compareSessions(a, b, 'desc');
  });

  const trackProgression = buildTrackProgression(filteredSessions, data.sessions, progression).map((point) => {
    const paceInfo = getPaceCategoryForLap(
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

  const paceInfo = getPaceCategoryForLap(bestLapSec, bestLapBenchmark);
  const currentClassDriverStats = {
    bestTimeStr: bestLapSec ? formatTime(bestLapSec) : '--:--.---',
    bestPaceCat: paceInfo?.category || null,
    bestPacePct: paceInfo?.percentage || null,
  };

  return (
    <div className="space-y-6">
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
        onSelectSession={onSelectSession}
        onOpenReplay={onOpenReplay || handleOpenReplay}
        filterType={filterType}
        setFilterType={setFilterType}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        getPaceBadge={(s) =>
          getPaceCategoryForLap(
            s.playerDriver?.bestLapTime || null,
            findBenchmarkForClass(s.playerDriver?.carClass, s.playerDriver?.carType)
          )
        }
        onResetFilters={
          filterType !== 'All' || searchQuery !== '' || (hideEmpty && emptyCount > 0)
            ? () => {
                setFilterType('All');
                setSearchQuery('');
                setHideEmpty(false);
                setSelectedCarModel('All');
              }
            : undefined
        }
      />
    </div>
  );
};
