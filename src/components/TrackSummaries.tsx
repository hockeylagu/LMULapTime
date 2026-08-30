import React, { useState, useEffect } from 'react';
import { Flag, Trophy } from 'lucide-react';
import { formatTime } from '../utils/formatters.js';
import { matchesCarClass, VEHICLE_CLASS_OPTIONS, getPaceCategoryStyle } from '../utils/paceCategory.js';
import { ReferenceLaptimeEntry, PaceCategory } from '../../server/types.js';

interface SessionSummary {
  id: string;
  filename: string;
  trackVenue: string;
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
  tracksMap,
  onSelectTrack,
  selectedCarClass,
  setSelectedCarClass,
}) => {
  const [refCache, setRefCache] = useState<any>(null);

  useEffect(() => {
    fetch('/api/reference-laptimes')
      .then(res => res.json())
      .then(data => setRefCache(data))
      .catch(err => console.error('Failed to load reference laptimes in TrackSummaries:', err));
  }, []);

  const trackList = React.useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return Object.values(tracksMap);
    }

    const filteredSessions = sessions.filter(s =>
      matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedCarClass)
    );

    const trackVenues = Array.from(new Set(sessions.map(s => s.trackVenue))).filter(Boolean);

    return trackVenues.map(venue => {
      const venueSessions = filteredSessions.filter(s => s.trackVenue === venue);

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
      };
    });
  }, [sessions, tracksMap, selectedCarClass]);

  const getRefEntryForTrack = (trackName: string, carType?: string, carClass?: string): ReferenceLaptimeEntry | null => {
    if (!refCache?.entries) return null;

    const normTrack = trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normCar = (carType || '').toLowerCase();
    const normClass = (carClass || '').toLowerCase();

    const trackEntries = Object.values(refCache.entries).filter((entry: any) => {
      const entryTrackNorm = entry.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normTrack.includes(entryTrackNorm) || entryTrackNorm.includes(normTrack);
    });

    if (trackEntries.length === 0) return null;

    // 1. If a specific car class filter is active (not All), match entry against selectedCarClass
    if (selectedCarClass && selectedCarClass !== 'All') {
      const classMatch = trackEntries.find((entry: any) =>
        matchesCarClass(entry.carClass, entry.carClass, selectedCarClass)
      );
      if (classMatch) return classMatch as ReferenceLaptimeEntry;
    }

    // 2. Otherwise (selectedCarClass is All), match entry against carType's actual class
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

  return (
    <div className="space-y-6">

      {/* Header with Title & Car Class Filter */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Flag className="w-6 h-6 text-lmu-gold" />
            Track Records & Benchmarks ({trackList.length} Tracks)
          </h2>
          <p className="text-xs text-lmu-muted mt-1">
            Aggregated personal best lap times, theoretical limits, and car stats filtered by category
          </p>
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

      {/* Grid of Tracks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {trackList.map(t => {
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
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-wide">{t.trackVenue}</h3>
                    <p className="text-xs text-lmu-muted mt-0.5">
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
                      <h4 className="text-xl font-extrabold text-lmu-gold font-mono mt-0.5">
                        {formatTime(t.bestLapTime)}
                      </h4>
                      <p className="text-[11px] text-lmu-muted mt-1 truncate">
                        {t.bestLapCar || 'Car'}
                      </p>
                      {/* Pace Category Badge */}
                      {paceInfo && (
                        <div className="mt-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${getPaceCategoryStyle(paceInfo.category).badgeClass}`}>
                            <span>{getPaceCategoryStyle(paceInfo.category).emoji}</span>
                            <span>{paceInfo.category}</span>
                          </span>
                        </div>
                      )}
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
