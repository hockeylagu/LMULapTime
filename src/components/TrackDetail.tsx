import React, { useState, useEffect } from 'react';
import { ArrowLeft, Zap, ChevronRight, FileText } from 'lucide-react';
import { formatTime } from '../utils/formatters.js';
import { getPaceCategoryStyle, formatPacePercentage, matchesCarClass, VEHICLE_CLASS_OPTIONS } from '../utils/paceCategory.js';
import { ReferenceLaptimeEntry, PaceCategory } from '../../server/types.js';

interface SessionMeta {
  id: string;
  filename: string;
  trackVenue: string;
  timeString: string;
  sessionType: string;
  sessionName: string;
  driversCount: number;
  playerDriver?: {
    name: string;
    carType: string;
    carClass: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    lapsCount: number;
  };
}

interface TrackDetailProps {
  trackName: string;
  onBack: () => void;
  onSelectSession: (sessionId: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
}

export const TrackDetail: React.FC<TrackDetailProps> = ({
  trackName,
  onBack,
  onSelectSession,
  selectedCarClass,
  setSelectedCarClass,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    trackName: string;
    normalizedTrackName: string;
    sessionsCount: number;
    sessions: SessionMeta[];
    benchmarks: ReferenceLaptimeEntry[];
  } | null>(null);

  const selectedClass = selectedCarClass;
  const setSelectedClass = setSelectedCarClass;

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

  const filteredSessions = sessions.filter(s =>
    matchesCarClass(s.playerDriver?.carClass || '', s.playerDriver?.carType || '', selectedClass)
  );

  // Helper to find driver's overall best lap in filtered sessions for this track
  const findOverallBestInFilteredSessions = () => {
    let bestTime: number | null = null;
    let bestTimeStr = '--:--.---';
    let bestCar = '';
    let bestCarClass = '';
    let bestPaceCat: PaceCategory | null = null;
    let bestPacePct: number | null = null;

    filteredSessions.forEach(s => {
      if (s.playerDriver) {
        const p = s.playerDriver;

        if (p.bestLapTime) {
          if (bestTime === null || p.bestLapTime < bestTime) {
            bestTime = p.bestLapTime;
            bestTimeStr = p.bestLapTimeString;
            bestCar = p.carType;
            bestCarClass = p.carClass || '';
            bestPaceCat = p.bestLapPaceCategory || null;
            bestPacePct = p.bestLapPacePercentage || null;
          }
        }
      }
    });

    return { bestTime, bestTimeStr, bestCar, bestCarClass, bestPaceCat, bestPacePct };
  };

  const currentClassDriverStats = findOverallBestInFilteredSessions();

  // Find current benchmark matching selectedClass or matching the best lap's car class when selectedClass is 'All'
  let currentBenchmark: ReferenceLaptimeEntry | null = null;
  if (benchmarks && benchmarks.length > 0) {
    if (selectedClass && selectedClass !== 'All') {
      currentBenchmark = benchmarks.find(b => matchesCarClass(b.carClass, b.carClass, selectedClass)) || benchmarks[0];
    } else if (currentClassDriverStats.bestCarClass || currentClassDriverStats.bestCar) {
      currentBenchmark = benchmarks.find(b =>
        matchesCarClass(b.carClass, b.carClass, currentClassDriverStats.bestCarClass || currentClassDriverStats.bestCar) ||
        matchesCarClass(currentClassDriverStats.bestCarClass || currentClassDriverStats.bestCar, currentClassDriverStats.bestCar, b.carClass)
      ) || benchmarks[0];
    } else {
      currentBenchmark = benchmarks[0];
    }
  }

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
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30">
                Official Circuit
              </span>
              <span className="text-xs text-lmu-muted">{filteredSessions.length} Recorded Sessions</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white mt-1">{trackName}</h2>
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
            
            {/* Class Header Banner */}
            <div className="p-4 rounded-xl bg-lmu-bg/80 border border-lmu-border flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold text-white">{currentBenchmark.carClass} Class</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-lmu-card text-lmu-muted border border-lmu-border">
                    {currentBenchmark.patch}
                  </span>
                </div>
                {currentBenchmark.fastestCar && (
                  <p className="text-xs text-lmu-muted mt-1">
                    Spreadsheet Record Car: <strong className="text-white">{currentBenchmark.fastestCar}</strong> ({formatTime(currentBenchmark.recordLaptimeSec || null)})
                  </p>
                )}
              </div>

              {/* Player Personal Best in this Class */}
              {currentClassDriverStats && currentClassDriverStats.bestTime ? (
                <div className="bg-lmu-card p-3 rounded-xl border border-lmu-border text-right shrink-0">
                  <p className="text-[11px] font-semibold text-lmu-muted uppercase">Your Best ({currentBenchmark.carClass})</p>
                  <div className="flex items-baseline justify-end gap-2 mt-0.5">
                    <h4 className="text-xl font-extrabold text-lmu-gold font-mono">
                      {currentClassDriverStats.bestTimeStr}
                    </h4>
                  </div>
                  {currentClassDriverStats.bestPaceCat && (
                    <div className="mt-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${getPaceCategoryStyle(currentClassDriverStats.bestPaceCat).badgeClass}`}>
                        <span>{getPaceCategoryStyle(currentClassDriverStats.bestPaceCat).emoji}</span>
                        <span>{currentClassDriverStats.bestPaceCat}</span>
                        <span className="opacity-80 text-[10px]">({formatPacePercentage(currentClassDriverStats.bestPacePct)})</span>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-lmu-card/50 p-3 rounded-xl border border-lmu-border/50 text-right text-xs text-lmu-muted shrink-0">
                  No laps recorded yet in <strong className="text-white">{currentBenchmark.carClass}</strong>
                </div>
              )}
            </div>

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

      {/* Recorded Sessions on this Track */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-5 h-5 text-lmu-accent" />
          Sessions Recorded on {trackName} ({filteredSessions.length})
        </h3>

        {filteredSessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSessions.map(s => {
              const p = s.playerDriver;
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className="glass-panel glass-panel-hover p-4 rounded-xl cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                        s.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
                        s.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30' :
                        'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                      }`}>
                        {s.sessionName || s.sessionType}
                      </span>
                      <p className="text-xs text-lmu-muted mt-2">{s.timeString}</p>
                    </div>
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
                      {p?.bestLapPaceCategory && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${getPaceCategoryStyle(p.bestLapPaceCategory).badgeClass}`}>
                          <span>{getPaceCategoryStyle(p.bestLapPaceCategory).emoji}</span>
                          <span>{p.bestLapPaceCategory}</span>
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
        ) : (
          <p className="text-xs text-lmu-muted">No telemetry sessions recorded for this track yet.</p>
        )}
      </div>

    </div>
  );
};
