import React, { useState, useEffect } from 'react';
import { ArrowLeft, Video, Download, Zap, ShieldCheck, AlertTriangle, TrendingUp, Clock, Gauge, ChevronRight } from 'lucide-react';
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
import { DetailedSession, ReferenceLaptimeEntry, SessionProgressionPoint } from '../../server/types.js';
import { formatTime, getDisplayTrackName } from '../utils/formatters.js';
import { getPaceCategoryStyle, formatPacePercentage, matchesCarClass, normalizeTrackName } from '../utils/paceCategory.js';

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
  const [chartMetric, setChartMetric] = useState<'lapTime' | 'sectors' | 'topSpeed'>('lapTime');

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

  const selectedDriver = session.drivers.find(d => d.name === selectedDriverName) || session.drivers[0];

  // All-time Personal Best for this specific driver, track, and vehicle category (LMGT3, Hypercar, LMP2, GTE, etc.)
  const allTimeCategoryTrackPB = (() => {
    if (!session || !selectedDriver || progression.length === 0) return null;
    const normTrack = getDisplayTrackName(session.trackVenue, session.trackCourse).toLowerCase().trim();
    const driverClass = selectedDriver.carClass || selectedDriver.carType || '';
    const driverNorm = (selectedDriver.name || '').toLowerCase().trim();

    const matchingProg = progression.filter(p => {
      const pTrack = (p.displayTrack || getDisplayTrackName(p.trackVenue, p.trackCourse) || p.trackVenue).toLowerCase().trim();
      const isTrack = pTrack === normTrack;
      const isClass = matchesCarClass(p.carClass, p.carType, driverClass) ||
        matchesCarClass(driverClass, selectedDriver.carType, p.carClass);
      const isDriver = !driverNorm || (p.driverName || '').toLowerCase().trim() === driverNorm ||
        (p.driverName || '').toLowerCase().includes(driverNorm) ||
        driverNorm.includes((p.driverName || '').toLowerCase());
      return isTrack && isClass && isDriver && p.bestLapTime !== null && p.bestLapTime > 0;
    });

    if (matchingProg.length === 0) return selectedDriver.bestLapTime;
    return matchingProg.reduce<number | null>((min, p) => {
      if (p.bestLapTime === null) return min;
      if (min === null || p.bestLapTime < min) return p.bestLapTime;
      return min;
    }, null);
  })();

  const isCurrentSessionAllTimePB = selectedDriver?.bestLapTime !== null &&
    allTimeCategoryTrackPB !== null &&
    (selectedDriver?.bestLapTime || 0) <= allTimeCategoryTrackPB + 0.0005;

  const refEntry = (() => {
    if (!refCache?.entries || !session || !selectedDriver) return null;
    const entries: ReferenceLaptimeEntry[] = Object.values(refCache.entries);

    const normTrack = normalizeTrackName(session.trackVenue, session.trackCourse).toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Try exact normalized track matches first
    let trackMatches = entries.filter(e => {
      const eNorm = normalizeTrackName(e.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
      const eRaw = e.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return eNorm === normTrack || eRaw === normTrack;
    });

    // 2. Fallback to substring matching if no exact matches exist
    if (trackMatches.length === 0) {
      trackMatches = entries.filter(e => {
        const eNorm = normalizeTrackName(e.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
        const eRaw = e.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return eNorm.includes(normTrack) || normTrack.includes(eNorm) || eRaw.includes(normTrack) || normTrack.includes(eRaw);
      });
    }

    if (trackMatches.length > 0) {
      const classMatch = trackMatches.find(e =>
        matchesCarClass(e.carClass, e.carClass, selectedDriver.carClass || selectedDriver.carType) ||
        matchesCarClass(selectedDriver.carClass || selectedDriver.carType, selectedDriver.carType, e.carClass)
      );
      return classMatch || trackMatches[0];
    }
    return null;
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
              {session.drivers.map(d => (
                <option key={d.name} value={d.name}>
                  {d.isPlayer ? '⭐ ' : ''}{d.name} ({d.carType})
                </option>
              ))}
            </select>
          </div>
        </div>

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

        {/* Replay file banner if matched */}
        {session.matchingReplayFile && (
          <div className="p-3 rounded-xl bg-lmu-green/10 border border-lmu-green/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-lmu-green font-medium truncate">
              <Video className="w-4 h-4 shrink-0" />
              <span>Matching Replay (.VCR): <strong className="text-white">{session.matchingReplayFile.name}</strong></span>
            </div>
            <button
              onClick={handleCopyReplayPath}
              className="px-3 py-1 rounded bg-lmu-green/20 hover:bg-lmu-green/30 text-lmu-green font-semibold text-xs transition-all shrink-0"
            >
              {copiedReplay ? 'Path Copied!' : 'Copy Path'}
            </button>
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

              {chartMetric === 'lapTime' && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-lmu-muted">Lap Pace:</span>
                  <span className="font-bold text-lmu-gold">{data.lapTimeString}</span>
                </div>
              )}

              {chartMetric === 'sectors' && (
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

              {chartMetric === 'topSpeed' && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-lmu-muted">Top Speed:</span>
                  <span className="font-bold text-lmu-cyan">{data.topSpeed ? `${data.topSpeed.toFixed(1)} km/h` : 'N/A'}</span>
                </div>
              )}
            </div>
          );
        };

        const sessionChartTimes = (() => {
          if (chartMetric === 'lapTime') {
            return sessionChartData.map(d => d.lapTime).filter((v): v is number => v !== null && v > 0);
          }
          if (chartMetric === 'sectors') {
            return [
              ...sessionChartData.map(d => d.s1),
              ...sessionChartData.map(d => d.s2),
              ...sessionChartData.map(d => d.s3),
            ].filter((v): v is number => v !== null && v > 0);
          }
          if (chartMetric === 'topSpeed') {
            return sessionChartData.map(d => d.topSpeed).filter((v): v is number => v !== null && v > 0);
          }
          return [];
        })();

        const yDomainMin = sessionChartTimes.length > 0
          ? (chartMetric === 'topSpeed'
              ? Math.max(0, Math.floor(Math.min(...sessionChartTimes) - 5))
              : Math.max(0, Math.floor(Math.min(...sessionChartTimes) - 1)))
          : 'auto';

        const yDomainMax = sessionChartTimes.length > 0
          ? (chartMetric === 'topSpeed'
              ? Math.ceil(Math.max(...sessionChartTimes) + 5)
              : Math.ceil(Math.max(...sessionChartTimes) + 1))
          : 'auto';

        return (
          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-lmu-accent" />
                  Lap & Sector Telemetry Chart
                </h3>
                <p className="text-xs text-lmu-muted mt-0.5">
                  Session lap pace progression, sector splits (S1/S2/S3), and top speeds by lap
                </p>
              </div>

              {/* Metric Toggle */}
              <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold shrink-0">
                <button
                  onClick={() => setChartMetric('lapTime')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    chartMetric === 'lapTime'
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
                    chartMetric === 'sectors'
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
                    chartMetric === 'topSpeed'
                      ? 'bg-lmu-accent text-white shadow-sm font-bold'
                      : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  Top Speed
                </button>
              </div>
            </div>

            <div className="h-72 min-h-[288px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                <LineChart
                  key={`session-chart-${chartMetric}-${sessionChartData.length}`}
                  data={sessionChartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.5} />
                  <XAxis dataKey="lapNum" stroke="#718096" tick={{ fill: '#A0AEC0', fontSize: 11 }} />
                  <YAxis
                    stroke="#718096"
                    tick={{ fill: '#A0AEC0', fontSize: 11 }}
                    domain={[yDomainMin, yDomainMax]}
                    tickFormatter={(val) => chartMetric === 'topSpeed' ? `${val}` : formatTime(val)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />

                  {chartMetric === 'lapTime' && (
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

                  {chartMetric === 'sectors' && (
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

                  {chartMetric === 'topSpeed' && (
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
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* Detailed Lap Table */}
      <div className="glass-panel p-5 rounded-2xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center justify-between">
          <span>Lap Telemetry Table ({selectedDriver?.laps?.length || 0} Laps)</span>
          <span className="text-xs font-normal text-lmu-muted">Deltas compared to driver's session best</span>
        </h3>

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
                <th className="px-3 py-3 text-center">Status</th>
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
                    <td className="px-3 py-2.5 font-bold text-white">{l.lapNum}</td>
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
                    <td className="px-3 py-2.5 text-center font-sans">
                      {l.isPitStop ? (
                        <span className="px-2 py-0.5 rounded bg-lmu-accent/20 text-lmu-accent text-xs font-semibold">
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
