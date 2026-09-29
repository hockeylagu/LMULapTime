import React, { useState } from 'react';
import { matchesSessionType, compareSessions } from '../../../../shared/domain/formatters.js';
import { matchesCarClass, matchesTrack } from '../../../../shared/domain/paceCategory.js';
import { PaceCategory } from '../../../../shared/types/index.js';
import { ImprovementHeader } from './ImprovementHeader.js';
import { ImprovementStatsBanner } from './ImprovementStatsBanner.js';
import { ImprovementChartControls, ImprovementMetric, TimeRangeFilter } from './ImprovementChartControls.js';
import { ImprovementPaceChart } from './ImprovementPaceChart.js';

export type { TimeRangeFilter, ImprovementMetric };

export { buildPersonalBestSeries, calculateLapPrDelta } from './improvementChartUtils.js';
import { buildPersonalBestSeries } from './improvementChartUtils.js';
import { buildImprovementChartRows, getImprovementAxisBounds } from './improvementChartRows.js';
import type { SessionProgressionPoint } from './improvementChartTypes.js';

export type { SessionProgressionPoint };

export interface ImprovementChartProps {
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
  qualifyingAveragePosition?: number | null;
  finishAveragePosition?: number | null;
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
  qualifyingAveragePosition,
  finishAveragePosition,
  onSelectSession,
  timeRange,
  onTimeRangeChange,
}) => {
  const [metric, setMetric] = useState<ImprovementMetric>('bestLap');
  const personalBestEnabled = selectedCarClass !== 'All';
  const displayedMetric = !personalBestEnabled && metric === 'bestPr' ? 'bestLap' : metric;
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRangeFilter>('all');
  const activeRange = timeRange !== undefined ? timeRange : internalTimeRange;
  const setRange = onTimeRangeChange || setInternalTimeRange;

  const activeTrack = selectedTrack === 'All' && tracks.length > 0 ? tracks[0] : selectedTrack;
  const rawTrackData = progression.filter((p) => {
    const isTrackMatch = matchesTrack(activeTrack, p.trackVenue, p.trackCourse);

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
  const personalBestSeries = buildPersonalBestSeries(trackData.map((p) => p.bestLapTime));
  const chartData = buildImprovementChartRows(trackData, personalBestSeries);
  const { minTime, maxTime } = getImprovementAxisBounds(displayedMetric, trackData, chartData);

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
          qualifyingAveragePosition={qualifyingAveragePosition}
          finishAveragePosition={finishAveragePosition}
        />
      )}

      <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-6 rounded-2xl space-y-4">
        <ImprovementChartControls
          activeTrack={activeTrack}
          displayedSessionsCount={trackData.length}
          totalSessionsCount={allTrackData.length}
          activeRange={activeRange}
          setRange={setRange}
          metric={displayedMetric}
          setMetric={setMetric}
          personalBestEnabled={personalBestEnabled}
        />

        <ImprovementPaceChart
          chartData={chartData}
          metric={displayedMetric}
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
