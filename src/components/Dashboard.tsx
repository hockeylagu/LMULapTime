import React, { useState } from 'react';
import { Gauge, Trophy, Calendar, Car, Zap, FileText, ChevronRight, Video, FilterX, AlertCircle } from 'lucide-react';
import { isSessionEmpty } from '../utils/formatters';

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
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    theoreticalBest: number | null;
    theoreticalBestString: string;
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
}

interface BestLapMetric {
  time: number;
  string: string;
  track: string;
  car: string;
}

interface TheoreticalMetric {
  time: number;
  string: string;
  track: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
  sessions,
  onSelectSession,
  selectedTrack,
  setSelectedTrack,
}) => {
  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);

  // Extract unique tracks
  const tracks = Array.from(new Set(sessions.map(s => s.trackVenue))).filter(Boolean);

  // Count empty results
  const emptyCount = sessions.filter(s => isSessionEmpty(s)).length;

  // Filtered sessions
  const filteredSessions = sessions.filter(s => {
    const matchesTrack = selectedTrack === 'All' || s.trackVenue === selectedTrack;
    const matchesType = filterType === 'All' || s.sessionType.toLowerCase() === filterType.toLowerCase();
    const matchesSearch = searchQuery === '' || 
      s.trackVenue.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.playerDriver?.carType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEmpty = !hideEmpty || !isSessionEmpty(s);
    return matchesTrack && matchesType && matchesSearch && matchesEmpty;
  });

  // Calculate overall metrics
  let totalLaps = 0;
  let overallBestLap: BestLapMetric | null = null;
  let overallTheoretical: TheoreticalMetric | null = null;

  sessions.forEach(s => {
    if (s.playerDriver) {
      totalLaps += s.playerDriver.lapsCount || 0;
      if (s.playerDriver.bestLapTime && (!overallBestLap || s.playerDriver.bestLapTime < overallBestLap.time)) {
        overallBestLap = {
          time: s.playerDriver.bestLapTime,
          string: s.playerDriver.bestLapTimeString,
          track: s.trackVenue,
          car: s.playerDriver.carType,
        };
      }
      if (s.playerDriver.theoreticalBest && (!overallTheoretical || s.playerDriver.theoreticalBest < overallTheoretical.time)) {
        overallTheoretical = {
          time: s.playerDriver.theoreticalBest,
          string: s.playerDriver.theoreticalBestString,
          track: s.trackVenue,
        };
      }
    }
  });

  return (
    <div className="space-y-6">
      
      {/* Top Hero / Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Sessions */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-lmu-muted uppercase tracking-wider">Total Sessions</p>
              <h3 className="text-3xl font-extrabold text-white mt-1">{sessions.length}</h3>
            </div>
            <div className="p-3 bg-lmu-accent/10 text-lmu-accent rounded-xl border border-lmu-accent/20">
              <Calendar className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-lmu-muted mt-3">Across {tracks.length} different tracks</p>
        </div>

        {/* Total Laps Driven */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-lmu-muted uppercase tracking-wider">Total Laps Driven</p>
              <h3 className="text-3xl font-extrabold text-lmu-cyan mt-1">{totalLaps}</h3>
            </div>
            <div className="p-3 bg-lmu-cyan/10 text-lmu-cyan rounded-xl border border-lmu-cyan/20">
              <Gauge className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-lmu-muted mt-3">Parsed from LMU result XML logs</p>
        </div>

        {/* Best Personal Lap */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-lmu-muted uppercase tracking-wider">Personal Best Lap</p>
              <h3 className="text-2xl font-extrabold text-lmu-gold mt-1 font-mono">
                {overallBestLap ? (overallBestLap as BestLapMetric).string : '--:--.---'}
              </h3>
            </div>
            <div className="p-3 bg-lmu-gold/10 text-lmu-gold rounded-xl border border-lmu-gold/20">
              <Trophy className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-lmu-muted mt-3 truncate">
            {overallBestLap ? `${(overallBestLap as BestLapMetric).track} (${(overallBestLap as BestLapMetric).car})` : 'No data yet'}
          </p>
        </div>

        {/* Theoretical Best Lap */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-lmu-muted uppercase tracking-wider">Theoretical Best</p>
              <h3 className="text-2xl font-extrabold text-lmu-green mt-1 font-mono">
                {overallTheoretical ? (overallTheoretical as TheoreticalMetric).string : '--:--.---'}
              </h3>
            </div>
            <div className="p-3 bg-lmu-green/10 text-lmu-green rounded-xl border border-lmu-green/20">
              <Zap className="w-6 h-6" />
            </div>
          </div>
          <p className="text-xs text-lmu-muted mt-3">Combined Best S1 + S2 + S3</p>
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

          {/* Session Type Filter */}
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium">
            {['All', 'Practice', 'Qualifying', 'Race'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === type
                    ? 'bg-lmu-accent text-white shadow-sm'
                    : 'text-lmu-muted hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Hide Empty Results Filter Toggle */}
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              hideEmpty
                ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
                : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
            }`}
            title={hideEmpty ? "Hiding empty sessions (0 laps). Click to show all." : "Showing all sessions including empty results. Click to filter out empty results."}
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Hide Empty Results</span>
            {emptyCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                hideEmpty ? 'bg-lmu-accent text-white' : 'bg-lmu-border text-lmu-muted'
              }`}>
                {emptyCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <input
          type="text"
          placeholder="Search track, car, file..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-lmu-bg border border-lmu-border rounded-xl px-4 py-2 text-sm text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent w-full md:w-64"
        />

      </div>

      {/* Sessions Grid / Table */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-5 h-5 text-lmu-accent" />
            Session Results ({filteredSessions.length}{hideEmpty && emptyCount > 0 ? ` / ${sessions.length}` : ''})
          </h3>
          <span className="text-xs text-lmu-muted">
            {hideEmpty && emptyCount > 0 ? `Filtering ${emptyCount} empty session${emptyCount > 1 ? 's' : ''}` : 'Click any session to view detailed telemetry & sector timings'}
          </span>
        </div>

        {filteredSessions.length === 0 ? (
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
            {filteredSessions.map(s => {
              const p = s.playerDriver;
              const empty = isSessionEmpty(s);
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`glass-panel glass-panel-hover p-4 rounded-xl cursor-pointer flex flex-col justify-between space-y-3 ${
                    empty ? 'border-amber-500/30 bg-amber-950/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                          s.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
                          s.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30' :
                          'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                        }`}>
                          {s.sessionName || s.sessionType}
                        </span>
                        {empty && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Empty
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-white text-base mt-2 truncate leading-tight">
                        {s.trackVenue}
                      </h4>
                      <p className="text-xs text-lmu-muted mt-0.5">{s.timeString}</p>
                    </div>

                    {s.matchingReplayFile && (
                      <span className="p-1.5 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20" title={`Replay VCR: ${s.matchingReplayFile.name}`}>
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
