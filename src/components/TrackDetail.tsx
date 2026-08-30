import React, { useState, useEffect } from 'react';
import { ArrowLeft, Zap, ChevronRight, FileText, Car, ArrowUpDown, Video, AlertCircle, FilterX } from 'lucide-react';
import { formatTime, getDisplayTrackName, matchesSessionType } from '../utils/formatters.js';
import { getPaceCategoryStyle, matchesCarClass, VEHICLE_CLASS_OPTIONS } from '../utils/paceCategory.js';
import { ReferenceLaptimeEntry, PaceCategory } from '../../server/types.js';
import { ImprovementChart, SessionProgressionPoint } from './ImprovementChart.js';

export type TrackDetailSortOption = 'date-desc' | 'date-asc' | 'pace-asc' | 'pace-desc' | 'lap-asc';

interface SessionMeta {
  id: string;
  filename: string;
  trackVenue: string;
  trackCourse?: string;
  timeString: string;
  sessionType: string;
  sessionName: string;
  weatherInfo?: string;
  driversCount: number;
  matchingReplayFile?: {
    name: string;
    path: string;
  };
  playerDriver?: {
    name: string;
    carType: string;
    carClass: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestS1?: number | null;
    bestS2?: number | null;
    bestS3?: number | null;
    theoreticalBest?: number | null;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    avgLapTime?: number | null;
    avgLapTimeString?: string;
    lapsCount: number;
  };
}

interface TrackDetailProps {
  trackName: string;
  onBack: () => void;
  onSelectSession: (sessionId: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  progression?: SessionProgressionPoint[];
}

export const TrackDetail: React.FC<TrackDetailProps> = ({
  trackName,
  onBack,
  onSelectSession,
  selectedCarClass,
  setSelectedCarClass,
  progression = [],
}) => {
  const getInitialParams = () => {
    const fullHash = window.location.hash.replace(/^#\/?/, '');
    const qIndex = fullHash.indexOf('?');
    const searchPart = qIndex !== -1 ? fullHash.substring(qIndex + 1) : window.location.search.replace(/^\?/, '');
    const params = new URLSearchParams(searchPart);
    return {
      sort: (params.get('sort') as TrackDetailSortOption) || 'date-desc',
      model: params.get('model') || 'All',
      type: params.get('type') || 'All',
      q: params.get('q') || '',
      hideEmpty: params.get('hideEmpty') !== 'false',
    };
  };

  const initialParams = getInitialParams();
  const [loading, setLoading] = useState<boolean>(true);
  const [hideEmpty, setHideEmptyState] = useState<boolean>(initialParams.hideEmpty);
  const [selectedCarModel, setSelectedCarModelState] = useState<string>(initialParams.model);
  const [filterType, setFilterTypeState] = useState<string>(initialParams.type);
  const [searchQuery, setSearchQueryState] = useState<string>(initialParams.q);
  const [sortBy, setSortByState] = useState<TrackDetailSortOption>(initialParams.sort);
  const [data, setData] = useState<{
    trackName: string;
    normalizedTrackName: string;
    sessionsCount: number;
    sessions: SessionMeta[];
    benchmarks: ReferenceLaptimeEntry[];
  } | null>(null);

  const selectedClass = selectedCarClass;
  const setSelectedClass = setSelectedCarClass;

  const updateUrlParam = (updates: {
    sort?: TrackDetailSortOption;
    model?: string;
    type?: string;
    q?: string;
    hideEmpty?: boolean;
    carClass?: string;
  }) => {
    const fullHash = window.location.hash.replace(/^#\/?/, '');
    const qIndex = fullHash.indexOf('?');
    const pathPart = qIndex !== -1 ? fullHash.substring(0, qIndex) : fullHash;
    const searchPart = qIndex !== -1 ? fullHash.substring(qIndex + 1) : '';
    const params = new URLSearchParams(searchPart);

    if (updates.sort !== undefined) {
      if (updates.sort === 'date-desc') params.delete('sort');
      else params.set('sort', updates.sort);
    }
    if (updates.model !== undefined) {
      if (updates.model === 'All' || !updates.model) params.delete('model');
      else params.set('model', updates.model);
    }
    if (updates.type !== undefined) {
      if (updates.type === 'All' || !updates.type) params.delete('type');
      else params.set('type', updates.type);
    }
    if (updates.q !== undefined) {
      if (!updates.q.trim()) params.delete('q');
      else params.set('q', updates.q.trim());
    }
    if (updates.hideEmpty !== undefined) {
      if (updates.hideEmpty) params.delete('hideEmpty');
      else params.set('hideEmpty', 'false');
    }
    if (updates.carClass !== undefined) {
      if (updates.carClass === 'All' || !updates.carClass) params.delete('carClass');
      else params.set('carClass', updates.carClass);
    }

    const paramStr = params.toString();
    const newHash = `#/${pathPart}${paramStr ? `?${paramStr}` : ''}`;
    window.history.replaceState(null, '', newHash);
  };

  const setSortBy = (val: TrackDetailSortOption) => {
    setSortByState(val);
    updateUrlParam({ sort: val });
  };

  const setSelectedCarModel = (model: string) => {
    setSelectedCarModelState(model);
    updateUrlParam({ model });
  };

  const setFilterType = (type: string) => {
    setFilterTypeState(type);
    updateUrlParam({ type });
  };

  const setSearchQuery = (q: string) => {
    setSearchQueryState(q);
    updateUrlParam({ q });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateUrlParam({ hideEmpty: hide });
  };

  useEffect(() => {
    setSelectedCarModel('All');
  }, [selectedClass]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/track/${encodeURIComponent(trackName)}`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch track details:', err);
        setLoading(false);
      });
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

  const { sessions, benchmarks } = data;

  // Extract unique specific car models for the currently selected class on this track
  const availableCarModels = Array.from(new Set(
    sessions
      .filter(s => {
        const display = getDisplayTrackName(s.trackVenue, s.trackCourse);
        if (display.toLowerCase() !== trackName.toLowerCase()) return false;
        return matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedClass);
      })
      .map(s => s.playerDriver?.carType)
      .filter(Boolean) as string[]
  )).sort((a, b) => a.localeCompare(b));

  // Count empty sessions for this track & car class
  const classTrackSessions = sessions.filter(s => {
    const display = getDisplayTrackName(s.trackVenue, s.trackCourse);
    if (display.toLowerCase() !== trackName.toLowerCase()) return false;
    return matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedClass);
  });

  const emptyCount = classTrackSessions.filter(s => {
    const p = s.playerDriver;
    return !p || (p.lapsCount ?? 0) === 0 || p.bestLapTime === null;
  }).length;

  const filteredSessions = sessions.filter(s => {
    const display = getDisplayTrackName(s.trackVenue, s.trackCourse);
    if (display.toLowerCase() !== trackName.toLowerCase()) return false;

    const classMatch = matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedClass);
    if (!classMatch) return false;

    if (selectedCarModel !== 'All' && s.playerDriver?.carType !== selectedCarModel) {
      return false;
    }

    const matchesType = matchesSessionType(s.sessionType, s.sessionName, filterType);
    if (!matchesType) return false;

    const q = searchQuery.toLowerCase().trim();
    if (q !== '') {
      const matchesSearch =
        (s.playerDriver?.carType || '').toLowerCase().includes(q) ||
        (s.playerDriver?.name || '').toLowerCase().includes(q) ||
        s.filename.toLowerCase().includes(q) ||
        (s.sessionName || '').toLowerCase().includes(q) ||
        (s.sessionType || '').toLowerCase().includes(q) ||
        (s.weatherInfo || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    if (hideEmpty) {
      return (s.playerDriver?.lapsCount ?? 0) > 0 && s.playerDriver?.bestLapTime !== null;
    }
    return true;
  });

  // Build progression points directly from filtered track sessions (synchronizing class, car model, session type, search, and empty filter)
  const trackProgression: SessionProgressionPoint[] = filteredSessions.length > 0
    ? filteredSessions.map(s => {
        const p = s.playerDriver;
        const parseTimestamp = (str: string) => {
          if (!str) return 0;
          return new Date(str.replace(/\//g, '-')).getTime() || 0;
        };
        return {
          sessionId: s.id,
          timestamp: parseTimestamp(s.timeString),
          dateString: s.timeString,
          sessionType: s.sessionType,
          sessionName: s.sessionName,
          trackVenue: s.trackVenue,
          trackCourse: s.trackCourse,
          displayTrack: getDisplayTrackName(s.trackVenue, s.trackCourse),
          weatherInfo: s.weatherInfo,
          carType: p?.carType || 'Unknown Car',
          carClass: p?.carClass || 'General',
          driverName: p?.name || 'Driver',
          bestLapTime: p?.bestLapTime || null,
          bestS1: p?.bestS1 || null,
          bestS2: p?.bestS2 || null,
          bestS3: p?.bestS3 || null,
          theoreticalBest: p?.theoreticalBest || null,
          cleanLapsCount: p?.lapsCount || 0,
          totalLapsCount: p?.lapsCount || 0,
          avgLapTime: p?.avgLapTime ?? null,
          matchingReplayFile: s.matchingReplayFile?.name,
        };
      }).sort((a, b) => a.timestamp - b.timestamp)
    : (sessions.length === 0 ? progression : []);

  // Sorted sessions by Date / Benchmark Pace % / Best Lap Time
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (sortBy === 'date-desc' || sortBy === 'date-asc') {
      const parseTimestamp = (str: string) => {
        if (!str) return 0;
        const clean = str.replace(/\//g, '-');
        const time = new Date(clean).getTime();
        return isNaN(time) ? 0 : time;
      };
      const timeA = parseTimestamp(a.timeString);
      const timeB = parseTimestamp(b.timeString);
      return sortBy === 'date-desc' ? timeB - timeA : timeA - timeB;
    } else if (sortBy === 'lap-asc') {
      const lapA = a.playerDriver?.bestLapTime ?? 99999;
      const lapB = b.playerDriver?.bestLapTime ?? 99999;
      return lapA - lapB;
    } else {
      const pctA = a.playerDriver?.bestLapPacePercentage ?? 999;
      const pctB = b.playerDriver?.bestLapPacePercentage ?? 999;
      return sortBy === 'pace-asc' ? pctA - pctB : pctB - pctA;
    }
  });

  // 1. Helper to calculate pace category & percentage against a reference entry
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

  // 2. Find driver's overall best lap in filtered sessions for this track
  const rawBestStats = (() => {
    let bestTime: number | null = null;
    let bestTimeStr = '--:--.---';
    let bestCar = '';
    let bestCarClass = '';

    filteredSessions.forEach(s => {
      if (s.playerDriver) {
        const p = s.playerDriver;
        if (p.bestLapTime) {
          if (bestTime === null || p.bestLapTime < bestTime) {
            bestTime = p.bestLapTime;
            bestTimeStr = p.bestLapTimeString;
            bestCar = p.carType;
            bestCarClass = p.carClass || '';
          }
        }
      }
    });

    return { bestTime, bestTimeStr, bestCar, bestCarClass };
  })();

  // 3. Find current benchmark matching selectedClass or matching the best lap's car class when selectedClass is 'All'
  let currentBenchmark: ReferenceLaptimeEntry | null = null;
  if (benchmarks && benchmarks.length > 0) {
    if (selectedClass && selectedClass !== 'All') {
      currentBenchmark = benchmarks.find(b => matchesCarClass(b.carClass, b.carClass, selectedClass)) || benchmarks[0];
    } else if (rawBestStats.bestCarClass || rawBestStats.bestCar) {
      currentBenchmark = benchmarks.find(b =>
        matchesCarClass(b.carClass, b.carClass, rawBestStats.bestCarClass || rawBestStats.bestCar) ||
        matchesCarClass(rawBestStats.bestCarClass || rawBestStats.bestCar, rawBestStats.bestCar, b.carClass)
      ) || benchmarks[0];
    } else {
      currentBenchmark = benchmarks[0];
    }
  }

  // 4. Compute overall best pace stats dynamically against currentBenchmark
  const currentClassDriverStats = (() => {
    const paceInfo = getPaceCategoryForLap(rawBestStats.bestTime, currentBenchmark);
    return {
      ...rawBestStats,
      bestPaceCat: paceInfo?.category || null,
      bestPacePct: paceInfo?.pct || null,
    };
  })();

  return (
    <div className="space-y-6">

      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-accent transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tracks
        </button>
      </div>

      {/* Track Title Card */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30">
                Official Circuit
              </span>
              <span className="text-xs text-lmu-muted">{filteredSessions.length} Recorded Sessions</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white mt-1 truncate" title={trackName}>{trackName}</h2>
            <p className="text-xs text-lmu-muted mt-0.5">
              Benchmark Target Lap Times & Personal Telemetry per Vehicle Category
            </p>
          </div>

          {/* Vehicle Class Filter Buttons (Beside Circuit Title) */}
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold overflow-x-auto shrink-0">
            {VEHICLE_CLASS_OPTIONS.map(cls => (
              <button
                key={cls.id}
                onClick={() => setSelectedClass(cls.id)}
                className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  selectedClass === cls.id
                    ? 'bg-lmu-accent text-white shadow-md font-bold'
                    : 'text-lmu-muted hover:text-white'
                }`}
              >
                {cls.label}
              </button>
            ))}
          </div>
        </div>

        {/* Specific Car Model Sub-Filter Row */}
        {selectedClass !== 'All' && availableCarModels.length > 0 && (
          <div className="pt-3 border-t border-lmu-border/50 flex items-center gap-3 flex-wrap text-xs">
            <span className="text-xs font-semibold text-lmu-muted uppercase flex items-center gap-1.5 shrink-0">
              <Car className="w-3.5 h-3.5 text-lmu-accent" />
              Car Model:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedCarModel('All')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  selectedCarModel === 'All'
                    ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/40 font-bold shadow-sm'
                    : 'bg-lmu-bg text-lmu-muted hover:text-white border border-lmu-border'
                }`}
              >
                All {selectedClass} Cars ({availableCarModels.length})
              </button>
              {availableCarModels.map(car => (
                <button
                  key={car}
                  onClick={() => setSelectedCarModel(car)}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    selectedCarModel === car
                      ? 'bg-lmu-accent text-white font-bold shadow-sm'
                      : 'bg-lmu-bg text-lmu-muted hover:text-white border border-lmu-border'
                  }`}
                >
                  {car}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reference Lap Times Benchmark Section (Isolated per Vehicle Class) */}
      <div className="glass-panel p-6 rounded-2xl space-y-6">
        
        <div className="flex items-center justify-between border-b border-lmu-border/50 pb-4">
          <div>
            <h3 className="text-lg font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-5 h-5 text-lmu-gold" />
              Appropriate Reference Lap Times
            </h3>
            <p className="text-xs text-lmu-muted mt-0.5">
              Reference lap times categorized by vehicle class (strictly isolated to avoid mixing different vehicle types)
            </p>
          </div>
        </div>

        {currentBenchmark ? (
          <div className="space-y-6">

            {/* Benchmark Target Categories Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              
              {/* Alien ~100% */}
              <div className="glass-panel p-3.5 rounded-xl border-purple-500/30 bg-purple-950/20 text-center space-y-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-500/40">
                  👾 Alien (~100%)
                </span>
                <h4 className="text-lg font-extrabold text-purple-300 font-mono mt-1">
                  {formatTime(currentBenchmark.targets.alienSec)}
                </h4>
                <p className="text-[10px] text-purple-400/80">Target Benchmark</p>
              </div>

              {/* Competitive 101% */}
              <div className="glass-panel p-3.5 rounded-xl border-amber-500/30 bg-amber-950/20 text-center space-y-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
                  🏆 Competitive (101%)
                </span>
                <h4 className="text-lg font-extrabold text-amber-300 font-mono mt-1">
                  {formatTime(currentBenchmark.targets.competitiveSec)}
                </h4>
                <p className="text-[10px] text-amber-400/80">+1% off Alien</p>
              </div>

              {/* Good 102% */}
              <div className="glass-panel p-3.5 rounded-xl border-emerald-500/30 bg-emerald-950/20 text-center space-y-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  ⭐ Good (102%)
                </span>
                <h4 className="text-lg font-extrabold text-emerald-300 font-mono mt-1">
                  {formatTime(currentBenchmark.targets.goodSec)}
                </h4>
                <p className="text-[10px] text-emerald-400/80">+2% off Alien</p>
              </div>

              {/* Midpack 104% */}
              <div className="glass-panel p-3.5 rounded-xl border-sky-500/30 bg-sky-950/20 text-center space-y-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-500/40">
                  🏎️ Midpack (104%)
                </span>
                <h4 className="text-lg font-extrabold text-sky-300 font-mono mt-1">
                  {formatTime(currentBenchmark.targets.midpackSec)}
                </h4>
                <p className="text-[10px] text-sky-400/80">+4% off Alien</p>
              </div>

              {/* Tail-ender 106% */}
              <div className="glass-panel p-3.5 rounded-xl border-orange-500/30 bg-orange-950/20 text-center space-y-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-300 border border-orange-500/40">
                  🐢 Tail-ender (106%)
                </span>
                <h4 className="text-lg font-extrabold text-orange-300 font-mono mt-1">
                  {formatTime(currentBenchmark.targets.tailEnderSec)}
                </h4>
                <p className="text-[10px] text-orange-400/80">+6% off Alien</p>
              </div>

              {/* Offline 107% */}
              <div className="glass-panel p-3.5 rounded-xl border-zinc-700/40 bg-zinc-900/30 text-center space-y-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                  💤 Offline (&gt;107%)
                </span>
                <h4 className="text-lg font-extrabold text-zinc-300 font-mono mt-1">
                  {formatTime(currentBenchmark.targets.tailEnderSec ? currentBenchmark.targets.tailEnderSec * 1.01 : null)}
                </h4>
                <p className="text-[10px] text-zinc-400/80">+7% off Alien</p>
              </div>

            </div>

          </div>
        ) : (
          <div className="py-8 text-center text-lmu-muted">
            No reference benchmarks found for this track. Update reference laptimes in Settings.
          </div>
        )}

      </div>

      {/* Progression & Pace Improvement Chart */}
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
      />

      {/* Recorded Sessions on this Track */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-lmu-border/50 pb-4">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-5 h-5 text-lmu-accent" />
              Sessions Recorded on {trackName} ({sortedSessions.length}{hideEmpty && emptyCount > 0 ? ` / ${classTrackSessions.length}` : ''})
            </h3>
            <span className="text-xs text-lmu-muted">
              {hideEmpty && emptyCount > 0 ? `Filtering ${emptyCount} empty session${emptyCount > 1 ? 's' : ''}` : 'Click any session to view detailed telemetry & sector timings'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Session Type Filter Pills */}
            <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium">
              {['All', 'Practice', 'Qualifying', 'Race'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    filterType === type
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Search car, file, driver..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-lmu-bg border border-lmu-border rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent w-full sm:w-48"
            />

            {/* Hide Empty Toggle */}
            <button
              onClick={() => setHideEmpty(!hideEmpty)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                hideEmpty
                  ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
                  : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
              }`}
              title={hideEmpty ? "Hiding empty sessions (0 laps). Click to show all." : "Showing all sessions. Click to filter out empty results."}
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Hide Empty</span>
              {emptyCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  hideEmpty ? 'bg-lmu-accent text-white' : 'bg-lmu-border text-lmu-muted'
                }`}>
                  {emptyCount}
                </span>
              )}
            </button>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-lmu-accent" />
              <span className="text-lmu-muted font-medium">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as TrackDetailSortOption)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                <option value="date-desc" className="bg-lmu-card text-white">Date (Newest First)</option>
                <option value="date-asc" className="bg-lmu-card text-white">Date (Oldest First)</option>
                <option value="pace-asc" className="bg-lmu-card text-white">Benchmark (Best Pace %)</option>
                <option value="pace-desc" className="bg-lmu-card text-white">Benchmark (Slowest Pace %)</option>
                <option value="lap-asc" className="bg-lmu-card text-white">Best Lap Time (Fastest)</option>
              </select>
            </div>
          </div>
        </div>

        {sortedSessions.length === 0 ? (
          <div className="py-12 text-center text-lmu-muted">
            <p className="text-base font-medium">No sessions found matching filters.</p>
            {(filterType !== 'All' || searchQuery !== '' || (hideEmpty && emptyCount > 0)) && (
              <p className="text-xs text-lmu-muted mt-2">
                {hideEmpty && emptyCount > 0 && `${emptyCount} empty session${emptyCount > 1 ? 's are' : ' is'} hidden. `}
                <button
                  onClick={() => {
                    setFilterType('All');
                    setSearchQuery('');
                    setHideEmpty(false);
                    setSelectedCarModel('All');
                  }}
                  className="text-lmu-accent underline hover:text-white ml-1"
                >
                  Reset all filters
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSessions.map(s => {
              const p = s.playerDriver;
              const cardPace = getPaceCategoryForLap(p?.bestLapTime || null, currentBenchmark);
              const empty = (p?.lapsCount ?? 0) === 0 || !p?.bestLapTime;
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`glass-panel glass-panel-hover p-4 rounded-xl cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden ${
                    empty ? 'border-amber-500/30 bg-amber-950/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                          s.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
                          s.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30' :
                          'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                        }`}>
                          {s.sessionName || s.sessionType}
                        </span>
                        {s.weatherInfo && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-lmu-bg/80 border border-lmu-border/60 text-lmu-muted">
                            {s.weatherInfo}
                          </span>
                        )}
                        {empty && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Empty
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-lmu-muted mt-2">{s.timeString}</p>
                    </div>

                    {s.matchingReplayFile && (
                      <span className="p-1.5 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20 shrink-0 mt-0.5" title={`Replay VCR: ${s.matchingReplayFile.name}`}>
                        <Video className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-lmu-border/60 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-white font-semibold truncate max-w-[150px]">{p ? p.carType : 'N/A'}</p>
                      <p className="text-lmu-muted text-[11px]">{p ? `${p.lapsCount} laps` : '0 laps'}</p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-bold text-sm text-lmu-gold">
                        {p?.bestLapTimeString || '--:--.---'}
                      </p>
                      {cardPace && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${getPaceCategoryStyle(cardPace.category).badgeClass}`}>
                          <span>{getPaceCategoryStyle(cardPace.category).emoji}</span>
                          <span>{cardPace.category}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-xs text-lmu-accent font-semibold group">
                    <span>Inspect Session Telemetry</span>
                    <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

