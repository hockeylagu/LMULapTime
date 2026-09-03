import React, { useState } from 'react';
import { Calendar, Zap, ChevronDown, FilterX, MapPin, Award, ArrowUpDown, FileText } from 'lucide-react';
import { isSessionEmpty, getDisplayTrackName, matchesSessionType, compareSessions } from '../utils/formatters';
import { getPaceCategoryStyle, matchesCarClass, VEHICLE_CLASS_OPTIONS, matchesTrack } from '../utils/paceCategory';
import { getHashRouteAndParams, updateHashParams } from '../utils/urlParams';
import { PaceCategory, LapData } from '../../server/types';
import { SessionList } from './SessionList';

interface BestRefLapInfo {
  sessionId: string;
  percentage: number;
  category: PaceCategory;
  lapTimeString: string;
  track: string;
  car: string;
}

interface SessionSummary {
  id: string;
  filename: string;
  trackVenue: string;
  trackCourse?: string;
  trackLengthMeters?: number | null;
  timeString: string;
  sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown';
  sessionName: string;
  weatherInfo?: string;
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
    theoreticalBest: number | null;
    theoreticalBestString: string;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    avgLapTime?: number | null;
    top3LapsCount?: number;
    position?: number;
    lapsCount: number;
    laps?: LapData[];
  };
  bestSessionLap?: {
    driverName: string;
    carType: string;
    lapTime: number;
    lapTimeString: string;
  };
  matchingReplayFile?: {
    name: string;
    path: string;
  };
}

interface DashboardProps {
  sessions: SessionSummary[];
  onSelectSession: (id: string) => void;
  selectedTrack: string;
  setSelectedTrack: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  filterType: string;
  setFilterType: (type: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export type DashboardSortOption = 'date-desc' | 'date-asc' | 'pos-asc' | 'pace-asc' | 'pace-desc';

export const Dashboard: React.FC<DashboardProps> = ({
  sessions,
  onSelectSession,
  selectedTrack,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
}) => {
  const [showMoreTracks, setShowMoreTracks] = useState<boolean>(false);
  const [showMoreCars, setShowMoreCars] = useState<boolean>(false);
  const [showMoreBenchmarks, setShowMoreBenchmarks] = useState<boolean>(false);

  const { params: initialParams } = getHashRouteAndParams();
  const [hideEmpty, setHideEmptyState] = useState<boolean>(initialParams.get('hideEmpty') !== 'false');
  const [sortBy, setSortByState] = useState<DashboardSortOption>(
    (initialParams.get('sort') as DashboardSortOption) || 'date-desc'
  );

  const setSortBy = (sort: DashboardSortOption) => {
    setSortByState(sort);
    updateHashParams({ sort });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateHashParams({ hideEmpty: hide });
  };

  // Extract unique track layout variations sorted alphabetically
  const tracks = Array.from(new Set(sessions.map(s => getDisplayTrackName(s.trackVenue, s.trackCourse)))).filter(Boolean).sort((a, b) => a.localeCompare(b));

  // Count empty results
  const emptyCount = sessions.filter(s => isSessionEmpty(s)).length;

  // Filtered sessions
  const filteredSessions = sessions.filter(s => {
    const displayTrack = getDisplayTrackName(s.trackVenue, s.trackCourse);
    const isTrackMatch = matchesTrack(selectedTrack, s.trackVenue, s.trackCourse);
    const matchesType = matchesSessionType(s.sessionType, s.sessionName, filterType);
    const isMatchingCarClass = matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedCarClass);
    const matchesSearch = searchQuery === '' ||
      displayTrack.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.trackVenue.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEmpty = !hideEmpty || !isSessionEmpty(s);
    return isTrackMatch && matchesType && isMatchingCarClass && matchesSearch && matchesEmpty;
  });

  // Sorted sessions by Date / Best Position / Benchmark Pace %
  const sortedSessions = [...filteredSessions].sort((a, b) => {
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

  // Calculate overall metrics & top3 aggregations in a single pass
  let totalLaps = 0;
  let totalDistanceKm = 0;
  let totalDrivingSeconds = 0;
  const trackLapsMap: Record<string, number> = {};
  const carLapsMap: Record<string, number> = {};
  const uniqueTrackRefLapsMap: Record<string, BestRefLapInfo> = {};

  for (const s of sessions) {
    const p = s.playerDriver;
    if (!p) continue;

    // Completed laps count (valid or invalid, but completed with recorded lap time)
    const completedLapsCount = p.laps && p.laps.length > 0
      ? p.laps.filter(l => l.lapTime !== null && l.lapTime > 0).length
      : (p.lapsCount || 0);

    totalLaps += completedLapsCount;

    // Track Distance
    const trackMeters = s.trackLengthMeters || 5000;
    totalDistanceKm += (trackMeters / 1000) * completedLapsCount;

    // Track Driving Time from driver laps or average lap times
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

  // Format Driving Time helper (e.g. 142h 35m or 45m 20s)
  const formatTotalDrivingTime = (totalSec: number): string => {
    if (!totalSec || totalSec <= 0) return '0h 00m';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `${minutes}m ${Math.floor(totalSec % 60)}s`;
  };

  // Ranked Tracks by Laps
  const rankedTracks = Object.entries(trackLapsMap)
    .sort((a, b) => b[1] - a[1])
    .map(([track, laps]) => ({ track, laps }));
  const visibleTracks = showMoreTracks ? rankedTracks : rankedTracks.slice(0, 3);

  // Ranked Cars by Laps
  const rankedCars = Object.entries(carLapsMap)
    .sort((a, b) => b[1] - a[1])
    .map(([car, laps]) => ({ car, laps }));
  const visibleCars = showMoreCars ? rankedCars : rankedCars.slice(0, 3);

  // Ranked Reference Laps (lowest percentage relative to reference benchmark)
  const rankedRefLaps = Object.values(uniqueTrackRefLapsMap)
    .sort((a, b) => a.percentage - b.percentage);
  const visibleRefLaps = showMoreBenchmarks ? rankedRefLaps : rankedRefLaps.slice(0, 3);

  return (
    <div className="space-y-6">

      {/* Top Hero / Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">

        {/* Top Circuits Card */}
        <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
          <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
            <p className="text-xs font-bold text-lmu-gold uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-lmu-gold" />
              <span>Circuits {rankedTracks.length > 3 && `(${visibleTracks.length}/${rankedTracks.length})`}</span>
            </p>
            {rankedTracks.length > 3 && (
              <button
                onClick={() => setShowMoreTracks(!showMoreTracks)}
                className="text-[10px] text-lmu-accent hover:text-white font-semibold transition-colors flex items-center gap-0.5"
              >
                <span>{showMoreTracks ? 'Show Less' : `+${rankedTracks.length - 3} More`}</span>
                <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreTracks ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <div className={`space-y-1.5 flex-1 ${showMoreTracks ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
            {visibleTracks.length > 0 ? (
              visibleTracks.map((item, idx) => (
                <div
                  key={item.track}
                  onClick={() => { window.location.hash = `track/${encodeURIComponent(item.track)}`; }}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
                  title={`View ${item.track} Track Details`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`font-mono text-[11px] font-bold shrink-0 ${
                      idx === 0 ? 'text-lmu-gold' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-lmu-muted'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="text-white font-medium truncate group-hover:text-lmu-gold transition-colors">{item.track}</span>
                  </div>
                  <span className="text-lmu-muted font-mono shrink-0 text-[11px]">{item.laps} laps</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-lmu-muted">No track data</p>
            )}
          </div>
          {rankedTracks.length > 3 && (
            <button
              onClick={() => setShowMoreTracks(!showMoreTracks)}
              className="w-full text-center text-[10px] text-lmu-muted hover:text-lmu-accent font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
            >
              <span>{showMoreTracks ? 'Show Top 3 Only' : `Show All ${rankedTracks.length} Circuits`}</span>
              <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreTracks ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {/* Top Cars Card */}
        <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
          <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
            <p className="text-xs font-bold text-lmu-cyan uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4 text-lmu-cyan" />
              <span>Cars {rankedCars.length > 3 && `(${visibleCars.length}/${rankedCars.length})`}</span>
            </p>
            {rankedCars.length > 3 && (
              <button
                onClick={() => setShowMoreCars(!showMoreCars)}
                className="text-[10px] text-lmu-cyan hover:text-white font-semibold transition-colors flex items-center gap-0.5"
              >
                <span>{showMoreCars ? 'Show Less' : `+${rankedCars.length - 3} More`}</span>
                <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreCars ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <div className={`space-y-1.5 flex-1 ${showMoreCars ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
            {visibleCars.length > 0 ? (
              visibleCars.map((item, idx) => (
                <div
                  key={item.car}
                  onClick={() => setSelectedCarClass(item.car.split(' ')[0] || item.car)}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
                  title={`Filter by ${item.car}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`font-mono text-[11px] font-bold shrink-0 ${
                      idx === 0 ? 'text-lmu-cyan' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-lmu-muted'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="text-white font-medium truncate max-w-[130px] group-hover:text-lmu-cyan transition-colors">{item.car}</span>
                  </div>
                  <span className="text-lmu-muted font-mono shrink-0 text-[11px]">{item.laps} laps</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-lmu-muted">No car data</p>
            )}
          </div>
          {rankedCars.length > 3 && (
            <button
              onClick={() => setShowMoreCars(!showMoreCars)}
              className="w-full text-center text-[10px] text-lmu-muted hover:text-lmu-cyan font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
            >
              <span>{showMoreCars ? 'Show Top 3 Only' : `Show All ${rankedCars.length} Cars`}</span>
              <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreCars ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {/* Top Benchmark Laps Card */}
        <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
          <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
            <p className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-purple-400" />
              <span>Benchmarks {rankedRefLaps.length > 3 && `(${visibleRefLaps.length}/${rankedRefLaps.length})`}</span>
            </p>
            {rankedRefLaps.length > 3 && (
              <button
                onClick={() => setShowMoreBenchmarks(!showMoreBenchmarks)}
                className="text-[10px] text-purple-300 hover:text-white font-semibold transition-colors flex items-center gap-0.5"
              >
                <span>{showMoreBenchmarks ? 'Show Less' : `+${rankedRefLaps.length - 3} More`}</span>
                <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreBenchmarks ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <div className={`space-y-1.5 flex-1 ${showMoreBenchmarks ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
            {visibleRefLaps.length > 0 ? (
              visibleRefLaps.map((item, idx) => (
                <div
                  key={item.sessionId || item.track}
                  onClick={() => onSelectSession(item.sessionId)}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
                  title={`Open session details for ${item.track}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`font-mono text-[11px] font-bold shrink-0 ${
                      idx === 0 ? 'text-purple-300' : idx === 1 ? 'text-purple-400' : idx === 2 ? 'text-purple-500' : 'text-lmu-muted'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="text-white font-medium truncate max-w-[110px] group-hover:text-purple-300 transition-colors">{item.track}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-purple-300 font-mono font-bold text-[11px]">{item.percentage.toFixed(1)}%</span>
                    <span className="text-[10px]">{getPaceCategoryStyle(item.category).emoji}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-lmu-muted">No benchmark lap data</p>
            )}
          </div>
          {rankedRefLaps.length > 3 && (
            <button
              onClick={() => setShowMoreBenchmarks(!showMoreBenchmarks)}
              className="w-full text-center text-[10px] text-lmu-muted hover:text-purple-300 font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
            >
              <span>{showMoreBenchmarks ? 'Show Top 3 Only' : `Show All ${rankedRefLaps.length} Benchmark Laps`}</span>
              <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreBenchmarks ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {/* Driving Overview Card */}
        <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
          <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
            <p className="text-xs font-bold text-lmu-green uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-lmu-green" />
              <span>Driving Overview</span>
            </p>
            <span className="text-[10px] text-lmu-green font-mono font-bold">
              {sessions.length.toLocaleString()} Sessions
            </span>
          </div>

          {/* 3 Overview Stat Rows with exact same look and feel */}
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono text-[11px] font-bold shrink-0 text-lmu-green">
                  #1
                </span>
                <span className="text-white font-medium truncate group-hover:text-lmu-green transition-colors">
                  Total Laps Driven
                </span>
              </div>
              <span className="text-lmu-green font-mono font-bold text-[11px] shrink-0">
                {totalLaps.toLocaleString()} laps
              </span>
            </div>

            <div className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono text-[11px] font-bold shrink-0 text-slate-300">
                  #2
                </span>
                <span className="text-white font-medium truncate group-hover:text-lmu-cyan transition-colors">
                  Distance Driven
                </span>
              </div>
              <span className="text-lmu-muted font-mono text-[11px] shrink-0">
                {Math.round(totalDistanceKm).toLocaleString()} km
              </span>
            </div>

            <div className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono text-[11px] font-bold shrink-0 text-amber-600">
                  #3
                </span>
                <span className="text-white font-medium truncate group-hover:text-lmu-gold transition-colors">
                  Driving Time
                </span>
              </div>
              <span className="text-lmu-muted font-mono text-[11px] shrink-0">
                {formatTotalDrivingTime(totalDrivingSeconds)}
              </span>
            </div>
          </div>

          <div className="w-full text-center text-[10px] text-lmu-muted font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1">
            <span>Across {tracks.length} Unique Circuits</span>
          </div>
        </div>

      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">

        <div className="flex flex-wrap items-center gap-3">
          {/* Track Filter */}
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value)}
            className="bg-lmu-bg border border-lmu-border rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-lmu-accent"
          >
            <option value="All">All Tracks ({tracks.length})</option>
            {tracks.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Vehicle Class Filter Buttons */}
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold overflow-x-auto">
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

          {/* Session Type Filter */}
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium">
            {['All', 'Practice', 'Qualifying', 'Race'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg transition-all ${filterType === type
                    ? 'bg-lmu-accent text-white shadow-sm'
                    : 'text-lmu-muted hover:text-white'
                  }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <input
            type="text"
            placeholder="Search track, car, file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-lmu-bg border border-lmu-border rounded-xl px-4 py-1.5 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent w-full md:w-56"
          />

          {/* Hide Empty Results Filter Toggle */}
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${hideEmpty
                ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
                : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
              }`}
            title={hideEmpty ? "Hiding empty sessions (0 laps). Click to show all." : "Showing all sessions including empty results. Click to filter out empty results."}
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Hide Empty Results</span>
            {emptyCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${hideEmpty ? 'bg-lmu-accent text-white' : 'bg-lmu-border text-lmu-muted'
                }`}>
                {emptyCount}
              </span>
            )}
          </button>

          {/* Sort Dropdown (Date / Benchmark Pace) */}
          <div className="flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-lmu-accent" />
            <span className="text-lmu-muted font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as DashboardSortOption)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
              <option value="date-desc" className="bg-lmu-card text-white">Date (Newest First)</option>
              <option value="date-asc" className="bg-lmu-card text-white">Date (Oldest First)</option>
              <option value="pos-asc" className="bg-lmu-card text-white">Best Position (P1 First)</option>
              <option value="pace-asc" className="bg-lmu-card text-white">Benchmark (Best Pace %)</option>
              <option value="pace-desc" className="bg-lmu-card text-white">Benchmark (Slowest Pace %)</option>
            </select>
          </div>
        </div>

      </div>

      {/* Sessions Grid / Table */}
      <div className="glass-panel rounded-2xl p-5">
        <SessionList
          sessions={sortedSessions}
          onSelectSession={onSelectSession}
          showTrackColumn={true}
          headerTitle={
            <>
              <FileText className="w-5 h-5 text-lmu-accent" />
              <span>Session Results ({sortedSessions.length}{hideEmpty && emptyCount > 0 ? ` / ${sessions.length}` : ''})</span>
            </>
          }
          headerSubtitle={
            hideEmpty && emptyCount > 0 ? `Filtering ${emptyCount} empty session${emptyCount > 1 ? 's' : ''}` : 'Click any session to view detailed telemetry & sector timings'
          }
          onResetFilters={(selectedTrack !== 'All' || selectedCarClass !== 'All' || filterType !== 'All' || searchQuery !== '') ? () => {
            setSelectedTrack('All');
            setSelectedCarClass('All');
            setFilterType('All');
            setSearchQuery('');
          } : undefined}
          hideEmptyNotice={hideEmpty && emptyCount > 0 ? (
            <span>
              Note: {emptyCount} empty session{emptyCount > 1 ? 's are' : ' is'} hidden. <button onClick={() => setHideEmpty(false)} className="text-lmu-accent underline hover:text-white">Click here to show empty results</button>.
            </span>
          ) : undefined}
        />
      </div>

    </div>
  );
};
