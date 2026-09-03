import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Video,
  Download,
  Zap,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Gauge,
  Disc,
  Sliders,
  Fuel,
  ChevronRight,
  ArrowLeftRight,
  Scale,
  Trophy,
  ArrowUpDown,
  Timer,
  Flag,
} from 'lucide-react';
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
import { formatTime, getDisplayTrackName, parseDateStringToTimestamp } from '../utils/formatters.js';
import { getPaceCategoryStyle, formatPacePercentage, matchesCarClass, findReferenceEntry, matchesTrack } from '../utils/paceCategory.js';
import { computeLapToLapDelta } from '../utils/lapComparison.js';

const OPPONENT_COLORS = [
  '#38BDF8', // sky
  '#34D399', // emerald
  '#A78BFA', // purple
  '#F472B6', // pink
  '#FB923C', // orange
  '#E2E8F0', // slate
  '#4ADE80', // green
  '#2DD4BF', // teal
  '#818CF8', // indigo
  '#C084FC', // fuchsia
  '#F87171', // red
  '#94A3B8', // cool gray
];

const PLAYER_HIGHLIGHT_COLOR = '#FBBF24'; // Vibrant Gold Accent

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
  onSelectSession?: (sessionId: string) => void;
}

function findClosestSession(current: DetailedSession, candidates: any[]): any {
  if (candidates.length <= 1) return candidates[0] || null;

  const currentTime = current.timestamp || parseDateStringToTimestamp(current.timeString);
  let best = candidates[0];
  let minDiff = Infinity;

  for (const cand of candidates) {
    const candTime = cand.timestamp || parseDateStringToTimestamp(cand.timeString || cand.dateString);
    const diff = Math.abs(currentTime - candTime);
    if (diff < minDiff) {
      minDiff = diff;
      best = cand;
    }
  }

  return best;
}

function findRelatedSession(
  current: DetailedSession | null,
  sessions: any[]
): { type: 'qualifying' | 'race'; target: any } | null {
  if (!current || !sessions || sessions.length === 0) return null;

  const currentType = (current.sessionType || '').toLowerCase();
  const currentName = (current.sessionName || '').toLowerCase();
  const isRace = currentType === 'race' || currentName.startsWith('r');
  const isQuali = currentType.includes('qual') || currentName.startsWith('q');
  const isPractice = currentType.includes('practice') || currentName.startsWith('p');

  // Race -> Quali; Quali -> Race; Practice -> Race or Quali
  const targetType: 'qualifying' | 'race' | null = isRace ? 'qualifying' : (isQuali || isPractice) ? 'race' : null;
  if (!targetType) return null;

  const targetSessions = sessions.filter(s => {
    const sId = s.id || s.sessionId;
    if (sId === current.id) return false;
    const t = (s.sessionType || '').toLowerCase();
    const n = (s.sessionName || '').toLowerCase();
    if (targetType === 'qualifying') {
      return t.includes('qual') || n.startsWith('q');
    }
    if (targetType === 'race') {
      return t === 'race' || n.startsWith('r');
    }
    return false;
  });

  if (targetSessions.length === 0) {
    if (isPractice) {
      const qualiSessions = sessions.filter(s => {
        const sId = s.id || s.sessionId;
        if (sId === current.id) return false;
        const t = (s.sessionType || '').toLowerCase();
        const n = (s.sessionName || '').toLowerCase();
        return t.includes('qual') || n.startsWith('q');
      });
      if (qualiSessions.length > 0) {
        return { type: 'qualifying', target: findClosestSession(current, qualiSessions) };
      }
    }
    return null;
  }

  // 1. Direct filename/ID pattern match: e.g. 2026_05_28_R1 <-> 2026_05_28_Q1
  const currentId = current.id;
  const directIdPattern = isRace
    ? currentId.replace(/([_.-])R(\d*)$/i, '$1Q$2')
    : currentId.replace(/([_.-])Q(\d*)$/i, '$1R$2');

  if (directIdPattern !== currentId) {
    const directMatch = targetSessions.find(s => {
      const sId = s.id || s.sessionId;
      return sId === directIdPattern || s.filename === `${directIdPattern}.xml`;
    });
    if (directMatch) {
      return { type: targetType, target: directMatch };
    }
  }

  // 2. Same track match, closest in time
  const sameTrackSessions = targetSessions.filter(s =>
    matchesTrack(current.trackVenue, s.trackVenue, s.trackCourse) ||
    s.trackVenue?.toLowerCase() === current.trackVenue?.toLowerCase()
  );

  const candidatePool = sameTrackSessions.length > 0 ? sameTrackSessions : targetSessions;
  const bestMatch = findClosestSession(current, candidatePool);

  return bestMatch ? { type: targetType, target: bestMatch } : null;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({ sessionId, onBack, onSelectSession }) => {
  const [session, setSession] = useState<DetailedSession | null>(null);
  const [refCache, setRefCache] = useState<any>(null);
  const [progression, setProgression] = useState<SessionProgressionPoint[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [copiedReplay, setCopiedReplay] = useState<boolean>(false);
  const [chartMetric, setChartMetric] = useState<'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions'>('lapTime');
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const handleLegendClick = (e: any) => {
    if (!e || !e.dataKey) return;
    const key = String(e.dataKey);
    setHiddenSeries(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/session/${sessionId}`).then(res => res.json()),
      fetch('/api/reference-laptimes').then(res => res.json()).catch(() => null),
      fetch('/api/progression').then(res => res.json()).catch(() => []),
      fetch('/api/sessions').then(res => res.json()).catch(() => []),
    ])
      .then(([sessionData, refData, progData, allSessionsData]) => {
        setSession(sessionData);
        setRefCache(refData);
        if (Array.isArray(progData)) {
          setProgression(progData);
        }
        if (Array.isArray(allSessionsData)) {
          setAllSessions(allSessionsData);
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

  const uniqueClasses = new Set(
    (session.drivers || [])
      .map(d => (d.carClass || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const isMultiClass = uniqueClasses.size > 1;

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
    const headers = [
      'Lap',
      'LapTime_Seconds',
      'LapTime_Formatted',
      'DeltaPrevLap_Seconds',
      'DeltaOptimal_Seconds',
      'PaceCategory',
      'PacePercentage',
      'S1',
      'S2',
      'S3',
      'TopSpeed_kmh',
      'FrontTire',
      'RearTire',
      'PitStop',
      'Valid',
    ];
    const theo = selectedDriver.theoreticalBest;
    const rows = selectedDriver.laps.map((l, idx, allLaps) => {
      const prevLap = idx > 0 ? allLaps[idx - 1] : null;
      const prevDelta = l.lapTime && prevLap && prevLap.lapTime ? (l.lapTime - prevLap.lapTime).toFixed(3) : '';
      const optDelta = l.lapTime && theo ? (l.lapTime - theo).toFixed(3) : '';

      return [
        l.lapNum,
        l.lapTime || '',
        l.lapTimeString,
        prevDelta,
        optDelta,
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
      ];
    });

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

  const candidatePool = allSessions.length > 0 ? allSessions : progression;
  const relatedSession = findRelatedSession(session, candidatePool);

  const handleNavigateToSession = (targetId: string) => {
    if (onSelectSession) {
      onSelectSession(targetId);
    } else {
      window.location.hash = `session/${encodeURIComponent(targetId)}`;
    }
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

          {relatedSession && (
            <button
              onClick={() => handleNavigateToSession(relatedSession.target.id || relatedSession.target.sessionId)}
              title={
                relatedSession.type === 'qualifying'
                  ? `View Qualifying session: ${relatedSession.target.sessionName || 'Q1'} (${relatedSession.target.trackVenue})`
                  : `View Race session: ${relatedSession.target.sessionName || 'R1'} (${relatedSession.target.trackVenue})`
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer ${
                relatedSession.type === 'qualifying'
                  ? 'bg-lmu-gold/10 text-lmu-gold border-lmu-gold/30 hover:bg-lmu-gold/20 hover:border-lmu-gold'
                  : 'bg-lmu-accent/10 text-lmu-accent border-lmu-accent/30 hover:bg-lmu-accent/20 hover:border-lmu-accent'
              }`}
            >
              {relatedSession.type === 'qualifying' ? (
                <>
                  <Timer className="w-4 h-4 text-lmu-gold" />
                  <span>Go to Quali ({relatedSession.target.sessionName || 'Q1'})</span>
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4 text-lmu-accent" />
                  <span>Go to Race ({relatedSession.target.sessionName || 'R1'})</span>
                </>
              )}
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
          Boolean(session.settings.modeSetting) ||
          Boolean(session.settings.serverName) ||
          session.settings.damageMultiplier !== undefined ||
          session.settings.fuelMultiplier !== undefined ||
          session.settings.tireMultiplier !== undefined ||
          session.settings.tireWarmers !== undefined ||
          session.settings.fixedSetups !== undefined ||
          (session.settings.durationMinutes !== undefined && session.settings.durationMinutes > 0) ||
          (session.settings.raceLaps !== undefined && session.settings.raceLaps > 0 && session.settings.raceLaps < 2147483640)
        ) && (
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

      {/* Unified Driver Performance & Race Standings Overview Panel */}
      {selectedDriver && (() => {
        const isRaceSession = session.sessionType === 'Race' || selectedDriver.gridPosition !== null || selectedDriver.positionGain !== null;

        const completedLaps = (selectedDriver?.laps || []).filter(
          l => l.lapTime !== null && l.lapTime > 0
        );
        const hasMultipleLaps = completedLaps.length > 1;

        const validFlyingLaps = completedLaps.filter(
          l => l.isValid && (!hasMultipleLaps || l.lapNum > 1)
        );
        const cleanLapsForAvg = validFlyingLaps.length > 0
          ? validFlyingLaps
          : completedLaps.filter(l => !hasMultipleLaps || l.lapNum > 1).length > 0
          ? completedLaps.filter(l => !hasMultipleLaps || l.lapNum > 1)
          : completedLaps;

        const avgLapTime = cleanLapsForAvg.length > 0
          ? cleanLapsForAvg.reduce((sum, l) => sum + (l.lapTime || 0), 0) / cleanLapsForAvg.length
          : null;

        const deltaToBest = (avgLapTime !== null && selectedDriver.bestLapTime)
          ? avgLapTime - selectedDriver.bestLapTime
          : null;

        const lapStdDev = (avgLapTime !== null && cleanLapsForAvg.length > 1)
          ? Math.sqrt(
              cleanLapsForAvg.reduce((sum, l) => sum + Math.pow((l.lapTime || 0) - avgLapTime, 2), 0) /
                cleanLapsForAvg.length
            )
          : null;

        const consistencyScore = (avgLapTime !== null && lapStdDev !== null && avgLapTime > 0)
          ? Math.max(0, Math.min(100, (1 - (lapStdDev / avgLapTime)) * 100))
          : null;

        const sortedCleanLaps = [...cleanLapsForAvg]
          .filter(l => l.lapTime !== null && l.lapTime > 0)
          .sort((a, b) => (a.lapTime || 0) - (b.lapTime || 0));
        const top3Slice = sortedCleanLaps.slice(0, 3);
        const top3Avg = top3Slice.length > 0
          ? parseFloat((top3Slice.reduce((sum, l) => sum + (l.lapTime || 0), 0) / top3Slice.length).toFixed(3))
          : null;
        const top3DeltaToBest = (top3Avg !== null && selectedDriver.bestLapTime)
          ? parseFloat((top3Avg - selectedDriver.bestLapTime).toFixed(3))
          : null;

        const theoGap = (selectedDriver.bestLapTime && selectedDriver.theoreticalBest)
          ? parseFloat((selectedDriver.bestLapTime - selectedDriver.theoreticalBest).toFixed(3))
          : null;

        const s1Laps = (selectedDriver?.laps || []).filter(
          l => l.s1 !== null && l.s1 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
        );
        const avgS1 = s1Laps.length > 0
          ? s1Laps.reduce((sum, l) => sum + (l.s1 || 0), 0) / s1Laps.length
          : null;

        const s2Laps = (selectedDriver?.laps || []).filter(
          l => l.s2 !== null && l.s2 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
        );
        const avgS2 = s2Laps.length > 0
          ? s2Laps.reduce((sum, l) => sum + (l.s2 || 0), 0) / s2Laps.length
          : null;

        const s3Laps = (selectedDriver?.laps || []).filter(
          l => l.s3 !== null && l.s3 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
        );
        const avgS3 = s3Laps.length > 0
          ? s3Laps.reduce((sum, l) => sum + (l.s3 || 0), 0) / s3Laps.length
          : null;

        return (
          <div className="glass-panel p-4 rounded-xl border border-lmu-border/70 space-y-3">
            {/* Header: Title / Car Info / Finish Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-lmu-border/50 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {isRaceSession ? (
                    <Trophy className="w-4 h-4 text-lmu-gold" />
                  ) : (
                    <Gauge className="w-4 h-4 text-lmu-cyan" />
                  )}
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    {isRaceSession ? 'Race Standings & Position Deltas' : 'Driver Performance & Session Overview'}
                  </h3>
                </div>
                <span className="text-xs text-lmu-muted hidden sm:inline">•</span>
                <span className="text-xs text-slate-200 font-semibold truncate max-w-xs" title={selectedDriver.carType}>
                  {selectedDriver.carType} <span className="text-lmu-muted font-normal">({selectedDriver.carClass || 'Class'} • #{selectedDriver.carNumber})</span>
                </span>
              </div>

              {isRaceSession && selectedDriver.finishStatus && (
                <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                  selectedDriver.finishStatus.toLowerCase().includes('dnf')
                    ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                    : selectedDriver.classPosition === 1 || selectedDriver.position === 1
                    ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                    : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                }`}>
                  🏁 {selectedDriver.finishStatus}
                </span>
              )}
            </div>

            {/* Race Standings Sub-Grid (when Race session) */}
            {isRaceSession && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
                  <p className="text-[10px] uppercase font-semibold text-lmu-muted">Starting Grid</p>
                  <p className="text-base font-mono font-extrabold text-white mt-0.5">
                    {selectedDriver.gridPosition ? `P${selectedDriver.gridPosition}` : '-'}
                    {isMultiClass && selectedDriver.classGridPosition ? (
                      <span className="text-[11px] font-normal text-lmu-cyan ml-1">
                        (Class P{selectedDriver.classGridPosition})
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
                  <p className="text-[10px] uppercase font-semibold text-lmu-muted">Finish Position</p>
                  <p className={`text-base font-mono font-extrabold mt-0.5 ${
                    selectedDriver.classPosition === 1 || selectedDriver.position === 1 ? 'text-lmu-gold' : 'text-white'
                  }`}>
                    {selectedDriver.position ? `P${selectedDriver.position}` : '-'}
                    {isMultiClass && selectedDriver.classPosition > 0 && (
                      <span className="text-[11px] font-normal text-lmu-cyan ml-1">
                        (Class P{selectedDriver.classPosition})
                      </span>
                    )}
                  </p>
                </div>

                <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
                  <p className="text-[10px] uppercase font-semibold text-lmu-muted">Position Delta</p>
                  <p className={`text-base font-mono font-extrabold mt-0.5 flex items-center justify-center gap-1 ${
                    (selectedDriver.positionGain ?? 0) > 0
                      ? 'text-lmu-green'
                      : (selectedDriver.positionGain ?? 0) < 0
                      ? 'text-rose-400'
                      : 'text-white'
                  }`}>
                    {(selectedDriver.positionGain ?? 0) > 0 && <TrendingUp className="w-3.5 h-3.5" />}
                    {(selectedDriver.positionGain ?? 0) < 0 && <TrendingDown className="w-3.5 h-3.5" />}
                    <span>
                      {selectedDriver.positionGain !== null && selectedDriver.positionGain !== undefined
                        ? `${selectedDriver.positionGain > 0 ? '+' : ''}${selectedDriver.positionGain}`
                        : '-'}
                    </span>
                    <span className="text-[10px] font-normal text-lmu-muted">
                      {(selectedDriver.positionGain ?? 0) > 0 ? 'Gained' : (selectedDriver.positionGain ?? 0) < 0 ? 'Lost' : 'Net'}
                    </span>
                  </p>
                </div>

                <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
                  <p className="text-[10px] uppercase font-semibold text-lmu-muted">Laps Led (P1)</p>
                  <p className="text-base font-mono font-extrabold text-lmu-gold mt-0.5">
                    {selectedDriver.lapsLedCount ?? 0}
                    <span className="text-[10px] font-normal text-lmu-muted ml-1">laps</span>
                  </p>
                </div>

                <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
                  <p className="text-[10px] uppercase font-semibold text-lmu-muted">Peak Position</p>
                  <p className="text-base font-mono font-extrabold text-lmu-cyan mt-0.5">
                    {selectedDriver.highestPosition ? `P${selectedDriver.highestPosition}` : '-'}
                  </p>
                </div>

                <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
                  <p className="text-[10px] uppercase font-semibold text-lmu-muted">Pit Stops</p>
                  <p className="text-base font-mono font-extrabold text-amber-300 mt-0.5">
                    {selectedDriver.pitStopsCount ?? 0}
                    <span className="text-[10px] font-normal text-lmu-muted ml-1">stops</span>
                  </p>
                </div>
              </div>
            )}

            {/* Timing & Performance Metrics Row */}
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 ${isRaceSession ? 'border-t border-lmu-border/40 pt-2.5' : ''}`}>
              {/* 1. Best Lap */}
              <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
                <div>
                  <p className={`text-[10px] uppercase font-semibold ${isCurrentSessionAllTimePB ? 'text-lmu-gold font-bold flex items-center gap-1' : 'text-lmu-muted'}`}>
                    {isCurrentSessionAllTimePB ? `⭐ Personal Best` : 'Session Best Lap'}
                  </p>
                  <h4 className={`text-xl font-extrabold font-mono mt-0.5 ${isCurrentSessionAllTimePB ? 'text-lmu-gold' : 'text-white'}`}>
                    {selectedDriver.bestLapTimeString}
                  </h4>
                </div>
                {selectedDriver.bestLapPaceCategory && (
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold border ${getPaceCategoryStyle(selectedDriver.bestLapPaceCategory).badgeClass}`}>
                      <span>{getPaceCategoryStyle(selectedDriver.bestLapPaceCategory).emoji}</span>
                      <span>{selectedDriver.bestLapPaceCategory}</span>
                      <span className="opacity-80 text-[9px]">({formatPacePercentage(selectedDriver.bestLapPacePercentage)})</span>
                    </span>
                    {!isCurrentSessionAllTimePB && allTimeCategoryTrackPB && (
                      <span className="text-[10px] text-lmu-muted" title="Track PB">
                        PB: <strong className="text-lmu-gold font-mono">{formatTime(allTimeCategoryTrackPB)}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Top 3 Clean Lap Avg (True Pace) */}
              <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-lmu-muted uppercase font-semibold">Top 3 Lap Avg</p>
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/40">
                      True Pace
                    </span>
                  </div>
                  <h4 className="text-xl font-extrabold text-cyan-300 font-mono mt-0.5">
                    {top3Avg ? formatTime(top3Avg) : '--:--.---'}
                  </h4>
                </div>
                <div className="mt-1 space-y-0.5 text-[10px] text-lmu-muted">
                  <div className="flex items-center justify-between">
                    <span>
                      Gap to PB: <strong className="text-cyan-200 font-mono">{top3DeltaToBest !== null ? `+${top3DeltaToBest.toFixed(3)}s` : '--'}</strong>
                    </span>
                  </div>
                  <p className="text-[9px] text-lmu-muted truncate" title="Average of 3 fastest valid flying laps">
                    Repeatable Pace Trend
                  </p>
                </div>
              </div>

              {/* 3. Session Lap Average */}
              <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-lmu-muted uppercase font-semibold">Session Lap Average</p>
                    {consistencyScore !== null && (
                      <span
                        className={`text-[9px] font-bold font-mono px-1.5 py-0.2 rounded border ${
                          consistencyScore >= 99
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : consistencyScore >= 97
                            ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                            : consistencyScore >= 94
                            ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                        title="Pace consistency rating based on clean lap standard deviation"
                      >
                        {consistencyScore.toFixed(1)}% Consist
                      </span>
                    )}
                  </div>
                  <h4 className="text-xl font-extrabold text-indigo-300 font-mono mt-0.5">
                    {avgLapTime ? formatTime(avgLapTime) : '--:--.---'}
                  </h4>
                </div>
                <div className="mt-1 space-y-0.5 text-[10px] text-lmu-muted">
                  <div className="flex items-center justify-between">
                    <span>
                      Gap: <strong className="text-indigo-200 font-mono">{deltaToBest !== null ? `+${deltaToBest.toFixed(3)}s` : '--'}</strong>
                    </span>
                    {lapStdDev !== null && (
                      <span title="Standard deviation of clean flying lap times">
                        Std: <strong className="text-white font-mono">±{lapStdDev.toFixed(3)}s</strong>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-lmu-muted">
                    <span>Clean Laps: <strong className="text-white font-mono">{cleanLapsForAvg.length}</strong> / {selectedDriver.laps?.length || 0}</span>
                    {hasMultipleLaps && (
                      <span className="text-[8px] uppercase tracking-wider text-amber-400/80 font-semibold" title="Lap 1 (Start/Out-lap) is excluded from flying averages">
                        Excl. L1
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Theoretical Best */}
              <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] text-lmu-muted uppercase font-semibold">Theoretical Best</p>
                  <h4 className="text-xl font-extrabold text-lmu-green font-mono mt-0.5">
                    {selectedDriver.theoreticalBestString}
                  </h4>
                </div>
                <p className="text-[10px] text-lmu-muted mt-1">
                  Potential: <strong className="text-emerald-400 font-mono">{theoGap !== null && theoGap > 0 ? `-${theoGap.toFixed(3)}s` : '0.000s'}</strong>
                </p>
              </div>

              {/* 5. Best Sectors (S1 / S2 / S3) & Averages */}
              <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
                <p className="text-[10px] text-lmu-muted uppercase font-semibold">Sectors (Best / Avg)</p>
                <div className="mt-1 space-y-0.5 text-xs font-mono">
                  <div className="grid grid-cols-[20px_auto_1fr] items-center gap-2">
                    <span className="text-lmu-muted text-[10px] font-semibold">S1:</span>
                    <strong className="text-lmu-gold font-bold">{formatTime(selectedDriver.bestS1)}</strong>
                    <span className="text-lmu-muted text-[11px] text-right">({formatTime(avgS1)})</span>
                  </div>
                  <div className="grid grid-cols-[20px_auto_1fr] items-center gap-2">
                    <span className="text-lmu-muted text-[10px] font-semibold">S2:</span>
                    <strong className="text-lmu-blue font-bold">{formatTime(selectedDriver.bestS2)}</strong>
                    <span className="text-lmu-muted text-[11px] text-right">({formatTime(avgS2)})</span>
                  </div>
                  <div className="grid grid-cols-[20px_auto_1fr] items-center gap-2">
                    <span className="text-lmu-muted text-[10px] font-semibold">S3:</span>
                    <strong className="text-lmu-green font-bold">{formatTime(selectedDriver.bestS3)}</strong>
                    <span className="text-lmu-muted text-[11px] text-right">({formatTime(avgS3)})</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Session Lap Telemetry, Sector & Multi-Driver Position Progression Chart */}
      {selectedDriver && selectedDriver.laps && selectedDriver.laps.length > 0 && (() => {
        // Multi-class driver filtering: only show drivers belonging to the same car class
        const classDrivers = (session.drivers || []).filter(d =>
          matchesCarClass(d.carClass || '', d.carType || '', selectedDriver.carClass || selectedDriver.carType || '')
        );
        const driversToPlot = classDrivers.length > 0 ? classDrivers : (session.drivers || []);
        const maxClassLaps = Math.max(...driversToPlot.map(d => (d.laps ? d.laps.length : 0)), 1);
        const maxPosInClass = Math.max(
          ...driversToPlot.flatMap(d => (d.laps || []).map(l => l.position)).filter(p => p > 0),
          driversToPlot.length,
          1
        );

        // Calculate clean/valid flying lap average and sector averages for selected driver (ignoring Lap 1 when > 1 lap)
        const completedLaps = selectedDriver.laps.filter(
          l => l.lapTime !== null && l.lapTime > 0
        );
        const hasMultipleLaps = completedLaps.length > 1;

        const validFlyingLaps = completedLaps.filter(
          l => l.isValid && (!hasMultipleLaps || l.lapNum > 1)
        );
        const cleanLapsForAvg = validFlyingLaps.length > 0
          ? validFlyingLaps
          : completedLaps.filter(l => !hasMultipleLaps || l.lapNum > 1).length > 0
          ? completedLaps.filter(l => !hasMultipleLaps || l.lapNum > 1)
          : completedLaps;

        const avgLapTime = cleanLapsForAvg.length > 0
          ? cleanLapsForAvg.reduce((sum, l) => sum + (l.lapTime || 0), 0) / cleanLapsForAvg.length
          : null;

        const s1Laps = selectedDriver.laps.filter(
          l => l.s1 !== null && l.s1 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
        );
        const avgS1 = s1Laps.length > 0
          ? s1Laps.reduce((sum, l) => sum + (l.s1 || 0), 0) / s1Laps.length
          : null;

        const s2Laps = selectedDriver.laps.filter(
          l => l.s2 !== null && l.s2 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
        );
        const avgS2 = s2Laps.length > 0
          ? s2Laps.reduce((sum, l) => sum + (l.s2 || 0), 0) / s2Laps.length
          : null;

        const s3Laps = selectedDriver.laps.filter(
          l => l.s3 !== null && l.s3 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
        );
        const avgS3 = s3Laps.length > 0
          ? s3Laps.reduce((sum, l) => sum + (l.s3 || 0), 0) / s3Laps.length
          : null;

        // Position Chart Data (Multi-driver lap positions)
        const positionChartData = Array.from({ length: maxClassLaps }, (_, i) => {
          const lapNum = i + 1;
          const point: any = {
            lapNum: `Lap ${lapNum}`,
            lapNumber: lapNum,
          };
          driversToPlot.forEach(d => {
            const lap = d.laps?.find(l => l.lapNum === lapNum);
            if (lap && lap.position > 0) {
              point[d.name] = lap.position;
              point[`${d.name}_isPit`] = lap.isPitStop;
              point[`${d.name}_lapTime`] = lap.lapTimeString;
              point[`${d.name}_isPlayer`] = d.isPlayer;
            }
          });
          return point;
        });

        // Single Driver Telemetry Chart Data
        const sessionChartData = selectedDriver.laps.map(l => ({
          lapNum: `Lap ${l.lapNum}`,
          lapNumber: l.lapNum,
          lapTime: l.lapTime && l.isValid ? l.lapTime : null,
          lapTimeString: l.lapTimeString,
          avgLapTime: avgLapTime,
          avgLapTimeString: formatTime(avgLapTime),
          s1: l.s1 && l.isValid ? l.s1 : null,
          s2: l.s2 && l.isValid ? l.s2 : null,
          s3: l.s3 && l.isValid ? l.s3 : null,
          avgS1: avgS1,
          avgS2: avgS2,
          avgS3: avgS3,
          s1String: formatTime(l.s1),
          s2String: formatTime(l.s2),
          s3String: formatTime(l.s3),
          avgS1String: formatTime(avgS1),
          avgS2String: formatTime(avgS2),
          avgS3String: formatTime(avgS3),
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

          if (activeChartMetric === 'positions') {
            const sortedDrivers = driversToPlot
              .map(d => {
                const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
                return {
                  name: d.name,
                  pos: data[d.name] as number | undefined,
                  isPlayer,
                  isPit: data[`${d.name}_isPit`],
                  lapTime: data[`${d.name}_lapTime`],
                };
              })
              .filter(d => d.pos !== undefined && d.pos > 0)
              .sort((a, b) => (a.pos || 999) - (b.pos || 999));

            return (
              <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-2 font-mono min-w-[240px]">
                <div className="font-bold text-white flex items-center justify-between border-b border-lmu-border/60 pb-1 font-sans">
                  <span>{data.lapNum}</span>
                  <span className="text-[10px] text-lmu-muted uppercase font-semibold">
                    {selectedDriver.carClass || 'Class'} Standings
                  </span>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-0.5">
                  {sortedDrivers.map((d) => (
                    <div
                      key={d.name}
                      className={`flex items-center justify-between gap-3 p-1 rounded transition-colors ${
                        d.isPlayer ? 'bg-lmu-gold/20 text-lmu-gold font-bold border border-lmu-gold/40' : 'text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`font-mono text-xs font-extrabold shrink-0 ${d.isPlayer ? 'text-lmu-gold' : 'text-slate-300'}`}>
                          P{d.pos}
                        </span>
                        <span className="truncate max-w-[130px]" title={d.name}>
                          {d.name} {d.isPlayer ? '(You)' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                        {d.isPit && <span className="px-1 py-0.2 rounded bg-amber-500/30 text-amber-300 text-[9px] font-bold">PIT</span>}
                        <span className="text-lmu-muted font-mono">{d.lapTime || '--:--.---'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 font-mono">
              <div className="font-bold text-white flex items-center justify-between gap-3 border-b border-lmu-border/60 pb-1 mb-1 font-sans">
                <span>{data.lapNum}</span>
                {data.isPitStop && <span className="text-[10px] text-amber-400">🛑 Pit Stop</span>}
                {!data.isValid && <span className="text-[10px] text-rose-400">⚠️ Invalid</span>}
              </div>

              {activeChartMetric === 'lapTime' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-lmu-muted">Lap Pace:</span>
                    <span className="font-bold text-lmu-gold">{data.lapTimeString}</span>
                  </div>
                  {data.avgLapTimeString && (
                    <div className="flex items-center justify-between gap-4 border-t border-lmu-border/50 pt-1 text-[11px]">
                      <span className="text-purple-300">Session Avg:</span>
                      <span className="font-bold text-indigo-200">{data.avgLapTimeString}</span>
                    </div>
                  )}
                </div>
              )}

              {activeChartMetric === 'sectors' && (
                <div className="space-y-1">
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
                  {data.avgS1String && (
                    <div className="border-t border-lmu-border/50 pt-1 text-[11px] text-lmu-muted flex items-center justify-between gap-2">
                      <span>Sector Averages:</span>
                      <span className="font-mono text-white">
                        {data.avgS1String} / {data.avgS2String} / {data.avgS3String}
                      </span>
                    </div>
                  )}
                </div>
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
            ? sessionChartData.flatMap(d => [d.lapTime, d.avgLapTime])
            : activeChartMetric === 'sectors'
            ? sessionChartData.flatMap(d => [d.s1, d.s2, d.s3, d.avgS1, d.avgS2, d.avgS3])
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
                  {activeChartMetric === 'positions'
                    ? 'Driver Position Progression (Same Class)'
                    : activeChartMetric === 'tireWear'
                    ? 'Tire Wear & Degradation Telemetry'
                    : activeChartMetric === 'fuelEnergy'
                    ? 'Fuel Consumption & Virtual Energy Telemetry'
                    : 'Lap & Sector Telemetry Chart'}
                </h3>
                <p className="text-xs text-lmu-muted mt-0.5">
                  {activeChartMetric === 'positions'
                    ? `Lap-by-lap position chart isolated to ${selectedDriver.carClass || 'same class'} competitors. Click legend items to toggle drivers.`
                    : activeChartMetric === 'tireWear'
                    ? 'Individual 4-wheel tire degradation progression and tire wear percentage over stints. Click legend items to toggle.'
                    : activeChartMetric === 'fuelEnergy'
                    ? 'Fuel tank level, per-lap fuel consumption, and Virtual Energy hybrid management (LMH/LMDh).'
                    : 'Session lap pace progression, session average, sector splits (S1/S2/S3), and sector averages. Click legend to toggle lines.'}
                </p>
              </div>

              {/* Metric Toggle */}
              <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold shrink-0 flex-wrap gap-1">
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
                  onClick={() => setChartMetric('positions')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    activeChartMetric === 'positions'
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Positions
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

            <div className="h-[340px] min-h-[300px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%" minHeight={280}>
                <LineChart
                  key={`session-chart-${activeChartMetric}-${sessionChartData.length}`}
                  data={activeChartMetric === 'positions' ? positionChartData : sessionChartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.5} />
                  <XAxis dataKey="lapNum" stroke="#718096" tick={{ fill: '#A0AEC0', fontSize: 11 }} />
                  <YAxis
                    reversed={activeChartMetric === 'positions'}
                    stroke="#718096"
                    tick={{ fill: '#A0AEC0', fontSize: 11 }}
                    domain={
                      activeChartMetric === 'positions'
                        ? [1, Math.max(maxPosInClass, 2)]
                        : [yDomainMin, yDomainMax]
                    }
                    ticks={
                      activeChartMetric === 'positions'
                        ? Array.from({ length: Math.max(maxPosInClass, 2) }, (_, i) => i + 1)
                        : undefined
                    }
                    tickFormatter={(val) => {
                      if (activeChartMetric === 'positions') return `P${val}`;
                      if (activeChartMetric === 'topSpeed') return `${val} km/h`;
                      if (activeChartMetric === 'tireWear' || activeChartMetric === 'fuelEnergy') return `${val}%`;
                      return formatTime(val);
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    onClick={handleLegendClick}
                    wrapperStyle={{ paddingTop: 10, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
                    formatter={(value, entry: any) => {
                      const isHidden = Boolean(hiddenSeries[entry.dataKey]);
                      return (
                        <span
                          className={`inline-flex items-center gap-1 cursor-pointer select-none transition-opacity ${
                            isHidden ? 'opacity-35 line-through text-lmu-muted' : 'opacity-100 font-semibold'
                          }`}
                          title={`Click to toggle ${value} visibility`}
                        >
                          {value}
                        </span>
                      );
                    }}
                  />

                  {activeChartMetric === 'positions' && (
                    <>
                      {driversToPlot.map((d, idx) => {
                        const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
                        const color = isPlayer
                          ? PLAYER_HIGHLIGHT_COLOR
                          : OPPONENT_COLORS[idx % OPPONENT_COLORS.length];
                        return (
                          <Line
                            key={d.name}
                            type="monotone"
                            dataKey={d.name}
                            name={isPlayer ? `${d.name} (You)` : d.name}
                            stroke={color}
                            strokeWidth={isPlayer ? 3.5 : 1.8}
                            dot={isPlayer ? { r: 4, fill: color } : { r: 2.5, fill: color }}
                            activeDot={{ r: isPlayer ? 6 : 4, stroke: '#fff', strokeWidth: 1.5 }}
                            connectNulls={true}
                            hide={Boolean(hiddenSeries[d.name])}
                          />
                        );
                      })}
                    </>
                  )}

                  {activeChartMetric === 'lapTime' && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="lapTime"
                        name="Lap Time"
                        stroke="#E53E3E"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#E53E3E', strokeWidth: 2, stroke: '#FFFFFF' }}
                        activeDot={{ r: 7 }}
                        connectNulls={true}
                        hide={Boolean(hiddenSeries['lapTime'])}
                      />
                      {avgLapTime !== null && (
                        <Line
                          type="monotone"
                          dataKey="avgLapTime"
                          name="Session Avg Lap"
                          stroke="#A78BFA"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          connectNulls={true}
                          hide={Boolean(hiddenSeries['avgLapTime'])}
                        />
                      )}
                    </>
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
                        hide={Boolean(hiddenSeries['s1'])}
                      />
                      {avgS1 !== null && (
                        <Line
                          type="monotone"
                          dataKey="avgS1"
                          name="Avg S1"
                          stroke="#FDE047"
                          strokeWidth={1.8}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls={true}
                          hide={Boolean(hiddenSeries['avgS1'])}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="s2"
                        name="Sector 2"
                        stroke="#3182CE"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#3182CE' }}
                        connectNulls={true}
                        hide={Boolean(hiddenSeries['s2'])}
                      />
                      {avgS2 !== null && (
                        <Line
                          type="monotone"
                          dataKey="avgS2"
                          name="Avg S2"
                          stroke="#60A5FA"
                          strokeWidth={1.8}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls={true}
                          hide={Boolean(hiddenSeries['avgS2'])}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="s3"
                        name="Sector 3"
                        stroke="#38A169"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#38A169' }}
                        connectNulls={true}
                        hide={Boolean(hiddenSeries['s3'])}
                      />
                      {avgS3 !== null && (
                        <Line
                          type="monotone"
                          dataKey="avgS3"
                          name="Avg S3"
                          stroke="#4ADE80"
                          strokeWidth={1.8}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls={true}
                          hide={Boolean(hiddenSeries['avgS3'])}
                        />
                      )}
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
                      hide={Boolean(hiddenSeries['topSpeed'])}
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
                        hide={Boolean(hiddenSeries['twFL'])}
                      />
                      <Line
                        type="monotone"
                        dataKey="twFR"
                        name="Front Right (FR)"
                        stroke="#60A5FA"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#60A5FA' }}
                        connectNulls={true}
                        hide={Boolean(hiddenSeries['twFR'])}
                      />
                      <Line
                        type="monotone"
                        dataKey="twRL"
                        name="Rear Left (RL)"
                        stroke="#34D399"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#34D399' }}
                        connectNulls={true}
                        hide={Boolean(hiddenSeries['twRL'])}
                      />
                      <Line
                        type="monotone"
                        dataKey="twRR"
                        name="Rear Right (RR)"
                        stroke="#FBBF24"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#FBBF24' }}
                        connectNulls={true}
                        hide={Boolean(hiddenSeries['twRR'])}
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
                        hide={Boolean(hiddenSeries['twAvg'])}
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
                        hide={Boolean(hiddenSeries['fuel'])}
                      />
                      <Line
                        type="monotone"
                        dataKey="virtualEnergy"
                        name="Virtual Energy (%)"
                        stroke="#818CF8"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#818CF8' }}
                        connectNulls={true}
                        hide={Boolean(hiddenSeries['virtualEnergy'])}
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
                <th className="px-3 py-3 text-right" title="Consecutive lap-to-lap delta (Lap N - Lap N-1)">Δ Prev</th>
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
              {(() => {
                const bestLap = selectedDriver?.bestLapTime ?? null;
                const bestS1 = selectedDriver?.bestS1 ?? null;
                const bestS2 = selectedDriver?.bestS2 ?? null;
                const bestS3 = selectedDriver?.bestS3 ?? null;
                const theoBest = selectedDriver?.theoreticalBest ?? null;

                return (selectedDriver?.laps || []).map((l, idx, allLaps) => {
                  const isSessionBest = l.lapTime !== null && bestLap !== null &&
                    Math.abs(l.lapTime - bestLap) < 0.0005;
                  const isLapAllTimePB = isSessionBest && isCurrentSessionAllTimePB;
                  
                  let deltaStr = '--';
                  if (l.lapTime && bestLap) {
                    const delta = l.lapTime - bestLap;
                    if (Math.abs(delta) < 0.0005) {
                      deltaStr = isLapAllTimePB ? '⭐ PERSONAL BEST' : 'SESSION BEST';
                    } else {
                      deltaStr = `+${delta.toFixed(3)}s`;
                    }
                  }

                  const prevLap = idx > 0 ? allLaps[idx - 1] : null;
                  const lapToLap = computeLapToLapDelta(prevLap?.lapTime, l.lapTime);

                  const theoGapLap = (l.lapTime && theoBest && l.isValid && !isSessionBest)
                    ? parseFloat((l.lapTime - theoBest).toFixed(3))
                    : null;

                  const isS1Best = l.s1 !== null && bestS1 !== null && Math.abs(l.s1 - bestS1) < 0.0005;
                  const isS2Best = l.s2 !== null && bestS2 !== null && Math.abs(l.s2 - bestS2) < 0.0005;
                  const isS3Best = l.s3 !== null && bestS3 !== null && Math.abs(l.s3 - bestS3) < 0.0005;

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
                    <td className="px-3 py-2.5 text-right font-semibold text-xs">
                      <span className={isLapAllTimePB ? 'text-lmu-gold font-bold' : isSessionBest ? 'text-lmu-blue font-bold' : 'text-white'}>
                        {deltaStr}
                      </span>
                      {theoGapLap !== null && (
                        <span className="block text-[10px] text-emerald-400/80 font-mono" title={`Gap to Theoretical Optimal (${formatTime(theoBest)})`}>
                          +{theoGapLap.toFixed(3)}s vs opt
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold text-xs ${lapToLap.deltaClass}`}
                      title={prevLap ? `Lap-to-lap delta vs Lap ${prevLap.lapNum} (${formatTime(prevLap.lapTime)}): ${lapToLap.formatted}` : 'Initial lap'}
                    >
                      {lapToLap.formatted}
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
                      ) : l.lapNum === 1 && (session.sessionType === 'Race' || selectedDriver?.gridPosition !== null) ? (
                        <span
                          className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium"
                          title="Race Start Lap (Standing/Rolling start on cold tires — excluded from average flying pace)"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          Start Lap
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
              });
            })()}
          </tbody>
          </table>
        </div>
      </div>

      {/* Race Classification & Driver Standings (Multi-Driver Sessions) - Placed on the bottom */}
      {session.drivers && session.drivers.length > 1 && (
        <div className="glass-panel p-5 rounded-2xl relative space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Trophy className="w-4 h-4 text-lmu-gold" />
                <span>Session Classification & Driver Standings ({session.drivers.length} Drivers)</span>
              </h3>
              <p className="text-xs text-lmu-muted mt-0.5">
                Full race results, grid starting positions, position gains, and best lap times. Click a driver to inspect their lap telemetry.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs text-lmu-muted">
              <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
                <tr>
                  <th className="px-3.5 py-3 text-center">Pos</th>
                  {isMultiClass && <th className="px-3.5 py-3 text-center">Class Pos</th>}
                  <th className="px-3.5 py-3">Driver</th>
                  <th className="px-3.5 py-3">Car & Class</th>
                  <th className="px-3.5 py-3 text-center">Grid</th>
                  <th className="px-3.5 py-3 text-center">Gain</th>
                  <th className="px-3.5 py-3 text-right">Best Lap</th>
                  <th className="px-3.5 py-3 text-center">Laps</th>
                  <th className="px-3.5 py-3 text-center">Pit Stops</th>
                  <th className="px-3.5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lmu-border/50">
                {session.drivers.map(d => {
                  const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
                  const isSelected = d.name === selectedDriverName;

                  return (
                    <tr
                      key={d.name}
                      onClick={() => setSelectedDriverName(d.name)}
                      className={`hover:bg-lmu-card/60 transition-colors cursor-pointer ${
                        isSelected ? 'bg-lmu-accent/15 border-l-2 border-lmu-accent' : isPlayer ? 'bg-lmu-gold/10' : ''
                      }`}
                    >
                      <td className="px-3.5 py-2.5 text-center font-bold text-white font-mono">
                        P{d.position || '-'}
                      </td>
                      {isMultiClass && (
                        <td className="px-3.5 py-2.5 text-center font-bold text-lmu-cyan font-mono">
                          {d.classPosition ? `P${d.classPosition}` : '-'}
                        </td>
                      )}
                      <td className="px-3.5 py-2.5 font-medium text-white">
                        <div className="flex items-center gap-1.5">
                          {isPlayer && <span className="text-lmu-gold">⭐</span>}
                          <span className={isPlayer ? 'font-bold text-lmu-gold' : isSelected ? 'font-bold text-white' : 'text-white'}>
                            {d.name} {isPlayer ? '(You)' : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="text-white font-medium">{d.carType}</span>
                        <span className="text-lmu-muted ml-1.5 text-[11px]">({d.carClass || 'General'})</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-white">
                        {d.gridPosition ? `P${d.gridPosition}` : '-'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-bold">
                        {d.positionGain !== null && d.positionGain !== undefined ? (
                          <span className={d.positionGain > 0 ? 'text-lmu-green' : d.positionGain < 0 ? 'text-rose-400' : 'text-slate-300'}>
                            {d.positionGain > 0 ? `+${d.positionGain}` : d.positionGain}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-lmu-gold">
                        {d.bestLapTimeString}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-white">
                        {d.lapsCount}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono text-amber-300">
                        {d.pitStopsCount ?? 0}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          (d.finishStatus || '').toLowerCase().includes('dnf')
                            ? 'bg-rose-950/50 text-rose-300'
                            : 'bg-emerald-950/50 text-emerald-300'
                        }`}>
                          {d.finishStatus || (d.position > 0 ? 'Finished' : '-')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

