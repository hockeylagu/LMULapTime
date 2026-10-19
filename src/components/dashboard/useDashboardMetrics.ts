import { useMemo } from 'react';
import { driverLapsCount, isSessionEmpty, getDisplayTrackName, compareSessionsBySortOption } from '../../../shared/domain/formatters.js';
import { averageQualifiedBenchmarkPace, matchesTrack, getPaceCategoryFromPercentage, type BenchmarkPaceGroup } from '../../../shared/domain/paceCategory.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { matchesSessionCarClass } from '../../../shared/domain/vehicleMapping.js';
import { selectCleanLapCandidates } from '../../../shared/domain/lapComparison.js';
import { DetailedSession } from '../../../shared/types/index.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import { BestRefLapInfo } from './BenchmarkLapsSummaryCard.js';
import { DashboardSortOption } from './dashboardSortOptions.js';
import type { DashboardTrackFilter } from '../../../shared/types/dashboard.js';

export interface UseDashboardMetricsParams {
  sessions: (SessionCard | DetailedSession)[];
  selectedTrack: string;
  selectedCarClass: string;
  filterType: string;
  searchQuery: string;
  hideEmpty: boolean;
  hasReplay?: boolean;
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
  hasReplay = false,
  sortBy,
  showMoreTracks = false,
  showMoreCars = false,
  showMoreBenchmarks = false,
  isExpanded,
}: UseDashboardMetricsParams) {
  const tracks = useMemo(() => {
    const options = new Map<string, DashboardTrackFilter>();
    for (const session of sessions) {
      const track = getDisplayTrackName(session.trackVenue, session.trackCourse);
      if (track) options.set(track, {
        track, trackVenue: session.trackVenue, trackCourse: session.trackCourse ?? '',
      });
    }
    return [...options.values()].sort((a, b) => a.track.localeCompare(b.track) || a.trackVenue.localeCompare(b.trackVenue) || a.trackCourse.localeCompare(b.trackCourse));
  }, [sessions]);

  const emptyCount = useMemo(() => sessions.filter((s) => isSessionEmpty(s)).length, [sessions]);
  const replayCount = useMemo(() => sessions.filter((s) => Boolean(s.matchingReplayFile)).length, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const displayTrack = getDisplayTrackName(s.trackVenue, s.trackCourse);
      const isTrackMatch = matchesTrack(selectedTrack, s.trackVenue, s.trackCourse);
      const matchesType = filterType === 'All' || s.sessionType === filterType;
      const isMatchingCarClass = matchesSessionCarClass(s, selectedCarClass);
      const matchesSearch =
        searchQuery === '' ||
        displayTrack.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.trackVenue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.filename.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEmpty = !hideEmpty || !isSessionEmpty(s);
      const matchesReplay = !hasReplay || Boolean(s.matchingReplayFile);
      return isTrackMatch && matchesType && isMatchingCarClass && matchesSearch && matchesEmpty && matchesReplay;
    });
  }, [sessions, selectedTrack, filterType, selectedCarClass, searchQuery, hideEmpty, hasReplay]);

  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => compareSessionsBySortOption(a, b, sortBy));
  }, [filteredSessions, sortBy]);

  const metrics = useMemo(() => {
    let totalLaps = 0;
    let cleanLaps = 0;
    let totalDistanceKm = 0;
    let totalDrivingSeconds = 0;
    let maxTopSpeed = 0;
    let maxTopSpeedTrack = '';
    let maxTopSpeedCar = '';
    let practiceSessionsCount = 0;
    let qualifyingSessionsCount = 0;
    let raceSessionsCount = 0;
    let raceWinsCount = 0;
    let racePodiumsCount = 0;
    let totalPitStops = 0;
    const benchmarkPaceGroups = new Map<string, BenchmarkPaceGroup>();
    const trackLapsMap: Record<string, { track: string; trackVenue: string; trackCourse: string; laps: number }> = {};
    const trackKmMap: Record<string, number> = {};
    const carLapsMap: Record<string, number> = {};
    const carKmMap: Record<string, number> = {};
    const uniqueTrackRefLapsMap: Record<string, BestRefLapInfo> = {};

    for (const s of sessions) {
      if (s.sessionType === 'Race') {
        raceSessionsCount++;
        if (s.playerDriver?.position === 1) {
          raceWinsCount++;
        }
        if (s.playerDriver?.position && s.playerDriver.position <= 3 && s.playerDriver.position > 0) {
          racePodiumsCount++;
        }
      } else if (s.sessionType === 'Qualifying') {
        qualifyingSessionsCount++;
      } else if (s.sessionType === 'Practice') {
        practiceSessionsCount++;
      }

      const p = s.playerDriver;
      if (!p) continue;

      const laps = 'laps' in p ? p.laps : undefined;
      const completedLapsCount =
        laps && laps.length > 0
          ? laps.filter((l) => l.lapTime !== null && l.lapTime > 0).length
          : driverLapsCount(p);

      totalLaps += completedLapsCount;

      const trackMeters = s.trackLengthMeters || 5000;
      totalDistanceKm += (trackMeters / 1000) * completedLapsCount;
      const displayTrack = getDisplayTrackName(s.trackVenue, s.trackCourse);
      const trackIdentity = JSON.stringify([s.trackVenue, s.trackCourse]);

      if (laps && laps.length > 0) {
        for (const lap of laps) {
          if (lap.lapTime && lap.lapTime > 0) {
            totalDrivingSeconds += lap.lapTime;
          }
          if (lap.isPitStop) {
            totalPitStops++;
          }
          if (lap.topSpeed && lap.topSpeed > maxTopSpeed) {
            maxTopSpeed = lap.topSpeed;
            maxTopSpeedTrack = displayTrack;
            maxTopSpeedCar = p.carType ?? '';
          }
        }
        cleanLaps += selectCleanLapCandidates(laps).length;
      } else if (p.avgLapTime && completedLapsCount > 0) {
        totalDrivingSeconds += p.avgLapTime * completedLapsCount;
        cleanLaps += completedLapsCount;
      }

      if (!laps && 'maxTopSpeed' in p && typeof p.maxTopSpeed === 'number' && p.maxTopSpeed > maxTopSpeed) {
        maxTopSpeed = p.maxTopSpeed;
        maxTopSpeedTrack = displayTrack;
        maxTopSpeedCar = p.carType ?? '';
      }

      const sessionDistanceKm = (trackMeters / 1000) * completedLapsCount;

      if (displayTrack && completedLapsCount > 0) {
        const entry = trackLapsMap[trackIdentity] ??= { track: displayTrack, trackVenue: s.trackVenue, trackCourse: s.trackCourse ?? '', laps: 0 };
        entry.laps += completedLapsCount;
        trackKmMap[trackIdentity] = (trackKmMap[trackIdentity] || 0) + sessionDistanceKm;
      }

      if (p.carType && completedLapsCount > 0) {
        carLapsMap[p.carType] = (carLapsMap[p.carType] || 0) + completedLapsCount;
        carKmMap[p.carType] = (carKmMap[p.carType] || 0) + sessionDistanceKm;
      }

      if (!p.bestLapWet && p.bestLapPacePercentage && p.bestLapPaceCategory && p.bestLapTime) {
        const spec = getCircuitSpecification(s.trackVenue, s.trackCourse, null, null, null, s.trackLengthMeters);
        const groupKey = JSON.stringify([spec.layoutKey, p.carClass]);
        const group = benchmarkPaceGroups.get(groupKey) ?? { sessionCount: 0, bestPercentage: p.bestLapPacePercentage };
        group.sessionCount++;
        group.bestPercentage = Math.min(group.bestPercentage, p.bestLapPacePercentage);
        benchmarkPaceGroups.set(groupKey, group);

        const currentBest = uniqueTrackRefLapsMap[trackIdentity];
        if (!currentBest || p.bestLapPacePercentage < currentBest.percentage) {
          uniqueTrackRefLapsMap[trackIdentity] = {
            sessionId: s.id,
            percentage: p.bestLapPacePercentage,
            category: p.bestLapPaceCategory,
            lapTime: p.bestLapTime,
            track: displayTrack,
            car: p.carType,
          };
        }
      }
    }

    const cleanLapsPercentage = totalLaps > 0 ? Math.round((cleanLaps / totalLaps) * 1000) / 10 : 0;
    const averageBenchmarkPacePercentage = averageQualifiedBenchmarkPace(benchmarkPaceGroups.values());
    const averageBenchmarkPaceCategory = averageBenchmarkPacePercentage !== null
      ? getPaceCategoryFromPercentage(averageBenchmarkPacePercentage)
      : null;

    const rankedTracks = Object.entries(trackLapsMap)
      .map(([identity, track]) => ({ ...track, km: trackKmMap[identity] || 0 }))
      .sort((a, b) => b.laps - a.laps);

    const rankedCars = Object.entries(carLapsMap)
      .map(([car, laps]) => ({ car, laps, km: carKmMap[car] || 0 }))
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
      maxTopSpeedCar,
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
    replayCount,
    sortedSessions,
    visibleTracks,
    visibleCars,
    visibleRefLaps,
    ...metrics,
  };
}
