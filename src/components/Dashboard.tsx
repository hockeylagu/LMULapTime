import React, { useState } from 'react';
import { Calendar, Car, Zap, FileText, ChevronRight, Video, FilterX, AlertCircle, MapPin, Award, ArrowUpDown } from 'lucide-react';
import { isSessionEmpty, getDisplayTrackName, matchesSessionType } from '../utils/formatters';
import { getPaceCategoryStyle, matchesCarClass, VEHICLE_CLASS_OPTIONS } from '../utils/paceCategory';
import { PaceCategory } from '../../server/types';

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
    top3LapsCount?: number;
    lapsCount: number;
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

export type DashboardSortOption = 'date-desc' | 'date-asc' | 'pace-asc' | 'pace-desc';

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
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<DashboardSortOption>('date-desc');

  // Extract unique track layout variations sorted alphabetically
  const tracks = Array.from(new Set(sessions.map(s => getDisplayTrackName(s.trackVenue, s.trackCourse)))).filter(Boolean).sort((a, b) => a.localeCompare(b));

  // Count empty results
  const emptyCount = sessions.filter(s => isSessionEmpty(s)).length;

  // Filtered sessions
  const filteredSessions = sessions.filter(s => {
    const displayTrack = getDisplayTrackName(s.trackVenue, s.trackCourse);
    const matchesTrack = selectedTrack === 'All' || displayTrack === selectedTrack || s.trackVenue === selectedTrack;
    const matchesType = matchesSessionType(s.sessionType, s.sessionName, filterType);
    const isMatchingCarClass = matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedCarClass);
    const matchesSearch = searchQuery === '' ||
      displayTrack.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.trackVenue.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEmpty = !hideEmpty || !isSessionEmpty(s);
    return matchesTrack && matchesType && isMatchingCarClass && matchesSearch && matchesEmpty;
  });

  // Sorted sessions by Date / Benchmark Pace %
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
    } else {
      const pctA = a.playerDriver?.bestLapPacePercentage ?? 999;
      const pctB = b.playerDriver?.bestLapPacePercentage ?? 999;
      return sortBy === 'pace-asc' ? pctA - pctB : pctB - pctA;
    }
  });

  // Calculate overall metrics & top3 aggregations
  let totalLaps = 0;
  const trackLapsMap: Record<string, number> = {};
  const carLapsMap: Record<string, number> = {};
  const allRefLaps: BestRefLapInfo[] = [];

  sessions.forEach(s => {
    if (s.playerDriver) {
      const p = s.playerDriver;
      const lapCount = p.lapsCount || 0;
      totalLaps += lapCount;

      if (s.trackVenue && lapCount > 0) {
        trackLapsMap[s.trackVenue] = (trackLapsMap[s.trackVenue] || 0) + lapCount;
      }

      if (p.carType && lapCount > 0) {
        carLapsMap[p.carType] = (carLapsMap[p.carType] || 0) + lapCount;
      }

      if (p.bestLapPacePercentage && p.bestLapPaceCategory && p.bestLapTimeString) {
        allRefLaps.push({
          sessionId: s.id,
          percentage: p.bestLapPacePercentage,
          category: p.bestLapPaceCategory,
          lapTimeString: p.bestLapTimeString,
          track: getDisplayTrackName(s.trackVenue, s.trackCourse),
          car: p.carType,
        });
      }
    }
  });

  // Top 3 Tracks by Laps
  const top3Tracks = Object.entries(trackLapsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([track, laps]) => ({ track, laps }));

  // Top 3 Cars by Laps
  const top3Cars = Object.entries(carLapsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([car, laps]) => ({ car, laps }));

  // Top 3 Reference Laps (lowest percentage relative to reference benchmark)
  const uniqueTrackRefLapsMap: Record<string, BestRefLapInfo> = {};
  allRefLaps.forEach(item => {
    if (!uniqueTrackRefLapsMap[item.track] || item.percentage < uniqueTrackRefLapsMap[item.track].percentage) {
      uniqueTrackRefLapsMap[item.track] = item;
    }
  });

  const top3RefLaps = Object.values(uniqueTrackRefLapsMap)
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 3);

  return (
    <div className="space-y-6">

      {/* Top Hero / Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Top 3 Circuits Card */}
        <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
            <p className="text-xs font-bold text-lmu-gold uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-lmu-gold" />
              Top 3 Circuits
            </p>
            <span className="text-[10px] text-lmu-muted">By Laps</span>
          </div>
          <div className="space-y-1.5 flex-1">
            {top3Tracks.length > 0 ? (
              top3Tracks.map((item, idx) => (
                <div
                  key={item.track}
                  onClick={() => { window.location.hash = `track/${encodeURIComponent(item.track)}`; }}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
                  title={`View ${item.track} Track Details`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`font-mono text-[11px] font-bold ${idx === 0 ? 'text-lmu-gold' : idx === 1 ? 'text-slate-300' : 'text-amber-600'}`}>
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
        </div>

        {/* Top 3 Cars Card */}
        <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
            <p className="text-xs font-bold text-lmu-cyan uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4 text-lmu-cyan" />
              Top 3 Cars
            </p>
            <span className="text-[10px] text-lmu-muted">By Laps</span>
          </div>
          <div className="space-y-1.5 flex-1">
            {top3Cars.length > 0 ? (
              top3Cars.map((item, idx) => (
                <div
                  key={item.car}
                  onClick={() => setSelectedCarClass(item.car.split(' ')[0] || item.car)}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
                  title={`Filter by ${item.car}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`font-mono text-[11px] font-bold ${idx === 0 ? 'text-lmu-cyan' : idx === 1 ? 'text-slate-300' : 'text-amber-600'}`}>
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
        </div>

        {/* Top 3 Benchmark Laps Card */}
        <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
            <p className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-purple-400" />
              Top 3 Benchmark Laps
            </p>
            <span className="text-[10px] text-lmu-muted">Vs Ref</span>
          </div>
          <div className="space-y-1.5 flex-1">
            {top3RefLaps.length > 0 ? (
              top3RefLaps.map((item, idx) => (
                <div
                  key={item.sessionId || item.track}
                  onClick={() => onSelectSession(item.sessionId)}
                  className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
                  title={`Open session details for ${item.track}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`font-mono text-[11px] font-bold ${idx === 0 ? 'text-purple-300' : idx === 1 ? 'text-purple-400' : 'text-purple-500'}`}>
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
        </div>

        {/* Total Overview */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-lmu-muted uppercase tracking-wider">Driving Overview</p>
              <h3 className="text-2xl font-extrabold text-lmu-green mt-1">
                {sessions.length} <span className="text-sm font-normal text-lmu-muted">Sessions</span>
              </h3>
            </div>
            <div className="p-3 bg-lmu-green/10 text-lmu-green rounded-xl border border-lmu-green/20">
              <Calendar className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-lmu-muted mt-3">
            {totalLaps} Total Laps driven across {tracks.length} Tracks
          </p>
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
              <option value="pace-asc" className="bg-lmu-card text-white">Benchmark (Best Pace %)</option>
              <option value="pace-desc" className="bg-lmu-card text-white">Benchmark (Slowest Pace %)</option>
            </select>
          </div>
        </div>

      </div>

      {/* Sessions Grid / Table */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-5 h-5 text-lmu-accent" />
            Session Results ({sortedSessions.length}{hideEmpty && emptyCount > 0 ? ` / ${sessions.length}` : ''})
          </h3>
          <span className="text-xs text-lmu-muted">
            {hideEmpty && emptyCount > 0 ? `Filtering ${emptyCount} empty session${emptyCount > 1 ? 's' : ''}` : 'Click any session to view detailed telemetry & sector timings'}
          </span>
        </div>

        {sortedSessions.length === 0 ? (
          <div className="py-12 text-center text-lmu-muted">
            <p className="text-base font-medium">No sessions found matching filters.</p>
            {hideEmpty && emptyCount > 0 && (
              <p className="text-xs text-lmu-muted mt-2">
                Note: {emptyCount} empty session{emptyCount > 1 ? 's are' : ' is'} hidden. <button onClick={() => setHideEmpty(false)} className="text-lmu-accent underline hover:text-white">Click here to show empty results</button>.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSessions.map(s => {
              const p = s.playerDriver;
              const empty = isSessionEmpty(s);
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`glass-panel glass-panel-hover p-4 rounded-xl cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden ${empty ? 'border-amber-500/30 bg-amber-950/10' : ''
                    }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${s.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
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
                      <h4 className="font-bold text-white text-base mt-2 truncate leading-tight" title={getDisplayTrackName(s.trackVenue, s.trackCourse)}>
                        {getDisplayTrackName(s.trackVenue, s.trackCourse)}
                      </h4>
                      <p className="text-xs text-lmu-muted mt-0.5">{s.timeString}</p>
                    </div>

                    {s.matchingReplayFile && (
                      <span className="p-1.5 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20 shrink-0 mt-0.5" title={`Replay VCR: ${s.matchingReplayFile.name}`}>
                        <Video className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  {/* Driver / Car / Lap info */}
                  <div className="pt-2 border-t border-lmu-border/60 flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <p className="text-lmu-muted flex items-center gap-1">
                        <Car className="w-3.5 h-3.5 text-lmu-cyan" />
                        <span className="text-white font-medium truncate max-w-[160px]">
                          {p ? p.carType : 'N/A'}
                        </span>
                      </p>
                      <p className="text-lmu-muted">
                        Laps Driven: <span className="text-white font-semibold">{p ? p.lapsCount : 0}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lmu-muted">Best Lap</p>
                      <p className="font-mono font-bold text-sm text-lmu-gold">
                        {p?.bestLapTimeString || '--:--.---'}
                      </p>
                      {p?.bestLapPaceCategory && (
                        <div className="mt-0.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${getPaceCategoryStyle(p.bestLapPaceCategory).badgeClass}`}>
                            <span>{getPaceCategoryStyle(p.bestLapPaceCategory).emoji}</span>
                            <span>{p.bestLapPaceCategory}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs text-lmu-accent font-semibold group">
                    <span>Analyze Sector Details</span>
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
