import { useMemo } from 'react';
import { isSessionEmpty, getDisplayTrackName, matchesSessionType, compareSessions } from '../../utils/formatters.js';
import { matchesSessionCarClass, matchesTrack } from '../../utils/paceCategory.js';
import { DetailedSession } from '../../../server/types.js';
import { BestRefLapInfo } from './BenchmarkLapsSummaryCard.js';
import { DashboardSortOption } from './DashboardFilterBar.js';
import { SessionSummary } from './Dashboard.js';

export type DashboardSessionItem = SessionSummary | DetailedSession;

export interface UseDashboardMetricsParams {
  sessions: DashboardSessionItem[];
  selectedTrack: string;
  selectedCarClass: string;
  filterType: string;
  searchQuery: string;
  hideEmpty: boolean;
  sortBy: DashboardSortOption;
  showMoreTracks?: boolean;
  showMoreCars?: boolean;
  showMoreBenchmarks?: boolean;
  isExpanded?: boolean;
}

export function useDashboardMetrics({
  sessions,
  selectedTrack,
  selectedCarClass,
  filterType,
  searchQuery,
  hideEmpty,
  sortBy,
  showMoreTracks = false,
  showMoreCars = false,
  showMoreBenchmarks = false,
  isExpanded,
}: UseDashboardMetricsParams) {
  const tracks = useMemo(() => {
    return Array.from(new Set(sessions.map((s) => getDisplayTrackName(s.trackVenue, s.trackCourse))))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const emptyCount = useMemo(() => sessions.filter((s) => isSessionEmpty(s)).length, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const displayTrack = getDisplayTrackName(s.trackVenue, s.trackCourse);
      const isTrackMatch = matchesTrack(selectedTrack, s.trackVenue, s.trackCourse);
      const matchesType = matchesSessionType(s.sessionType, s.sessionName, filterType);
      const isMatchingCarClass = matchesSessionCarClass(s, selectedCarClass);
      const matchesSearch =
        searchQuery === '' ||
        displayTrack.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.trackVenue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.filename.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEmpty = !hideEmpty || !isSessionEmpty(s);
      return isTrackMatch && matchesType && isMatchingCarClass && matchesSearch && matchesEmpty;
    });
  }, [sessions, selectedTrack, filterType, selectedCarClass, searchQuery, hideEmpty]);

  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      if (sortBy === 'date-desc' || sortBy === 'date-asc') {
        return compareSessions(a, b, sortBy === 'date-desc' ? 'desc' : 'asc');
      }
      if (sortBy === 'pos-asc') {
        const posA = a.playerDriver?.position && a.playerDriver.position > 0 ? a.playerDriver.position : 9999;
        const posB = b.playerDriver?.position && b.playerDriver.position > 0 ? b.playerDriver.position : 9999;
        if (posA !== posB) return posA - posB;
        return compareSessions(a, b, 'desc');
      }
      const pctA = a.playerDriver?.bestLapPacePercentage ?? 999;
      const pctB = b.playerDriver?.bestLapPacePercentage ?? 999;
      if (pctA !== pctB) {
        return sortBy === 'pace-asc' ? pctA - pctB : pctB - pctA;
      }
      return compareSessions(a, b, 'desc');
    });
  }, [filteredSessions, sortBy]);

  const metrics = useMemo(() => {
    let totalLaps = 0;
    let cleanLaps = 0;
    let totalDistanceKm = 0;
    let totalDrivingSeconds = 0;
    let maxTopSpeed = 0;
    let maxTopSpeedTrack = '';
    let practiceSessionsCount = 0;
    let qualifyingSessionsCount = 0;
    let raceSessionsCount = 0;
    let raceWinsCount = 0;
    let racePodiumsCount = 0;
    let totalPitStops = 0;
    const trackLapsMap: Record<string, number> = {};
    const carLapsMap: Record<string, number> = {};
    const uniqueTrackRefLapsMap: Record<string, BestRefLapInfo> = {};

    for (const s of sessions) {
      if (matchesSessionType(s.sessionType, s.sessionName, 'Race')) {
        raceSessionsCount++;
        if (s.playerDriver?.position === 1) {
          raceWinsCount++;
        }
        if (s.playerDriver?.position && s.playerDriver.position <= 3 && s.playerDriver.position > 0) {
          racePodiumsCount++;
        }
      } else if (matchesSessionType(s.sessionType, s.sessionName, 'Qualifying')) {
        qualifyingSessionsCount++;
      } else {
        practiceSessionsCount++;
      }

      const p = s.playerDriver;
      if (!p) continue;

      const completedLapsCount =
        p.laps && p.laps.length > 0
          ? p.laps.filter((l) => l.lapTime !== null && l.lapTime > 0).length
          : p.lapsCount || 0;

      totalLaps += completedLapsCount;

      const trackMeters = s.trackLengthMeters || 5000;
      totalDistanceKm += (trackMeters / 1000) * completedLapsCount;
      const displayTrack = getDisplayTrackName(s.trackVenue, s.trackCourse);

      if (p.laps && p.laps.length > 0) {
        for (const lap of p.laps) {
          if (lap.lapTime && lap.lapTime > 0) {
            totalDrivingSeconds += lap.lapTime;
            if (lap.isValid !== false && !lap.isPitStop) {
              cleanLaps++;
            }
          }
          if (lap.isPitStop) {
            totalPitStops++;
          }
          if (lap.topSpeed && lap.topSpeed > maxTopSpeed) {
            maxTopSpeed = lap.topSpeed;
            maxTopSpeedTrack = displayTrack;
          }
        }
      } else if (p.avgLapTime && completedLapsCount > 0) {
        totalDrivingSeconds += p.avgLapTime * completedLapsCount;
        cleanLaps += completedLapsCount;
      }

      if (displayTrack && completedLapsCount > 0) {
        trackLapsMap[displayTrack] = (trackLapsMap[displayTrack] || 0) + completedLapsCount;
      }

      if (p.carType && completedLapsCount > 0) {
        carLapsMap[p.carType] = (carLapsMap[p.carType] || 0) + completedLapsCount;
      }

      if (p.bestLapPacePercentage && p.bestLapPaceCategory && p.bestLapTimeString) {
        const currentBest = uniqueTrackRefLapsMap[displayTrack];
        if (!currentBest || p.bestLapPacePercentage < currentBest.percentage) {
          uniqueTrackRefLapsMap[displayTrack] = {
            sessionId: s.id,
            percentage: p.bestLapPacePercentage,
            category: p.bestLapPaceCategory,
            lapTimeString: p.bestLapTimeString,
            track: displayTrack,
            car: p.carType,
          };
        }
      }
    }

    const cleanLapsPercentage = totalLaps > 0 ? Math.round((cleanLaps / totalLaps) * 1000) / 10 : 0;
    const averageSpeedKmh = totalDrivingSeconds > 0 ? Math.round(totalDistanceKm / (totalDrivingSeconds / 3600)) : 0;

    const rankedTracks = Object.entries(trackLapsMap)
      .map(([track, laps]) => ({ track, laps }))
      .sort((a, b) => b.laps - a.laps);

    const rankedCars = Object.entries(carLapsMap)
      .map(([car, laps]) => ({ car, laps }))
      .sort((a, b) => b.laps - a.laps);

    const bestTrackRefLaps = Object.values(uniqueTrackRefLapsMap).sort((a, b) => a.percentage - b.percentage);

    return {
      totalLaps,
      cleanLaps,
      cleanLapsPercentage,
      totalDistanceKm,
      totalDrivingSeconds,
      maxTopSpeed,
      maxTopSpeedTrack,
      averageSpeedKmh,
      practiceSessionsCount,
      qualifyingSessionsCount,
      raceSessionsCount,
      raceWinsCount,
      racePodiumsCount,
      totalPitStops,
      rankedTracks,
      rankedCars,
      bestTrackRefLaps,
    };
  }, [sessions]);

  const expandTracks = isExpanded !== undefined ? isExpanded : showMoreTracks;
  const expandCars = isExpanded !== undefined ? isExpanded : showMoreCars;
  const expandBenchmarks = isExpanded !== undefined ? isExpanded : showMoreBenchmarks;

  const visibleTracks = useMemo(
    () => (expandTracks ? metrics.rankedTracks : metrics.rankedTracks.slice(0, 3)),
    [expandTracks, metrics.rankedTracks]
  );

  const visibleCars = useMemo(
    () => (expandCars ? metrics.rankedCars : metrics.rankedCars.slice(0, 3)),
    [expandCars, metrics.rankedCars]
  );

  const visibleRefLaps = useMemo(
    () => (expandBenchmarks ? metrics.bestTrackRefLaps : metrics.bestTrackRefLaps.slice(0, 3)),
    [expandBenchmarks, metrics.bestTrackRefLaps]
  );

  return {
    tracks,
    emptyCount,
    sortedSessions,
    visibleTracks,
    visibleCars,
    visibleRefLaps,
    ...metrics,
  };
}
