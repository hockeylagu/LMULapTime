import React, { useState, useEffect } from 'react';
import { ArrowLeft, Video, Download, Zap, ShieldCheck, AlertTriangle, TrendingUp, Clock, Gauge, Disc, Sliders, Fuel, ChevronRight, ArrowLeftRight, Scale, Target } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { DetailedSession, SessionProgressionPoint } from '../../server/types.js';
import { formatTime, getDisplayTrackName } from '../utils/formatters.js';
import { getPaceCategoryStyle, formatPacePercentage, matchesCarClass, findReferenceEntry, matchesTrack } from '../utils/paceCategory.js';

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({ sessionId, onBack }) => {
  const [session, setSession] = useState<DetailedSession | null>(null);
  const [refCache, setRefCache] = useState<any>(null);
  const [progression, setProgression] = useState<SessionProgressionPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [copiedReplay, setCopiedReplay] = useState<boolean>(false);
  const [chartMetric, setChartMetric] = useState<'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy'>('lapTime');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/session/${sessionId}`).then(res => res.json()),
      fetch('/api/reference-laptimes').then(res => res.json()).catch(() => null),
      fetch('/api/progression').then(res => res.json()).catch(() => []),
    ])
      .then(([sessionData, refData, progData]) => {
        setSession(sessionData);
        setRefCache(refData);
        if (Array.isArray(progData)) {
          setProgression(progData);
        }
        if (sessionData.playerDriver) {
          setSelectedDriverName(sessionData.playerDriver.name);
        } else if (sessionData.drivers && sessionData.drivers.length > 0) {
          setSelectedDriverName(sessionData.drivers[0].name);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load session detail data:', err);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="py-20 text-center text-lmu-muted glass-panel rounded-2xl">
        <div className="inline-block animate-spin w-8 h-8 border-4 border-lmu-accent border-t-transparent rounded-full mb-3" />
        <p className="text-sm font-medium">Loading session telemetry and lap data...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="py-12 text-center text-lmu-muted glass-panel rounded-2xl">
        <p className="text-lg font-bold text-white mb-3">Session Not Found</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-lmu-accent text-white rounded-xl font-medium text-xs uppercase"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const selectedDriver = session.drivers ? (session.drivers.find(d => d.name === selectedDriverName) || session.drivers[0]) : undefined;

  const hasTireWearData = selectedDriver?.laps?.some(
    l => l.tireWear !== undefined && l.tireWear !== null && (l.tireWear.fl !== null || l.tireWear.avg !== null)
  ) ?? false;

  const hasVirtualEnergyData = (selectedDriver?.laps?.some(
    l => l.virtualEnergy !== null && l.virtualEnergy !== undefined
  ) || (selectedDriver?.avgVePerLap !== null && selectedDriver?.avgVePerLap !== undefined)) ?? false;

  const hasFuelData = (selectedDriver?.laps?.some(
    l => (l.fuel !== null && l.fuel !== undefined) || (l.virtualEnergy !== null && l.virtualEnergy !== undefined)
  ) || (selectedDriver?.avgFuelPerLap !== null && selectedDriver?.avgFuelPerLap !== undefined) || hasVirtualEnergyData) ?? false;

  const activeChartMetric = (chartMetric === 'tireWear' && !hasTireWearData) || (chartMetric === 'fuelEnergy' && !hasFuelData)
    ? 'lapTime'
    : chartMetric;

  // All-time Personal Best for this specific driver, track, and vehicle category
  const allTimeCategoryTrackPB = (() => {
    if (!session || !selectedDriver || progression.length === 0) return null;
    const driverClass = selectedDriver.carClass || selectedDriver.carType || '';
    const driverNorm = (selectedDriver.name || '').toLowerCase().trim();

    const matchingLapTimes = progression
      .filter(p => {
        const isTrack = matchesTrack(session.trackVenue, p.trackVenue, p.trackCourse) ||
          matchesTrack(p.displayTrack || p.trackVenue, session.trackVenue, session.trackCourse);
        const isClass = matchesCarClass(p.carClass, p.carType, driverClass) ||
          matchesCarClass(driverClass, selectedDriver.carType, p.carClass);
        const isDriver = !driverNorm || (p.driverName || '').toLowerCase().trim() === driverNorm ||
          (p.driverName || '').toLowerCase().includes(driverNorm) ||
          driverNorm.includes((p.driverName || '').toLowerCase());
        return isTrack && isClass && isDriver && p.bestLapTime !== null && p.bestLapTime > 0;
      })
      .map(p => p.bestLapTime as number);

    return matchingLapTimes.length > 0 ? Math.min(...matchingLapTimes) : selectedDriver.bestLapTime;
  })();

  const isCurrentSessionAllTimePB = selectedDriver?.bestLapTime !== null &&
    allTimeCategoryTrackPB !== null &&
    (selectedDriver?.bestLapTime || 0) <= allTimeCategoryTrackPB + 0.0005;

  const refEntry = refCache?.entries && session && selectedDriver
    ? findReferenceEntry(
        refCache.entries,
        session.trackVenue,
        session.trackCourse || '',
        selectedDriver.carClass || selectedDriver.carType,
        selectedDriver.carType
      )
    : null;

  const fuelStrategy = (() => {
    if (!selectedDriver || !selectedDriver.avgFuelPerLap) return null;
    const avgFuel = selectedDriver.avgFuelPerLap;
    const estFuelLaps = selectedDriver.estFuelStintLaps || (avgFuel > 0 ? Math.floor(100 / avgFuel) : null);
    const avgVe = selectedDriver.avgVePerLap || null;
    const estVeLaps = selectedDriver.estVeStintLaps || (avgVe && avgVe > 0 ? Math.floor(100 / avgVe) : null);

    const optimalRatio = avgFuel > 0 && avgVe && avgVe > 0
      ? parseFloat((avgFuel / avgVe).toFixed(2))
      : null;

    const zeroWasteFuelPct = estVeLaps && avgFuel
      ? Math.min(100, Math.ceil((estVeLaps + 0.5) * avgFuel))
      : null;

    let limiter: 've' | 'fuel' | 'balanced' | null = null;
    let lapDelta = 0;
    let surplusFuelPct = 0;

    if (estFuelLaps && estVeLaps) {
      if (estVeLaps < estFuelLaps - 1) {
        limiter = 've';
        lapDelta = estFuelLaps - estVeLaps;
        surplusFuelPct = Math.max(0, Math.round(100 - (estVeLaps * avgFuel)));
      } else if (estFuelLaps < estVeLaps - 1) {
        limiter = 'fuel';
        lapDelta = estVeLaps - estFuelLaps;
      } else {
        limiter = 'balanced';
      }
    }

    return {
      avgFuel,
      estFuelLaps,
      avgVe,
      estVeLaps,
      optimalRatio,
      zeroWasteFuelPct,
      limiter,
      lapDelta,
      surplusFuelPct,
    };
  })();

  const handleCopyReplayPath = () => {
    if (session.matchingReplayFile) {
      navigator.clipboard.writeText(session.matchingReplayFile.path);
      setCopiedReplay(true);
      setTimeout(() => setCopiedReplay(false), 2000);
    }
  };

  const handleExportCsv = () => {
    if (!selectedDriver) return;
    const headers = ['Lap', 'LapTime_Seconds', 'LapTime_Formatted', 'PaceCategory', 'PacePercentage', 'S1', 'S2', 'S3', 'TopSpeed_kmh', 'FrontTire', 'RearTire', 'PitStop', 'Valid'];
    const rows = selectedDriver.laps.map(l => [
      l.lapNum,
      l.lapTime || '',
      l.lapTimeString,
      l.paceCategory || '',
      l.pacePercentage ? `${l.pacePercentage}%` : '',
      l.s1 || '',
      l.s2 || '',
      l.s3 || '',
      l.topSpeed || '',
      l.fCompound,
      l.rCompound,
      l.isPitStop ? 'Yes' : 'No',
      l.isValid ? 'Yes' : 'No',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${session.trackVenue}_${session.sessionName}_${selectedDriver.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">

      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-accent transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sessions
        </button>

        <div className="flex items-center gap-3">
          {session.matchingReplayFile && (
            <button
              onClick={handleCopyReplayPath}
              title={`Matching Replay: ${session.matchingReplayFile.name}\nPath: ${session.matchingReplayFile.path}\nClick to copy path`}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
                copiedReplay
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-lmu-card text-emerald-400 border-lmu-border hover:border-emerald-500/40 hover:bg-emerald-500/10'
              }`}
            >
              <Video className="w-4 h-4 text-emerald-400" />
              {copiedReplay ? 'Path Copied!' : 'Copy Replay (.VCR)'}
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-white hover:border-lmu-green transition-all"
          >
            <Download className="w-4 h-4 text-lmu-green" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Session Title Card */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${session.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
                  session.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30' :
                    'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                }`}>
                {session.sessionName} ({session.sessionType})
              </span>
              <span className="text-xs text-lmu-muted">{session.timeString}</span>
              {(session.weatherInfo || (session as any).weather?.weatherString) && (
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-lmu-bg border border-lmu-border text-white flex items-center gap-1">
                  {session.weatherInfo || (session as any).weather?.weatherString}
                </span>
              )}
            </div>
            <h2
              onClick={() => {
                const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
                window.location.hash = `track/${encodeURIComponent(trackName)}`;
              }}
              className="text-2xl font-extrabold text-white mt-1 cursor-pointer hover:text-lmu-gold transition-colors inline-flex items-center gap-2 group max-w-full min-w-0"
              title={`View ${getDisplayTrackName(session.trackVenue, session.trackCourse)} Track Details`}
            >
              <span className="truncate">{getDisplayTrackName(session.trackVenue, session.trackCourse)}</span>
              <ChevronRight className="w-5 h-5 text-lmu-muted group-hover:text-lmu-gold group-hover:translate-x-0.5 transition-all shrink-0" />
            </h2>
            <p className="text-xs text-lmu-muted mt-0.5">{session.trackCourse} • {session.trackEvent || 'Session'}</p>
          </div>

          {/* Driver Selector */}
          <div className="flex items-center gap-3 bg-lmu-bg p-2 rounded-xl border border-lmu-border">
            <span className="text-xs font-semibold text-lmu-muted uppercase">Driver:</span>
            <select
              value={selectedDriverName}
              onChange={(e) => setSelectedDriverName(e.target.value)}
              className="bg-lmu-card border border-lmu-border rounded-lg px-3 py-1.5 text-sm text-white font-medium focus:outline-none focus:border-lmu-accent"
            >
              {(session.drivers || []).map(d => (
                <option key={d.name} value={d.name}>
                  {d.isPlayer ? '⭐ ' : ''}{d.name} ({d.carType})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Session Rules & Server Configuration */}
        {session.settings && (
          <div className="pt-3 border-t border-lmu-border/50 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5 mr-1">
              <Sliders className="w-3.5 h-3.5 text-lmu-accent" />
              Rules & Config:
            </span>

            {session.settings.modeSetting && (
              <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-semibold">
                🎮 {session.settings.modeSetting}
              </span>
            )}

            {session.settings.serverName && (
              <span className="px-2.5 py-1 rounded bg-lmu-card text-lmu-cyan border border-lmu-border text-xs font-semibold truncate max-w-[200px]" title={session.settings.serverName}>
                🌐 {session.settings.serverName}
              </span>
            )}

            {session.settings.damageMultiplier !== undefined && (
              <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
                🛡️ Damage: <strong className={session.settings.damageMultiplier > 0 ? 'text-amber-300' : 'text-emerald-300'}>{session.settings.damageMultiplier}%</strong>
              </span>
            )}

            {session.settings.fuelMultiplier !== undefined && (
              <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
                ⛽ Fuel: <strong className="text-white">{session.settings.fuelMultiplier}x</strong>
              </span>
            )}

            {session.settings.tireMultiplier !== undefined && (
              <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
                🛞 Tire Wear: <strong className="text-white">{session.settings.tireMultiplier}x</strong>
              </span>
            )}

            {session.settings.tireWarmers !== undefined && (
              <span className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                session.settings.tireWarmers
                  ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                  : 'bg-sky-950/40 text-sky-300 border-sky-500/30'
              }`}>
                🔥 {session.settings.tireWarmers ? 'Warm Tires' : 'Cold Tires'}
              </span>
            )}

            {session.settings.fixedSetups !== undefined && (
              <span className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                session.settings.fixedSetups
                  ? 'bg-purple-950/40 text-purple-300 border-purple-500/30'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
              }`}>
                🔧 {session.settings.fixedSetups ? 'Fixed Setup' : 'Open Setup'}
              </span>
            )}

            {session.settings.durationMinutes !== undefined && session.settings.durationMinutes > 0 && (
              <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
                ⏱️ {session.settings.durationMinutes} min
              </span>
            )}

            {session.settings.raceLaps !== undefined && session.settings.raceLaps > 0 && session.settings.raceLaps < 2147483640 && (
              <span className="px-2.5 py-1 rounded bg-lmu-card text-white border border-lmu-border text-xs font-mono">
                🏁 {session.settings.raceLaps} Laps
              </span>
            )}
          </div>
        )}

        {/* Reference Lap Targets for this Track & Category */}
        {refEntry && (
          <div className="pt-3 border-t border-lmu-border/50 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-lmu-gold flex items-center gap-1.5 mr-1">
              <Zap className="w-4 h-4 text-lmu-gold" />
              {refEntry.carClass} Reference Targets:
            </span>
            <span className="px-2.5 py-1 rounded bg-purple-950/60 text-purple-300 border border-purple-500/40 text-xs font-mono">
              👾 Alien: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.alienSec)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 text-xs font-mono">
              🏆 Competitive: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.competitiveSec)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-xs font-mono">
              ⭐ Good: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.goodSec)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded bg-sky-950/60 text-sky-300 border border-sky-500/40 text-xs font-mono">
              🏎️ Midpack: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.midpackSec)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded bg-orange-950/60 text-orange-300 border border-orange-500/40 text-xs font-mono">
              🐢 Tail-ender: <strong className="text-white ml-0.5">{formatTime(refEntry.targets.tailEnderSec)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Selected Driver Summary Cards */}
      {selectedDriver && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
            <p className={`text-xs uppercase font-semibold ${isCurrentSessionAllTimePB ? 'text-lmu-gold font-bold flex items-center gap-1' : 'text-lmu-muted'}`}>
              {isCurrentSessionAllTimePB ? `⭐ Personal Best (${selectedDriver.carClass || 'Class'})` : 'Session Best Lap'}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <h4 className={`text-2xl font-extrabold font-mono ${isCurrentSessionAllTimePB ? 'text-lmu-gold' : 'text-white'}`}>
                {selectedDriver.bestLapTimeString}
              </h4>
            </div>
            {selectedDriver.bestLapPaceCategory && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${getPaceCategoryStyle(selectedDriver.bestLapPaceCategory).badgeClass}`}>
                  <span>{getPaceCategoryStyle(selectedDriver.bestLapPaceCategory).emoji}</span>
                  <span>{selectedDriver.bestLapPaceCategory}</span>
                  <span className="opacity-80 text-[10px]">({formatPacePercentage(selectedDriver.bestLapPacePercentage)})</span>
                </span>
                {!isCurrentSessionAllTimePB && allTimeCategoryTrackPB && (
                  <span className="text-[11px] text-lmu-muted" title={`Driver's all-time personal best for this track in ${selectedDriver.carClass || 'this class'}`}>
                    Class PB: <strong className="text-lmu-gold font-mono">{formatTime(allTimeCategoryTrackPB)}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="glass-panel p-4 rounded-xl">
            <p className="text-xs text-lmu-muted uppercase font-semibold">Theoretical Best</p>
            <h4 className="text-2xl font-extrabold text-lmu-green font-mono mt-1">
              {selectedDriver.theoreticalBestString}
            </h4>
          </div>

          <div className="glass-panel p-4 rounded-xl">
            <p className="text-xs text-lmu-muted uppercase font-semibold">Best Sectors (S1 / S2 / S3)</p>
            <p className="text-xs font-mono text-white mt-1">
              S1: <span className="text-lmu-gold font-bold">{formatTime(selectedDriver.bestS1)}</span>
            </p>
            <p className="text-xs font-mono text-white">
              S2: <span className="text-lmu-blue font-bold">{formatTime(selectedDriver.bestS2)}</span>
            </p>
            <p className="text-xs font-mono text-white">
              S3: <span className="text-lmu-green font-bold">{formatTime(selectedDriver.bestS3)}</span>
            </p>
          </div>

          <div className="glass-panel p-4 rounded-xl">
            <p className="text-xs text-lmu-muted uppercase font-semibold">Car & Class</p>
            <h4 className="text-sm font-bold text-white mt-1 truncate">{selectedDriver.carType}</h4>
            <p className="text-xs text-lmu-muted mt-0.5">{selectedDriver.carClass} • Car #{selectedDriver.carNumber}</p>
          </div>
        </div>
      )}

      {/* Session Lap Telemetry & Sector Analysis Chart */}
      {selectedDriver && selectedDriver.laps && selectedDriver.laps.length > 0 && (() => {
        const sessionChartData = selectedDriver.laps.map(l => ({
          lapNum: `Lap ${l.lapNum}`,
          lapNumber: l.lapNum,
          lapTime: l.lapTime && l.isValid ? l.lapTime : null,
          lapTimeString: l.lapTimeString,
          s1: l.s1 && l.isValid ? l.s1 : null,
          s2: l.s2 && l.isValid ? l.s2 : null,
          s3: l.s3 && l.isValid ? l.s3 : null,
          s1String: formatTime(l.s1),
          s2String: formatTime(l.s2),
          s3String: formatTime(l.s3),
          topSpeed: l.topSpeed || null,
          twFL: l.tireWear?.fl ?? null,
          twFR: l.tireWear?.fr ?? null,
          twRL: l.tireWear?.rl ?? null,
          twRR: l.tireWear?.rr ?? null,
          twAvg: l.tireWear?.avg ?? null,
          tireWear: l.tireWear,
          fuel: l.fuel ?? null,
          fuelUsed: l.fuelUsed ?? null,
          virtualEnergy: l.virtualEnergy ?? null,
          virtualEnergyUsed: l.virtualEnergyUsed ?? null,
          isValid: l.isValid,
          isPitStop: l.isPitStop,
        }));

        const CustomTooltip = ({ active, payload }: any) => {
          if (!active || !payload || !payload.length) return null;
          const data = payload[0].payload;
          return (
            <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono">
              <div className="font-bold text-white flex items-center justify-between gap-3 border-b border-lmu-border/60 pb-1 mb-1 font-sans">
                <span>{data.lapNum}</span>
                {data.isPitStop && <span className="text-[10px] text-amber-400">🛑 Pit Stop</span>}
                {!data.isValid && <span className="text-[10px] text-rose-400">⚠️ Invalid</span>}
              </div>

              {activeChartMetric === 'lapTime' && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-lmu-muted">Lap Pace:</span>
                  <span className="font-bold text-lmu-gold">{data.lapTimeString}</span>
                </div>
              )}

              {activeChartMetric === 'sectors' && (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-lmu-gold">Sector 1:</span>
                    <span className="font-bold text-white">{data.s1String}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-lmu-cyan">Sector 2:</span>
                    <span className="font-bold text-white">{data.s2String}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-lmu-green">Sector 3:</span>
                    <span className="font-bold text-white">{data.s3String}</span>
                  </div>
                </>
              )}

              {activeChartMetric === 'topSpeed' && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-lmu-muted">Top Speed:</span>
                  <span className="font-bold text-lmu-cyan">{data.topSpeed ? `${data.topSpeed.toFixed(1)} km/h` : 'N/A'}</span>
                </div>
              )}

              {activeChartMetric === 'tireWear' && data.tireWear && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sky-400">Front Left (FL):</span>
                    <span className="text-white font-bold">{data.twFL}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-blue-400">Front Right (FR):</span>
                    <span className="text-white font-bold">{data.twFR}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-emerald-400">Rear Left (RL):</span>
                    <span className="text-white font-bold">{data.twRL}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-amber-400">Rear Right (RR):</span>
                    <span className="text-white font-bold">{data.twRR}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-lmu-border/50 pt-1 mt-1">
                    <span className="text-lmu-muted">4-Tire Average:</span>
                    <span className="text-lmu-gold font-bold">{data.twAvg}%</span>
                  </div>
                </div>
              )}

              {activeChartMetric === 'fuelEnergy' && (
                <div className="space-y-1">
                  {data.fuel !== null && data.fuel !== undefined && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-amber-400">Fuel Level:</span>
                      <span className="text-white font-bold">{data.fuel.toFixed(1)}% {data.fuelUsed ? `(-${data.fuelUsed.toFixed(1)}%)` : ''}</span>
                    </div>
                  )}
                  {data.virtualEnergy !== null && data.virtualEnergy !== undefined && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-indigo-400">Virtual Energy:</span>
                      <span className="text-white font-bold">{data.virtualEnergy.toFixed(1)}% {data.virtualEnergyUsed ? `(-${data.virtualEnergyUsed.toFixed(1)}%)` : ''}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };

        const sessionChartTimes = (
          activeChartMetric === 'lapTime'
            ? sessionChartData.map(d => d.lapTime)
            : activeChartMetric === 'sectors'
            ? sessionChartData.flatMap(d => [d.s1, d.s2, d.s3])
            : activeChartMetric === 'topSpeed'
            ? sessionChartData.map(d => d.topSpeed)
            : activeChartMetric === 'tireWear'
            ? sessionChartData.flatMap(d => [d.twFL, d.twFR, d.twRL, d.twRR])
            : sessionChartData.flatMap(d => [d.fuel, d.virtualEnergy])
        ).filter((v): v is number => v !== null && v > 0);

        const padding = activeChartMetric === 'topSpeed' ? 5 : 1;
        const yDomainMin = (activeChartMetric === 'tireWear' || activeChartMetric === 'fuelEnergy')
          ? Math.max(0, Math.floor(Math.min(...(sessionChartTimes.length ? sessionChartTimes : [50])) - 2))
          : sessionChartTimes.length > 0
          ? Math.max(0, Math.floor(Math.min(...sessionChartTimes) - padding))
          : 'auto';

        const yDomainMax = (activeChartMetric === 'tireWear' || activeChartMetric === 'fuelEnergy')
          ? 100
          : sessionChartTimes.length > 0
          ? Math.ceil(Math.max(...sessionChartTimes) + padding)
          : 'auto';

        return (
          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-lmu-accent" />
                  {activeChartMetric === 'tireWear'
                    ? 'Tire Wear & Degradation Telemetry'
                    : activeChartMetric === 'fuelEnergy'
                    ? 'Fuel Consumption & Virtual Energy Telemetry'
                    : 'Lap & Sector Telemetry Chart'}
                </h3>
                <p className="text-xs text-lmu-muted mt-0.5">
                  {activeChartMetric === 'tireWear'
                    ? 'Individual 4-wheel tire degradation progression and tire wear percentage over stints'
                    : activeChartMetric === 'fuelEnergy'
                    ? 'Fuel tank level, per-lap fuel consumption, and Virtual Energy hybrid management (LMH/LMDh)'
                    : 'Session lap pace progression, sector splits (S1/S2/S3), and top speeds by lap'}
                </p>
              </div>

              {/* Metric Toggle */}
              <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold shrink-0">
                <button
                  onClick={() => setChartMetric('lapTime')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeChartMetric === 'lapTime'
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Lap Pace
                </button>
                <button
                  onClick={() => setChartMetric('sectors')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeChartMetric === 'sectors'
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Sectors (S1/S2/S3)
                </button>
                <button
                  onClick={() => setChartMetric('topSpeed')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeChartMetric === 'topSpeed'
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  Top Speed
                </button>
                <button
                  onClick={() => {
                    if (hasTireWearData) setChartMetric('tireWear');
                  }}
                  disabled={!hasTireWearData}
                  title={hasTireWearData ? 'View tire wear telemetry' : 'No tire wear data available in this session'}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    !hasTireWearData
                      ? 'opacity-40 cursor-not-allowed text-lmu-muted'
                      : activeChartMetric === 'tireWear'
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  <Disc className="w-3.5 h-3.5" />
                  Tire Wear
                </button>
                <button
                  onClick={() => {
                    if (hasFuelData) setChartMetric('fuelEnergy');
                  }}
                  disabled={!hasFuelData}
                  title={hasFuelData ? (hasVirtualEnergyData ? 'View fuel & virtual energy telemetry' : 'View fuel telemetry') : 'No fuel or energy data available in this session'}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    !hasFuelData
                      ? 'opacity-40 cursor-not-allowed text-lmu-muted'
                      : activeChartMetric === 'fuelEnergy'
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  <Fuel className="w-3.5 h-3.5" />
                  {hasVirtualEnergyData ? 'Fuel & Energy' : 'Fuel'}
                </button>
              </div>
            </div>

            {/* Fuel & VE Stint Strategy Estimates (Exclusively displayed when Fuel & Energy chart metric is selected) */}
            {activeChartMetric === 'fuelEnergy' && hasFuelData && (selectedDriver.avgFuelPerLap || selectedDriver.avgVePerLap) && (
              <div className="p-3.5 rounded-xl bg-lmu-bg/80 border border-lmu-border/70 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {selectedDriver.avgFuelPerLap !== null && selectedDriver.avgFuelPerLap !== undefined && (
                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40">
                      <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                        <Fuel className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-lmu-muted">Avg Fuel Usage</p>
                        <p className="text-xs font-mono font-bold text-white">
                          {selectedDriver.avgFuelPerLap}% <span className="text-[10px] font-normal text-lmu-muted">/ clean lap</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedDriver.estFuelStintLaps !== null && selectedDriver.estFuelStintLaps !== undefined && (
                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40">
                      <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-lmu-muted">Est. Fuel Stint</p>
                        <p className="text-xs font-mono font-bold text-amber-300">
                          ~{selectedDriver.estFuelStintLaps} <span className="text-[10px] font-normal text-lmu-muted">laps / tank</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedDriver.avgVePerLap !== null && selectedDriver.avgVePerLap !== undefined && (
                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40" title="Virtual Energy consumed per lap (WEC / LMU BoP energy allocation)">
                      <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-lmu-muted">Avg Virtual Energy</p>
                        <p className="text-xs font-mono font-bold text-white">
                          {selectedDriver.avgVePerLap}% <span className="text-[10px] font-normal text-lmu-muted">/ lap</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedDriver.estVeStintLaps !== null && selectedDriver.estVeStintLaps !== undefined && (
                    <div className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40" title="Estimated laps before 100% Virtual Energy allocation is depleted. In WEC, running out before pitting triggers a 100s stop-and-go penalty.">
                      <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-lmu-muted">Est. Energy Stint (VE)</p>
                        <p className="text-xs font-mono font-bold text-indigo-300">
                          ~{selectedDriver.estVeStintLaps} <span className="text-[10px] font-normal text-lmu-muted">laps / stint</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Optimal Setup Fuel Ratio & Stint Optimization Banner */}
                {fuelStrategy && fuelStrategy.optimalRatio !== null && (
                  <div className="pt-2.5 border-t border-lmu-border/50 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                        <Scale className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white uppercase tracking-wider text-[10px]">Recommended Setup Fuel Ratio:</span>
                          <span
                            className="px-2 py-0.5 rounded bg-purple-950/90 text-purple-300 border border-purple-500/50 font-mono font-bold text-[11px]"
                            title="Recommended Fuel-to-Energy ratio for LMU Setup (Electronics/Strategy menu). Sets how much physical fuel to carry per % Virtual Energy."
                          >
                            {fuelStrategy.optimalRatio}
                          </span>
                          {fuelStrategy.zeroWasteFuelPct !== null && (
                            <span className="text-lmu-muted text-[10px]">
                              (Zero-Waste Tank Fill: <strong className="text-amber-300 font-mono">~{fuelStrategy.zeroWasteFuelPct}%</strong> for full VE stint)
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-lmu-muted mt-0.5">
                          {fuelStrategy.limiter === 've' ? (
                            <span>
                              <strong className="text-indigo-300">⚡ Stint Limited by Virtual Energy:</strong> VE allocation runs out ~{fuelStrategy.lapDelta} laps before fuel tank (carrying ~{fuelStrategy.surplusFuelPct}% excess fuel). Set ratio to <strong className="text-white font-mono">{fuelStrategy.optimalRatio}</strong> or use lift-and-coast.
                            </span>
                          ) : fuelStrategy.limiter === 'fuel' ? (
                            <span>
                              <strong className="text-amber-300">⛽ Stint Limited by Fuel Tank:</strong> Physical fuel runs dry ~{fuelStrategy.lapDelta} laps before VE is exhausted. Increase fuel ratio or short-shift.
                            </span>
                          ) : (
                            <span className="text-emerald-300">
                              ✨ <strong>Perfect Stint Balance:</strong> Physical fuel tank and Virtual Energy allocation run out simultaneously with zero wasted weight.
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="h-72 min-h-[288px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                <LineChart
                  key={`session-chart-${activeChartMetric}-${sessionChartData.length}`}
                  data={sessionChartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.5} />
                  <XAxis dataKey="lapNum" stroke="#718096" tick={{ fill: '#A0AEC0', fontSize: 11 }} />
                  <YAxis
                    stroke="#718096"
                    tick={{ fill: '#A0AEC0', fontSize: 11 }}
                    domain={[yDomainMin, yDomainMax]}
                    tickFormatter={(val) => activeChartMetric === 'topSpeed' ? `${val} km/h` : (activeChartMetric === 'tireWear' || activeChartMetric === 'fuelEnergy') ? `${val}%` : formatTime(val)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />

                  {activeChartMetric === 'lapTime' && (
                    <Line
                      type="monotone"
                      dataKey="lapTime"
                      name="Lap Time"
                      stroke="#E53E3E"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#E53E3E', strokeWidth: 2, stroke: '#FFFFFF' }}
                      activeDot={{ r: 7 }}
                      connectNulls={true}
                    />
                  )}

                  {activeChartMetric === 'sectors' && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="s1"
                        name="Sector 1"
                        stroke="#ECC94B"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#ECC94B' }}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="s2"
                        name="Sector 2"
                        stroke="#3182CE"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#3182CE' }}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="s3"
                        name="Sector 3"
                        stroke="#38A169"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#38A169' }}
                        connectNulls={true}
                      />
                    </>
                  )}

                  {activeChartMetric === 'topSpeed' && (
                    <Line
                      type="monotone"
                      dataKey="topSpeed"
                      name="Top Speed (km/h)"
                      stroke="#00F2FE"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#00F2FE' }}
                      connectNulls={true}
                    />
                  )}

                  {activeChartMetric === 'tireWear' && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="twFL"
                        name="Front Left (FL)"
                        stroke="#38BDF8"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#38BDF8' }}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="twFR"
                        name="Front Right (FR)"
                        stroke="#60A5FA"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#60A5FA' }}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="twRL"
                        name="Rear Left (RL)"
                        stroke="#34D399"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#34D399' }}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="twRR"
                        name="Rear Right (RR)"
                        stroke="#FBBF24"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#FBBF24' }}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="twAvg"
                        name="4-Tire Avg"
                        stroke="#E2E8F0"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        connectNulls={true}
                      />
                    </>
                  )}

                  {activeChartMetric === 'fuelEnergy' && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="fuel"
                        name="Fuel Level (%)"
                        stroke="#F97316"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#F97316' }}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="virtualEnergy"
                        name="Virtual Energy (%)"
                        stroke="#818CF8"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#818CF8' }}
                        connectNulls={true}
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* Detailed Lap Table */}
      {/* Lap-by-Lap Timing & Telemetry Table */}
      <div className="glass-panel p-5 rounded-2xl relative space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-lmu-accent" />
              <span>Lap Timing & Telemetry ({selectedDriver?.laps?.length || 0} Laps)</span>
            </h3>
            <p className="text-xs text-lmu-muted mt-0.5">
              Complete sector timings, speed traps, delta analysis, and pace benchmarks.
            </p>
          </div>

          {/* Open Full Comparison Studio */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
                const carClass = selectedDriver?.carClass || 'LMGT3';
                window.location.hash = `compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(carClass)}&sessionId=${encodeURIComponent(session.id)}`;
              }}
              className="px-3.5 py-1.5 rounded-xl bg-lmu-accent/20 hover:bg-lmu-accent/30 border border-lmu-accent/40 text-lmu-accent text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              title="Open full telemetry comparator studio for this session"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Open in Comparison Studio</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-lmu-muted">
            <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
              <tr>
                <th className="px-3 py-3">Lap</th>
                <th className="px-3 py-3">Pos</th>
                <th className="px-3 py-3 text-right">Lap Time</th>
                <th className="px-3 py-3 text-center">Pace Category</th>
                <th className="px-3 py-3 text-right">Delta</th>
                <th className="px-3 py-3 text-right">Sector 1</th>
                <th className="px-3 py-3 text-right">Sector 2</th>
                <th className="px-3 py-3 text-right">Sector 3</th>
                <th className="px-3 py-3 text-right">Top Speed</th>
                <th className="px-3 py-3 text-center">Tire Compound</th>
                {hasTireWearData && <th className="px-3 py-3 text-center">Tire Wear</th>}
                {hasFuelData && <th className="px-3 py-3 text-center">{hasVirtualEnergyData ? 'Fuel & VE' : 'Fuel'}</th>}
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lmu-border/50 font-mono">
              {(selectedDriver?.laps || []).map(l => {
                const isSessionBest = l.lapTime !== null && selectedDriver.bestLapTime !== null &&
                  Math.abs(l.lapTime - selectedDriver.bestLapTime) < 0.0005;
                const isLapAllTimePB = isSessionBest && isCurrentSessionAllTimePB;
                
                let deltaStr = '--';
                if (l.lapTime && selectedDriver.bestLapTime) {
                  const delta = l.lapTime - selectedDriver.bestLapTime;
                  if (Math.abs(delta) < 0.0005) {
                    deltaStr = isLapAllTimePB ? '⭐ PERSONAL BEST' : 'SESSION BEST';
                  } else {
                    deltaStr = `+${delta.toFixed(3)}s`;
                  }
                }

                const isS1Best = l.s1 !== null && selectedDriver.bestS1 !== null && Math.abs(l.s1 - selectedDriver.bestS1) < 0.0005;
                const isS2Best = l.s2 !== null && selectedDriver.bestS2 !== null && Math.abs(l.s2 - selectedDriver.bestS2) < 0.0005;
                const isS3Best = l.s3 !== null && selectedDriver.bestS3 !== null && Math.abs(l.s3 - selectedDriver.bestS3) < 0.0005;

                return (
                  <tr
                    key={l.lapNum}
                    className={`hover:bg-lmu-card/50 transition-colors ${
                      isLapAllTimePB ? 'bg-lmu-gold/15' : isSessionBest ? 'bg-lmu-blue/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-bold text-white" title={l.elapsedTimeString ? `Session Time: ${l.elapsedTimeString}` : undefined}>
                      {l.lapNum}
                    </td>
                    <td className="px-3 py-2.5 text-lmu-muted">{l.position || '-'}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${
                      isLapAllTimePB ? 'text-lmu-gold font-extrabold' : isSessionBest ? 'text-lmu-blue' : 'text-white'
                    }`}>
                      {l.lapTimeString}
                    </td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      {l.isValid && l.paceCategory ? (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold border shadow-sm ${getPaceCategoryStyle(l.paceCategory).badgeClass}`}>
                          <span>{getPaceCategoryStyle(l.paceCategory).emoji}</span>
                          <span>{l.paceCategory}</span>
                          <span className="opacity-80 text-[10px]">({formatPacePercentage(l.pacePercentage)})</span>
                        </span>
                      ) : (
                        <span className="text-lmu-muted text-xs">-</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold text-xs ${
                      isLapAllTimePB ? 'text-lmu-gold font-bold' : isSessionBest ? 'text-lmu-blue font-bold' : 'text-lmu-muted'
                    }`}>
                      {deltaStr}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${isS1Best ? 'text-lmu-gold font-bold' : ''
                      }`}>
                      {formatTime(l.s1)}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${isS2Best ? 'text-lmu-blue font-bold' : ''
                      }`}>
                      {formatTime(l.s2)}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${isS3Best ? 'text-lmu-green font-bold' : ''
                      }`}>
                      {formatTime(l.s3)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-white">
                      {l.topSpeed ? `${l.topSpeed.toFixed(1)} km/h` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-sans text-xs">
                      {l.fCompound || l.rCompound ? (
                        <span className="px-2 py-0.5 rounded bg-lmu-border text-white">
                          {l.fCompound || l.rCompound}
                        </span>
                      ) : '-'}
                    </td>
                    {hasTireWearData && (
                      <td className="px-3 py-2.5 text-center font-sans text-xs whitespace-nowrap">
                        {l.tireWear ? (
                          <span
                            className="px-2 py-0.5 rounded bg-lmu-bg border border-lmu-border/60 text-[11px] font-mono text-lmu-gold font-bold cursor-help inline-block"
                            title={`4-Tire Average: ${l.tireWear.avg}%\nFL: ${l.tireWear.fl}% | FR: ${l.tireWear.fr}%\nRL: ${l.tireWear.rl}% | RR: ${l.tireWear.rr}%`}
                          >
                            {l.tireWear.avg}%
                          </span>
                        ) : (
                          <span className="text-lmu-muted text-xs">-</span>
                        )}
                      </td>
                    )}
                    {hasFuelData && (
                      <td className="px-3 py-2.5 text-center font-sans text-xs whitespace-nowrap">
                        {l.fuel !== null && l.fuel !== undefined || l.virtualEnergy !== null && l.virtualEnergy !== undefined ? (
                          <div
                            className="inline-flex items-center gap-2 font-mono text-[11px] cursor-help"
                            title={`Remaining Fuel: ${l.fuel ?? 'N/A'}% ${l.fuelUsed ? `(Consumed: ${l.fuelUsed}%)` : ''}${l.virtualEnergy !== null && l.virtualEnergy !== undefined ? `\nRemaining Virtual Energy: ${l.virtualEnergy}% ${l.virtualEnergyUsed ? `(Consumed: ${l.virtualEnergyUsed}%)` : ''}` : ''}`}
                          >
                            {l.fuel !== null && l.fuel !== undefined && (
                              <span className="text-amber-300 font-bold">
                                ⛽ {l.fuel}%
                              </span>
                            )}
                            {l.virtualEnergy !== null && l.virtualEnergy !== undefined && (
                              <span className="text-indigo-300 font-bold">
                                ⚡ {l.virtualEnergy}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-lmu-muted text-xs">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center font-sans">
                      {l.isPitStop ? (
                        <span
                          className="px-2 py-0.5 rounded bg-lmu-accent/20 text-lmu-accent text-xs font-semibold"
                          title={l.pitStopDurationString ? `Estimated pit loss: ${l.pitStopDurationString}` : undefined}
                        >
                          PIT STOP
                        </span>
                      ) : l.isValid ? (
                        <span className="inline-flex items-center gap-1 text-lmu-green text-xs font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-lmu-gold text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Incomplete
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center font-sans">
                      <button
                        onClick={() => {
                          const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
                          const carClass = selectedDriver?.carClass || 'LMGT3';
                          window.location.hash = `compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(carClass)}&sessionId=${encodeURIComponent(session.id)}&lapNum=${l.lapNum}`;
                        }}
                        className="px-2.5 py-1 rounded-lg bg-lmu-bg hover:bg-lmu-accent hover:text-white text-lmu-muted border border-lmu-border text-[11px] font-semibold transition-all flex items-center gap-1 mx-auto"
                        title={`Open Lap ${l.lapNum} in Telemetry Studio`}
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>Compare</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

