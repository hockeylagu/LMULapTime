import React, { useState } from 'react';
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
import { TrendingUp, Zap, Trophy, Clock, CheckCircle2, FilterX } from 'lucide-react';
import { formatTime } from '../utils/formatters';
import { matchesCarClass, VEHICLE_CLASS_OPTIONS } from '../utils/paceCategory';

interface SessionProgressionPoint {
  sessionId: string;
  timestamp: number;
  dateString: string;
  sessionType: string;
  trackVenue: string;
  carType: string;
  carClass: string;
  driverName: string;
  bestLapTime: number | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  cleanLapsCount: number;
  totalLapsCount: number;
  avgLapTime: number | null;
  matchingReplayFile?: string;
}

interface ImprovementChartProps {
  progression: SessionProgressionPoint[];
  selectedTrack: string;
  setSelectedTrack: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  tracks: string[];
}

export const ImprovementChart: React.FC<ImprovementChartProps> = ({
  progression,
  selectedTrack,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  tracks,
}) => {
  const [metric, setMetric] = useState<'bestLap' | 'sectors' | 'theoretical'>('bestLap');
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);

  // Filter progression by selected track, vehicle class & optional empty filter
  const activeTrack = selectedTrack === 'All' && tracks.length > 0 ? tracks[0] : selectedTrack;
  const rawTrackData = progression.filter(p =>
    p.trackVenue === activeTrack && matchesCarClass(p.carClass, p.carType, selectedCarClass)
  );
  const emptyCount = rawTrackData.filter(p => p.totalLapsCount === 0 || p.bestLapTime === null).length;
  const trackData = rawTrackData.filter(p => !hideEmpty || (p.totalLapsCount > 0 && p.bestLapTime !== null));

  // Calculate improvement stats
  const firstValidSession = trackData.find(p => p.bestLapTime !== null);
  const lastValidSession = [...trackData].reverse().find(p => p.bestLapTime !== null);

  let totalImprovement: number | null = null;
  if (firstValidSession?.bestLapTime && lastValidSession?.bestLapTime) {
    totalImprovement = parseFloat((firstValidSession.bestLapTime - lastValidSession.bestLapTime).toFixed(3));
  }

  // Format chart data
  const chartData = trackData.map((p, idx) => ({
    session: `${p.sessionType} #${idx + 1}`,
    date: p.dateString ? p.dateString.split(' ')[0] : `Session ${idx + 1}`,
    fullDate: p.dateString,
    car: p.carType,
    bestLap: p.bestLapTime,
    bestLapStr: formatTime(p.bestLapTime),
    theoretical: p.theoreticalBest,
    theoreticalStr: formatTime(p.theoreticalBest),
    s1: p.bestS1,
    s1Str: formatTime(p.bestS1),
    s2: p.bestS2,
    s2Str: formatTime(p.bestS2),
    s3: p.bestS3,
    s3Str: formatTime(p.bestS3),
    avgLap: p.avgLapTime,
    avgLapStr: formatTime(p.avgLapTime),
    cleanLaps: p.cleanLapsCount,
    replay: p.matchingReplayFile,
  }));

  // Min / Max domain calculation for chart Y axis
  const validTimes = trackData
    .map(p => p.bestLapTime)
    .filter((t): t is number => t !== null && t > 0);

  const minTime = validTimes.length > 0 ? Math.floor(Math.min(...validTimes) - 2) : 0;
  const maxTime = validTimes.length > 0 ? Math.ceil(Math.max(...validTimes) + 2) : 100;

  return (
    <div className="space-y-6">

      {/* Header & Controls */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-lmu-accent" />
            Lap & Sector Improvement Over Time
          </h2>
          <p className="text-xs text-lmu-muted mt-1">
            Track how your lap times, sector splits, and theoretical limits evolved session by session
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Select Track */}
          <select
            value={activeTrack}
            onChange={(e) => setSelectedTrack(e.target.value)}
            className="bg-lmu-bg border border-lmu-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-lmu-accent font-medium"
          >
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

          {/* Metric Toggle */}
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium">
            <button
              onClick={() => setMetric('bestLap')}
              className={`px-3 py-1.5 rounded-lg transition-all ${metric === 'bestLap' ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
                }`}
            >
              Lap Pace
            </button>
            <button
              onClick={() => setMetric('sectors')}
              className={`px-3 py-1.5 rounded-lg transition-all ${metric === 'sectors' ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
                }`}
            >
              Sectors (S1/S2/S3)
            </button>
            <button
              onClick={() => setMetric('theoretical')}
              className={`px-3 py-1.5 rounded-lg transition-all ${metric === 'theoretical' ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
                }`}
            >
              Theoretical Best
            </button>
          </div>

          {/* Hide Empty Toggle */}
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${hideEmpty
                ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
                : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
              }`}
            title={hideEmpty ? "Hiding empty sessions. Click to show all." : "Showing all sessions. Click to filter out empty results."}
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
        </div>
      </div>

      {/* Highlights / Improvement Stat Banner */}
      {trackData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-panel p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs text-lmu-muted uppercase font-semibold">Total Sessions Parsed</p>
              <h4 className="text-2xl font-extrabold text-white mt-0.5">{trackData.length}</h4>
            </div>
            <Clock className="w-8 h-8 text-lmu-blue opacity-50" />
          </div>

          <div className="glass-panel p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs text-lmu-muted uppercase font-semibold">Current Personal Best</p>
              <h4 className="text-2xl font-extrabold text-lmu-gold font-mono mt-0.5">
                {lastValidSession?.bestLapTime ? formatTime(lastValidSession.bestLapTime) : '--:--.---'}
              </h4>
            </div>
            <Trophy className="w-8 h-8 text-lmu-gold opacity-50" />
          </div>

          <div className="glass-panel p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs text-lmu-muted uppercase font-semibold">Overall Pace Improvement</p>
              <h4 className={`text-2xl font-extrabold mt-0.5 font-mono ${totalImprovement !== null && totalImprovement > 0 ? 'text-lmu-green' : 'text-white'
                }`}>
                {totalImprovement !== null
                  ? `${totalImprovement > 0 ? '-' : '+'}${Math.abs(totalImprovement).toFixed(3)}s`
                  : 'N/A'}
              </h4>
            </div>
            <Zap className="w-8 h-8 text-lmu-green opacity-50" />
          </div>
        </div>
      )}

      {/* Main Chart */}
      <div className="glass-panel p-6 rounded-2xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center justify-between">
          <span>Progression Timeline — {activeTrack}</span>
          <span className="text-xs font-normal text-lmu-muted">Y-Axis: Lap Time (seconds)</span>
        </h3>

        {chartData.length === 0 ? (
          <div className="py-16 text-center text-lmu-muted">
            No session data found for this track.
          </div>
        ) : (
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232A36" />
                <XAxis dataKey="session" stroke="#8D99AE" tick={{ fill: '#8D99AE', fontSize: 12 }} />
                <YAxis
                  domain={[minTime, maxTime]}
                  stroke="#8D99AE"
                  tick={{ fill: '#8D99AE', fontSize: 12 }}
                  tickFormatter={(val) => formatTime(val)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#151A23',
                    borderColor: '#232A36',
                    borderRadius: '12px',
                    color: '#F8F9FA',
                  }}
                  formatter={(value: any) => [formatTime(Number(value)), '']}
                  labelFormatter={(label, items) => {
                    const item = items[0]?.payload;
                    return item ? `${label} (${item.fullDate}) - ${item.car}` : label;
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '15px' }} />

                {metric === 'bestLap' && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="bestLap"
                      name="Best Lap Time"
                      stroke="#E63946"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#E63946' }}
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgLap"
                      name="Session Avg Lap"
                      stroke="#8ECAE6"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 4, fill: '#8ECAE6' }}
                    />
                  </>
                )}

                {metric === 'theoretical' && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="bestLap"
                      name="Actual Best Lap"
                      stroke="#E63946"
                      strokeWidth={3}
                      dot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="theoretical"
                      name="Theoretical Best (S1+S2+S3)"
                      stroke="#2A9D8F"
                      strokeWidth={3}
                      strokeDasharray="3 3"
                      dot={{ r: 5, fill: '#2A9D8F' }}
                    />
                  </>
                )}

                {metric === 'sectors' && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="s1"
                      name="Sector 1"
                      stroke="#FFB703"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="s2"
                      name="Sector 2"
                      stroke="#219EBC"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="s3"
                      name="Sector 3"
                      stroke="#2A9D8F"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Session Comparison Table */}
      <div className="glass-panel p-5 rounded-2xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
          Session-over-Session Detailed Data Log
        </h3>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-lmu-muted">
            <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
              <tr>
                <th className="px-4 py-3">Date / Time</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Car Model</th>
                <th className="px-4 py-3 text-right">Best Lap</th>
                <th className="px-4 py-3 text-right">Theoretical Best</th>
                <th className="px-4 py-3 text-right">Sector 1</th>
                <th className="px-4 py-3 text-right">Sector 2</th>
                <th className="px-4 py-3 text-right">Sector 3</th>
                <th className="px-4 py-3 text-center">Replay VCR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lmu-border/50 font-mono">
              {chartData.map((row, idx) => (
                <tr key={idx} className="hover:bg-lmu-card/50 transition-colors">
                  <td className="px-4 py-3 text-white font-sans">{row.fullDate}</td>
                  <td className="px-4 py-3 font-bold text-lmu-accent">{row.session}</td>
                  <td className="px-4 py-3 text-white font-sans">{row.car}</td>
                  <td className="px-4 py-3 text-right text-lmu-gold font-bold">{row.bestLapStr}</td>
                  <td className="px-4 py-3 text-right text-lmu-green font-bold">{row.theoreticalStr}</td>
                  <td className="px-4 py-3 text-right">{row.s1Str}</td>
                  <td className="px-4 py-3 text-right">{row.s2Str}</td>
                  <td className="px-4 py-3 text-right">{row.s3Str}</td>
                  <td className="px-4 py-3 text-center font-sans">
                    {row.replay ? (
                      <span className="inline-flex items-center gap-1 text-lmu-green text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Available
                      </span>
                    ) : (
                      <span className="text-lmu-muted opacity-50">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
