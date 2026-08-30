import React, { useState, useEffect, useMemo } from 'react';
import { Flag, Trophy, ArrowUpDown } from 'lucide-react';
import { formatTime, getDisplayTrackName } from '../utils/formatters.js';
import { matchesCarClass, VEHICLE_CLASS_OPTIONS, getPaceCategoryStyle, normalizeTrackName } from '../utils/paceCategory.js';
import { ReferenceLaptimeEntry, PaceCategory } from '../../server/types.js';

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

    const filteredSessions = sessions.filter(s =>
      matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedCarClass)
    );

    const trackVenues = Array.from(new Set(sessions.map(s => getDisplayTrackName(s.trackVenue, (s as any).trackCourse)))).filter(Boolean);

    const list = trackVenues.map(venue => {
      const venueSessions = filteredSessions.filter(s => getDisplayTrackName(s.trackVenue, (s as any).trackCourse) === venue);

      let bestLapTime: number | null = null;
      let bestLapDriver = '';
      let bestLapCar = '';
      let bestLapClass = '';
      let bestS1: number | null = null;
      let bestS2: number | null = null;
      let bestS3: number | null = null;
      let totalLaps = 0;
      const carsUsedSet = new Set<string>();

      venueSessions.forEach(s => {
        if (s.playerDriver) {
          const p = s.playerDriver;
          totalLaps += p.lapsCount || 0;
          if (p.carType) carsUsedSet.add(p.carType);

          if (p.bestLapTime) {
            if (bestLapTime === null || p.bestLapTime < bestLapTime) {
              bestLapTime = p.bestLapTime;
              bestLapDriver = p.name;
              bestLapCar = p.carType;
              bestLapClass = p.carClass || '';
            }
          }
          if (p.bestS1) {
            if (bestS1 === null || p.bestS1 < bestS1) bestS1 = p.bestS1;
          }
          if (p.bestS2) {
            if (bestS2 === null || p.bestS2 < bestS2) bestS2 = p.bestS2;
          }
          if (p.bestS3) {
            if (bestS3 === null || p.bestS3 < bestS3) bestS3 = p.bestS3;
          }
        }
      });

      const theoreticalBest = (bestS1 !== null && bestS2 !== null && bestS3 !== null)
        ? bestS1 + bestS2 + bestS3
        : null;

      const lastSessionTimestamp = venueSessions.length > 0
        ? Math.max(...venueSessions.map(s => {
            const clean = (s.timeString || '').replace(/\//g, '-');
            const time = new Date(clean).getTime();
            return isNaN(time) ? 0 : time;
          }))
        : 0;

      const fallback = tracksMap[venue] || {
        trackVenue: venue,
        sessionsCount: 0,
        totalLaps: 0,
        bestLapTime: null,
        bestLapDriver: '',
        bestLapCar: '',
        bestS1: null,
        bestS2: null,
        bestS3: null,
        theoreticalBest: null,
        carsUsed: [],
      };

      return {
        trackVenue: venue,
        sessionsCount: venueSessions.length,
        totalLaps: venueSessions.length > 0 ? totalLaps : (selectedCarClass === 'All' ? fallback.totalLaps : 0),
        bestLapTime: bestLapTime !== null ? bestLapTime : (selectedCarClass === 'All' ? fallback.bestLapTime : null),
        bestLapDriver: bestLapDriver || (selectedCarClass === 'All' ? fallback.bestLapDriver : ''),
        bestLapCar: bestLapCar || (selectedCarClass === 'All' ? fallback.bestLapCar : ''),
        bestLapClass: bestLapClass || '',
        bestS1: bestS1 !== null ? bestS1 : (selectedCarClass === 'All' ? fallback.bestS1 : null),
        bestS2: bestS2 !== null ? bestS2 : (selectedCarClass === 'All' ? fallback.bestS2 : null),
        bestS3: bestS3 !== null ? bestS3 : (selectedCarClass === 'All' ? fallback.bestS3 : null),
        theoreticalBest: theoreticalBest !== null ? theoreticalBest : (selectedCarClass === 'All' ? fallback.theoreticalBest : null),
        carsUsed: carsUsedSet.size > 0 ? Array.from(carsUsedSet) : (selectedCarClass === 'All' ? fallback.carsUsed : []),
        lastSessionTimestamp,
      };
    });

    return list.sort((a, b) => a.trackVenue.localeCompare(b.trackVenue));
  }, [sessions, tracksMap, selectedCarClass]);

  const getRefEntryForTrack = (trackName: string, carType?: string, carClass?: string): ReferenceLaptimeEntry | null => {
    if (!refCache?.entries) return null;

    const normTrack = normalizeTrackName(trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const normCar = (carType || '').toLowerCase();
    const normClass = (carClass || '').toLowerCase();

    // 1. Exact normalized track matches first
    let trackEntries = Object.values(refCache.entries).filter((entry: any) => {
      const entryTrackNorm = normalizeTrackName(entry.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
      const entryRaw = entry.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return entryTrackNorm === normTrack || entryRaw === normTrack;
    });

    // 2. Fallback to substring match if no exact matches exist
    if (trackEntries.length === 0) {
      trackEntries = Object.values(refCache.entries).filter((entry: any) => {
        const entryTrackNorm = normalizeTrackName(entry.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
        const entryRaw = entry.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normTrack.includes(entryTrackNorm) || entryTrackNorm.includes(normTrack) || normTrack.includes(entryRaw) || entryRaw.includes(normTrack);
      });
    }

    if (trackEntries.length === 0) return null;

    // 3. Match vehicle class
    if (selectedCarClass && selectedCarClass !== 'All') {
      const classMatch = trackEntries.find((entry: any) =>
        matchesCarClass(entry.carClass, entry.carClass, selectedCarClass)
      );
      if (classMatch) return classMatch as ReferenceLaptimeEntry;
    }

    if (normCar || normClass) {
      const classMatch = trackEntries.find((entry: any) =>
        matchesCarClass(normClass || normCar, normCar, entry.carClass) ||
        matchesCarClass(entry.carClass, entry.carClass, normClass || normCar)
      );
      if (classMatch) return classMatch as ReferenceLaptimeEntry;
    }

    return trackEntries[0] as ReferenceLaptimeEntry;
  };

  const getPaceCategoryForLap = (lapTime: number | null, refEntry: ReferenceLaptimeEntry | null) => {
    if (!lapTime || !refEntry || !refEntry.target100Sec) return null;

    const ratio = lapTime / refEntry.target100Sec;
    const pct = ratio * 100;

    let category: PaceCategory = 'Offline';
    if (pct <= 100.5) category = 'Alien';
    else if (pct <= 101.5) category = 'Competitive';
    else if (pct <= 103.5) category = 'Good';
    else if (pct <= 105.5) category = 'Midpack';
    else if (pct <= 107.0) category = 'Tail-ender';

    return { category, pct };
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
