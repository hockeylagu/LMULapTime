import { useMemo } from 'react';
import { isSessionEmpty, getDisplayTrackName, matchesSessionType, compareSessions } from '../../utils/formatters.js';
import { matchesCarClass, matchesTrack } from '../../utils/paceCategory.js';
import { DetailedSession } from '../../../server/types.js';
import { BestRefLapInfo } from './BenchmarkLapsSummaryCard.js';
import { DashboardSortOption } from './DashboardFilterBar.js';
import { SessionSummary } from '../Dashboard.js';

export type DashboardSessionItem = SessionSummary | DetailedSession;

export interface UseDashboardMetricsParams {
  sessions: DashboardSessionItem[];
  selectedTrack: string;
  selectedCarClass: string;
  filterType: string;
  searchQuery: string;
  hideEmpty: boolean;
  sortBy: DashboardSortOption;
  showMoreTracks: boolean;
  showMoreCars: boolean;
  showMoreBenchmarks: boolean;
}

export function useDashboardMetrics({
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
      const isMatchingCarClass = matchesCarClass(
        s.playerDriver?.carClass || '',
        s.playerDriver?.carType || '',
        selectedCarClass
      );
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
    let totalDistanceKm = 0;
    let totalDrivingSeconds = 0;
    const trackLapsMap: Record<string, number> = {};
    const carLapsMap: Record<string, number> = {};
    const uniqueTrackRefLapsMap: Record<string, BestRefLapInfo> = {};

    for (const s of sessions) {
      const p = s.playerDriver;
      if (!p) continue;

      const completedLapsCount =
        p.laps && p.laps.length > 0
          ? p.laps.filter((l) => l.lapTime !== null && l.lapTime > 0).length
          : p.lapsCount || 0;

      totalLaps += completedLapsCount;

      const trackMeters = s.trackLengthMeters || 5000;
      totalDistanceKm += (trackMeters / 1000) * completedLapsCount;

      if (p.laps && p.laps.length > 0) {
        for (const lap of p.laps) {
          if (lap.lapTime && lap.lapTime > 0) {
            totalDrivingSeconds += lap.lapTime;
          }
        }
      } else if (p.avgLapTime && completedLapsCount > 0) {
        totalDrivingSeconds += p.avgLapTime * completedLapsCount;
      }

      if (s.trackVenue && completedLapsCount > 0) {
        trackLapsMap[s.trackVenue] = (trackLapsMap[s.trackVenue] || 0) + completedLapsCount;
      }

      if (p.carType && completedLapsCount > 0) {
        carLapsMap[p.carType] = (carLapsMap[p.carType] || 0) + completedLapsCount;
      }

      if (p.bestLapPacePercentage && p.bestLapPaceCategory && p.bestLapTimeString) {
        const track = getDisplayTrackName(s.trackVenue, s.trackCourse);
        const currentBest = uniqueTrackRefLapsMap[track];
        if (!currentBest || p.bestLapPacePercentage < currentBest.percentage) {
          uniqueTrackRefLapsMap[track] = {
            sessionId: s.id,
            percentage: p.bestLapPacePercentage,
            category: p.bestLapPaceCategory,
            lapTimeString: p.bestLapTimeString,
            track,
            car: p.carType,
          };
        }
      }
    }

    const rankedTracks = Object.entries(trackLapsMap)
      .map(([track, laps]) => ({ track, laps }))
      .sort((a, b) => b.laps - a.laps);

    const rankedCars = Object.entries(carLapsMap)
      .map(([car, laps]) => ({ car, laps }))
      .sort((a, b) => b.laps - a.laps);

    const bestTrackRefLaps = Object.values(uniqueTrackRefLapsMap).sort((a, b) => a.percentage - b.percentage);

    return {
      totalLaps,
      totalDistanceKm,
      totalDrivingSeconds,
      rankedTracks,
      rankedCars,
      bestTrackRefLaps,
    };
  }, [sessions]);

  const visibleTracks = useMemo(
    () => (showMoreTracks ? metrics.rankedTracks : metrics.rankedTracks.slice(0, 3)),
    [showMoreTracks, metrics.rankedTracks]
  );

  const visibleCars = useMemo(
    () => (showMoreCars ? metrics.rankedCars : metrics.rankedCars.slice(0, 3)),
    [showMoreCars, metrics.rankedCars]
  );

  const visibleRefLaps = useMemo(
    () => (showMoreBenchmarks ? metrics.bestTrackRefLaps : metrics.bestTrackRefLaps.slice(0, 3)),
    [showMoreBenchmarks, metrics.bestTrackRefLaps]
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
