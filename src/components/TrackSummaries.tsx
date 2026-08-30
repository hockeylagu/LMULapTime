import React, { useState, useEffect, useMemo } from 'react';
import { Flag, Trophy, ArrowUpDown } from 'lucide-react';
import { formatTime, getDisplayTrackName, computeTheoreticalBest, parseDateStringToTimestamp } from '../utils/formatters.js';
import { matchesCarClass, VEHICLE_CLASS_OPTIONS, getPaceCategoryStyle, findReferenceEntry, getPaceCategoryFromPercentage } from '../utils/paceCategory.js';
import { ReferenceLaptimeEntry } from '../../server/types.js';

export type TracksSortOption = 'name-asc' | 'name-desc' | 'pace-asc' | 'last-session-desc';

interface SessionSummary {
  id: string;
  filename: string;
  trackVenue: string;
  trackCourse?: string;
  timeString: string;
  sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown';
  sessionName: string;
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
    lapsCount: number;
  };
}

interface TrackSummaryData {
  trackVenue: string;
  sessionsCount: number;
  totalLaps: number;
  bestLapTime: number | null;
  bestLapDriver: string;
  bestLapCar: string;
  bestLapClass?: string;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  carsUsed: string[];
}

interface TrackSummariesProps {
  sessions?: SessionSummary[];
  tracksMap: Record<string, TrackSummaryData>;
  onSelectTrack: (trackName: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
}

export const TrackSummaries: React.FC<TrackSummariesProps> = ({
  sessions = [],
  tracksMap = {},
  onSelectTrack,
  selectedCarClass,
  setSelectedCarClass,
}) => {
  const [refCache, setRefCache] = useState<any>(null);
  const [sortBy, setSortBy] = useState<TracksSortOption>('name-asc');

  useEffect(() => {
    fetch('/api/reference-laptimes')
      .then(res => res.json())
      .then(data => setRefCache(data))
      .catch(err => console.error('Failed to load reference laptimes in TrackSummaries:', err));
  }, []);

  const trackList = React.useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return Object.values(tracksMap).sort((a, b) => a.trackVenue.localeCompare(b.trackVenue));
    }

    const minTime = (current: number | null, next: number | null | undefined): number | null =>
      next !== null && next !== undefined && next > 0 && (current === null || next < current) ? next : current;

    // Group filtered sessions by display track name in a single pass
    const sessionsByVenue = new Map<string, SessionSummary[]>();
    const allVenues = new Set<string>();

    sessions.forEach(s => {
      const venue = getDisplayTrackName(s.trackVenue, (s as any).trackCourse);
      if (!venue) return;
      allVenues.add(venue);
      if (matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedCarClass)) {
        const group = sessionsByVenue.get(venue) || [];
        group.push(s);
        sessionsByVenue.set(venue, group);
      }
    });

    const list = Array.from(allVenues).map(venue => {
      const venueSessions = sessionsByVenue.get(venue) || [];
      const fallback = tracksMap[venue];

      let bestLapTime: number | null = null;
      let bestLapDriver = '';
      let bestLapCar = '';
      let bestLapClass = '';
      let bestS1: number | null = null;
      let bestS2: number | null = null;
      let bestS3: number | null = null;
      let totalLaps = 0;
      const carsUsedSet = new Set<string>();
      let lastSessionTimestamp = 0;

      venueSessions.forEach(s => {
        const timestamp = parseDateStringToTimestamp(s.timeString);
        if (timestamp > lastSessionTimestamp) lastSessionTimestamp = timestamp;

        const p = s.playerDriver;
        if (p) {
          totalLaps += p.lapsCount || 0;
          if (p.carType) carsUsedSet.add(p.carType);

          if (p.bestLapTime && (bestLapTime === null || p.bestLapTime < bestLapTime)) {
            bestLapTime = p.bestLapTime;
            bestLapDriver = p.name;
            bestLapCar = p.carType;
            bestLapClass = p.carClass || '';
          }
          bestS1 = minTime(bestS1, p.bestS1);
          bestS2 = minTime(bestS2, p.bestS2);
          bestS3 = minTime(bestS3, p.bestS3);
        }
      });

      const hasVenueSessions = venueSessions.length > 0;
      const useFallback = !hasVenueSessions && selectedCarClass === 'All' && fallback;

      return {
        trackVenue: venue,
        sessionsCount: venueSessions.length,
        totalLaps: hasVenueSessions ? totalLaps : (useFallback ? fallback.totalLaps : 0),
        bestLapTime: bestLapTime ?? (useFallback ? fallback.bestLapTime : null),
        bestLapDriver: bestLapDriver || (useFallback ? fallback.bestLapDriver : ''),
        bestLapCar: bestLapCar || (useFallback ? fallback.bestLapCar : ''),
        bestLapClass: bestLapClass || '',
        bestS1: bestS1 ?? (useFallback ? fallback.bestS1 : null),
        bestS2: bestS2 ?? (useFallback ? fallback.bestS2 : null),
        bestS3: bestS3 ?? (useFallback ? fallback.bestS3 : null),
        theoreticalBest: computeTheoreticalBest(bestS1, bestS2, bestS3) ?? (useFallback ? fallback.theoreticalBest : null),
        carsUsed: carsUsedSet.size > 0 ? Array.from(carsUsedSet) : (useFallback ? fallback.carsUsed : []),
        lastSessionTimestamp,
      };
    });

    return list.sort((a, b) => a.trackVenue.localeCompare(b.trackVenue));
  }, [sessions, tracksMap, selectedCarClass]);

  const getRefEntryForTrack = (trackName: string, carType?: string, carClass?: string): ReferenceLaptimeEntry | null => {
    if (!refCache?.entries) return null;
    const targetClass = selectedCarClass !== 'All' ? selectedCarClass : carClass || carType || '';
    return findReferenceEntry(refCache.entries, trackName, '', targetClass, carType || '');
  };

  const getPaceCategoryForLap = (lapTime: number | null, refEntry: ReferenceLaptimeEntry | null) => {
    if (!lapTime || !refEntry || !refEntry.target100Sec) return null;
    const pct = (lapTime / refEntry.target100Sec) * 100;
    return { category: getPaceCategoryFromPercentage(pct), pct };
  };

  const sortedTrackList = useMemo(() => {
    return [...trackList].sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.trackVenue.localeCompare(b.trackVenue);
      }
      if (sortBy === 'name-desc') {
        return b.trackVenue.localeCompare(a.trackVenue);
      }
      if (sortBy === 'last-session-desc') {
        const lastA = (a as any).lastSessionTimestamp || 0;
        const lastB = (b as any).lastSessionTimestamp || 0;
        return lastB - lastA;
      }
      if (sortBy === 'pace-asc') {
        const refA = getRefEntryForTrack(a.trackVenue, a.bestLapCar, a.bestLapClass);
        const refB = getRefEntryForTrack(b.trackVenue, b.bestLapCar, b.bestLapClass);
        const paceA = getPaceCategoryForLap(a.bestLapTime, refA)?.pct ?? 999;
        const paceB = getPaceCategoryForLap(b.bestLapTime, refB)?.pct ?? 999;
        return paceA - paceB;
      }
      return 0;
    });
  }, [trackList, sortBy, refCache, selectedCarClass]);

  return (
    <div className="space-y-6">

      {/* Header with Title & Car Class Filter */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Flag className="w-6 h-6 text-lmu-gold" />
            Track Records & Benchmarks ({sortedTrackList.length} Tracks)
          </h2>
          <p className="text-xs text-lmu-muted mt-1">
            Aggregated personal best lap times, theoretical limits, and car stats filtered by category
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {/* Sort Dropdown (Name, Pace, Last Session) */}
          <div className="flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-lmu-accent" />
            <span className="text-lmu-muted font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as TracksSortOption)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
              <option value="name-asc" className="bg-lmu-card text-white">Name (A-Z)</option>
              <option value="name-desc" className="bg-lmu-card text-white">Name (Z-A)</option>
              <option value="pace-asc" className="bg-lmu-card text-white">Pace / Benchmark (Best First)</option>
              <option value="last-session-desc" className="bg-lmu-card text-white">Last Session (Newest First)</option>
            </select>
          </div>

          {/* Car Class Filter Buttons */}
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold overflow-x-auto shrink-0">
            {VEHICLE_CLASS_OPTIONS.map(cls => (
              <button
                key={cls.id}
                onClick={() => setSelectedCarClass(cls.id)}
                className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  selectedCarClass === cls.id
                    ? 'bg-lmu-accent text-white shadow-sm font-bold'
                    : 'text-lmu-muted hover:text-white'
                }`}
              >
                {cls.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of Tracks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sortedTrackList.map(t => {
          const refEntry = getRefEntryForTrack(t.trackVenue, t.bestLapCar, t.bestLapClass);
          const paceInfo = getPaceCategoryForLap(t.bestLapTime, refEntry);

          return (
            <div
              key={t.trackVenue}
              onClick={() => onSelectTrack(t.trackVenue)}
              className="glass-panel glass-panel-hover p-5 rounded-2xl cursor-pointer space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1 mr-2">
                    <h3 className="text-lg font-bold text-white tracking-wide truncate" title={t.trackVenue}>{t.trackVenue}</h3>
                    <p className="text-xs text-lmu-muted mt-0.5 truncate">
                      {t.sessionsCount} Sessions • {t.totalLaps} Total Laps
                    </p>
                  </div>
                  <span className="p-2 rounded-xl bg-lmu-gold/10 text-lmu-gold border border-lmu-gold/20">
                    <Trophy className="w-5 h-5" />
                  </span>
                </div>

                {/* Best Lap vs Theoretical */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-lmu-border/60">
                  <div className="bg-lmu-bg/60 p-3 rounded-xl border border-lmu-border/50 flex flex-col justify-between">
                    <div>
                      <p className="text-xs text-lmu-muted font-semibold uppercase">Session Best</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <h4 className="text-xl font-extrabold text-lmu-gold font-mono">
                          {formatTime(t.bestLapTime)}
                        </h4>
                        {paceInfo && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${getPaceCategoryStyle(paceInfo.category).badgeClass}`}>
                            <span>{getPaceCategoryStyle(paceInfo.category).emoji}</span>
                            <span>{paceInfo.category}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-lmu-muted mt-1 truncate">
                        {t.bestLapCar || 'Car'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-lmu-bg/60 p-3 rounded-xl border border-lmu-border/50">
                    <p className="text-xs text-lmu-muted font-semibold uppercase">Theoretical Best</p>
                    <h4 className="text-xl font-extrabold text-lmu-green font-mono mt-0.5">
                      {formatTime(t.theoreticalBest)}
                    </h4>
                    <p className="text-[11px] text-lmu-muted mt-1">
                      Optimal S1 + S2 + S3
                    </p>
                  </div>
                </div>

                {/* Sector Splits */}
                <div className="flex items-center justify-between text-xs font-mono pt-1 text-lmu-muted">
                  <span>S1: <strong className="text-white">{formatTime(t.bestS1)}</strong></span>
                  <span>S2: <strong className="text-white">{formatTime(t.bestS2)}</strong></span>
                  <span>S3: <strong className="text-white">{formatTime(t.bestS3)}</strong></span>
                </div>
              </div>

              {/* Cars driven */}
              {t.carsUsed.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-1 border-t border-lmu-border/40">
                  {t.carsUsed.slice(0, 4).map(car => (
                    <span key={car} className="px-2 py-0.5 text-[10px] font-medium rounded bg-lmu-card text-lmu-muted border border-lmu-border">
                      {car}
                    </span>
                  ))}
                  {t.carsUsed.length > 4 && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-lmu-card text-lmu-muted">
                      +{t.carsUsed.length - 4} more
                    </span>
                  )}
                </div>
              )}

            </div>
          );
        })}
      </div>

    </div>
  );
};
