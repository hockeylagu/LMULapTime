import React, { useState } from 'react';
import { formatTime, getDisplayTrackName, matchesSessionType, compareSessions } from '../utils/formatters';
import { matchesCarClass } from '../utils/paceCategory';
import { PaceCategory } from '../../server/types.js';
import { ImprovementHeader } from './improvement-chart/ImprovementHeader';
import { ImprovementStatsBanner } from './improvement-chart/ImprovementStatsBanner';
import { ImprovementChartControls, ImprovementMetric } from './improvement-chart/ImprovementChartControls';
import { ImprovementPaceChart } from './improvement-chart/ImprovementPaceChart';

export type TimeRangeFilter = 'all' | 'last-5' | 'last-10' | 'last-20' | 'week' | 'month' | 'year';

export interface SessionProgressionPoint {
  sessionId: string;
  timestamp: number;
  dateString: string;
  sessionType: string;
  sessionName?: string;
  trackVenue: string;
  trackCourse?: string;
  displayTrack?: string;
  weatherInfo?: string;
  carType: string;
  carClass: string;
  driverName: string;
  bestLapTime: number | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  cleanLapsCount: number;
  totalLapsCount: number;
  avgLapTime: number | null;
  top3AvgLapTime?: number | null;
  consistencyScore?: number | null;
  theoreticalGap?: number | null;
  matchingReplayFile?: string;
}

interface ImprovementChartProps {
  progression: SessionProgressionPoint[];
  selectedTrack: string;
  setSelectedTrack: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  selectedCarModel?: string;
  filterType?: string;
  searchQuery?: string;
  tracks: string[];
  hideEmpty?: boolean;
  setHideEmpty?: (hide: boolean) => void;
  embedded?: boolean;
  yourBest?: {
    timeStr: string;
    paceCat?: PaceCategory | null;
    pacePct?: number | null;
  };
  onSelectSession?: (sessionId: string) => void;
  timeRange?: TimeRangeFilter;
  onTimeRangeChange?: (range: TimeRangeFilter) => void;
}

export const ImprovementChart: React.FC<ImprovementChartProps> = ({
  progression,
  selectedTrack,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  selectedCarModel = 'All',
  filterType = 'All',
  searchQuery = '',
  tracks = [],
  hideEmpty = true,
  embedded = false,
  yourBest,
  onSelectSession,
  timeRange,
  onTimeRangeChange,
}) => {
  const [metric, setMetric] = useState<ImprovementMetric>('bestLap');
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRangeFilter>('all');
  const activeRange = timeRange !== undefined ? timeRange : internalTimeRange;
  const setRange = onTimeRangeChange || setInternalTimeRange;

  const activeTrack = selectedTrack === 'All' && tracks.length > 0 ? tracks[0] : selectedTrack;
  const rawTrackData = progression.filter((p) => {
    const display = (p.displayTrack || getDisplayTrackName(p.trackVenue, p.trackCourse) || p.trackVenue).toLowerCase().trim();
    const pVenue = (p.trackVenue || '').toLowerCase().trim();
    const activeNorm = activeTrack.toLowerCase().trim();
    const isTrackMatch =
      activeTrack === 'All' ||
      display === activeNorm ||
      pVenue === activeNorm ||
      (activeNorm.length > 3 && pVenue.includes(activeNorm)) ||
      (pVenue.length > 3 && activeNorm.includes(pVenue));

    const matchesClass = matchesCarClass(p.carClass, p.carType, selectedCarClass);
    const matchesModel = !selectedCarModel || selectedCarModel === 'All' || p.carType === selectedCarModel;
    const matchesType = matchesSessionType(p.sessionType, p.sessionName, filterType);

    const q = (searchQuery || '').toLowerCase().trim();
    const matchesSearch =
      q === '' ||
      p.carType.toLowerCase().includes(q) ||
      p.driverName.toLowerCase().includes(q) ||
      p.sessionType.toLowerCase().includes(q) ||
      (p.sessionName || '').toLowerCase().includes(q) ||
      (p.weatherInfo || '').toLowerCase().includes(q);

    return isTrackMatch && matchesClass && matchesModel && matchesType && matchesSearch;
  });

  const allTrackData = rawTrackData
    .filter((p) => !hideEmpty || (p.totalLapsCount > 0 && p.bestLapTime !== null))
    .sort((a, b) => compareSessions(a, b, 'asc'));

  const trackData = (() => {
    if (activeRange === 'all') return allTrackData;
    if (activeRange.startsWith('last-')) {
      const count = parseInt(activeRange.replace('last-', ''), 10);
      return allTrackData.slice(-count);
    }

    if (allTrackData.length === 0) return [];
    const validTimestamps = allTrackData.map((p) => p.timestamp).filter((t) => !isNaN(t) && t > 0);
    if (validTimestamps.length === 0) return allTrackData;
    const latestTimestamp = Math.max(...validTimestamps);

    const durationDays = activeRange === 'week' ? 7 : activeRange === 'month' ? 30 : activeRange === 'year' ? 365 : 0;
    if (durationDays === 0) return allTrackData;

    const cutoff = latestTimestamp - durationDays * 24 * 60 * 60 * 1000;
    const filtered = allTrackData.filter((p) => p.timestamp >= cutoff);
    return filtered.length > 0 ? filtered : allTrackData;
  })();

  const sessionsWithValidLaps = trackData.filter((p) => p.bestLapTime !== null && p.bestLapTime > 0);
  const firstValidSession = sessionsWithValidLaps[0];
  const bestLapTimeInTrack =
    sessionsWithValidLaps.length > 0 ? Math.min(...sessionsWithValidLaps.map((p) => p.bestLapTime as number)) : null;
  const totalImprovement =
    firstValidSession?.bestLapTime && bestLapTimeInTrack !== null && sessionsWithValidLaps.length > 1
      ? firstValidSession.bestLapTime - bestLapTimeInTrack
      : null;

  const validTop3 = trackData.filter((p) => p.top3AvgLapTime !== null && p.top3AvgLapTime !== undefined && p.top3AvgLapTime > 0);
  const firstTop3 = validTop3[0]?.top3AvgLapTime ?? null;
  const bestTop3 = validTop3.length > 0 ? Math.min(...validTop3.map((p) => p.top3AvgLapTime as number)) : null;
  const top3Improvement = firstTop3 !== null && bestTop3 !== null && validTop3.length > 1 ? firstTop3 - bestTop3 : null;

  const latestTheoreticalGap = trackData.length > 0 ? trackData[trackData.length - 1].theoreticalGap ?? null : null;

  const chartData = trackData.map((p, index) => {
    let movingAvg: number | null = null;
    const windowStart = Math.max(0, index - 2);
    const windowSessions = trackData.slice(windowStart, index + 1).filter((w) => w.bestLapTime !== null && w.bestLapTime > 0);
    if (windowSessions.length > 0) {
      const sum = windowSessions.reduce((acc, curr) => acc + (curr.bestLapTime as number), 0);
      movingAvg = parseFloat((sum / windowSessions.length).toFixed(3));
    }

    const shortSession = p.sessionName || p.sessionType.slice(0, 4);
    const dateFormatted = p.dateString.split(' ')[0] || p.dateString;
    const uniqueKey = `${dateFormatted} ${shortSession} #${index + 1}`;

    return {
      chartKey: uniqueKey,
      shortSession,
      fullDate: p.dateString,
      sessionId: p.sessionId,
      session: p.sessionName ? `${p.sessionType} (${p.sessionName})` : p.sessionType,
      car: p.carType,
      weather: p.weatherInfo,
      bestLap: p.bestLapTime,
      top3Avg: p.top3AvgLapTime ?? null,
      top3AvgStr: p.top3AvgLapTime ? formatTime(p.top3AvgLapTime) : null,
      movingAvg,
      avgLap: p.avgLapTime,
      theoretical: p.theoreticalBest,
      theoreticalGap: p.theoreticalGap ?? null,
      consistencyScore: p.consistencyScore ?? null,
      s1: p.bestS1,
      s2: p.bestS2,
      s3: p.bestS3,
      lapStr: formatTime(p.bestLapTime),
      theoreticalStr: formatTime(p.theoreticalBest),
      avgLapStr: formatTime(p.avgLapTime),
      cleanLaps: p.cleanLapsCount,
      replay: p.matchingReplayFile,
    };
  });

  const validTimes = (
    metric === 'sectors'
      ? trackData.flatMap((p) => [p.bestS1, p.bestS2, p.bestS3])
      : metric === 'theoretical'
      ? [...trackData.flatMap((p) => [p.bestLapTime, p.theoreticalBest]), ...chartData.map((c) => c.movingAvg)]
      : metric === 'consistency'
      ? chartData.map((c) => c.consistencyScore).filter((c): c is number => c !== null && c > 0)
      : [...trackData.flatMap((p) => [p.bestLapTime, p.avgLapTime, p.top3AvgLapTime]), ...chartData.map((c) => c.movingAvg)]
  ).filter((t): t is number => t !== null && t !== undefined && !isNaN(t) && t > 0);

  const minTime =
    metric === 'consistency'
      ? validTimes.length > 0
        ? Math.max(70, Math.floor(Math.min(...validTimes) - 2))
        : 80
      : validTimes.length > 0
      ? Math.max(0, Math.floor(Math.min(...validTimes) - 2))
      : 0;

  const maxTime =
    metric === 'consistency' ? 100 : validTimes.length > 0 ? Math.ceil(Math.max(...validTimes) + 2) : 100;

  return (
    <div className="space-y-6">
      <ImprovementHeader
        embedded={embedded}
        activeTrack={activeTrack}
        tracks={tracks}
        setSelectedTrack={setSelectedTrack}
        selectedCarClass={selectedCarClass}
        setSelectedCarClass={setSelectedCarClass}
      />

      {trackData.length > 0 && (
        <ImprovementStatsBanner
          trackDataCount={trackData.length}
          selectedCarModel={selectedCarModel}
          selectedCarClass={selectedCarClass}
          yourBest={yourBest}
          bestLapTimeInTrack={bestLapTimeInTrack}
          totalImprovement={totalImprovement}
          firstValidSessionBestLap={firstValidSession?.bestLapTime ?? null}
          sessionsWithValidLapsCount={sessionsWithValidLaps.length}
          top3Improvement={top3Improvement}
          bestTop3={bestTop3}
          latestTheoreticalGap={latestTheoreticalGap}
        />
      )}

      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <ImprovementChartControls
          activeTrack={activeTrack}
          displayedSessionsCount={trackData.length}
          totalSessionsCount={allTrackData.length}
          activeRange={activeRange}
          setRange={setRange}
          metric={metric}
          setMetric={setMetric}
        />

        <ImprovementPaceChart
          chartData={chartData}
          metric={metric}
          minTime={minTime}
          maxTime={maxTime}
          activeTrack={activeTrack}
          selectedCarClass={selectedCarClass}
          selectedCarModel={selectedCarModel}
          filterType={filterType}
          activeRange={activeRange}
          onSelectSession={onSelectSession}
        />
      </div>
    </div>
  );
};
