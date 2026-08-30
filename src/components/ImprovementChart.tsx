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
import { TrendingUp, Zap, Trophy, Clock, Calendar } from 'lucide-react';
import { formatTime, getDisplayTrackName, matchesSessionType } from '../utils/formatters';
import { getPaceCategoryStyle, formatPacePercentage, matchesCarClass, VEHICLE_CLASS_OPTIONS } from '../utils/paceCategory';
import { PaceCategory } from '../../server/types.js';

export type TimeRangeFilter = 'all' | 'last-5' | 'last-10' | 'last-20' | 'week' | 'month' | 'year';

export interface SessionProgressionPoint {
  sessionId: string;
  timestamp: number;
  dateString: string;
  sessionType: string;
  sessionName?: string;
  trackVenue: string;
  trackCourse?: string;
  displayTrack?: string;
  weatherInfo?: string;
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
  selectedCarModel?: string;
  filterType?: string;
  searchQuery?: string;
  tracks: string[];
  hideEmpty?: boolean;
  setHideEmpty?: (hide: boolean) => void;
  embedded?: boolean;
  yourBest?: {
    timeStr: string;
    paceCat?: PaceCategory | null;
    pacePct?: number | null;
  };
  onSelectSession?: (sessionId: string) => void;
  timeRange?: TimeRangeFilter;
  onTimeRangeChange?: (range: TimeRangeFilter) => void;
}

export const ImprovementChart: React.FC<ImprovementChartProps> = ({
  progression,
  selectedTrack,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  selectedCarModel = 'All',
  filterType = 'All',
  searchQuery = '',
  tracks = [],
  hideEmpty = true,
  embedded = false,
  yourBest,
  onSelectSession,
  timeRange,
  onTimeRangeChange,
}) => {
  const [metric, setMetric] = useState<'bestLap' | 'sectors' | 'theoretical'>('bestLap');
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRangeFilter>('all');
  const activeRange = timeRange !== undefined ? timeRange : internalTimeRange;
  const setRange = onTimeRangeChange || setInternalTimeRange;

  // Filter progression by selected track, vehicle class, car model, session type, search & empty filter
  const activeTrack = selectedTrack === 'All' && tracks.length > 0 ? tracks[0] : selectedTrack;
  const rawTrackData = progression.filter(p => {
    const display = (p.displayTrack || getDisplayTrackName(p.trackVenue, p.trackCourse) || p.trackVenue).toLowerCase().trim();
    const pVenue = (p.trackVenue || '').toLowerCase().trim();
    const activeNorm = activeTrack.toLowerCase().trim();
    const matchesTrack = activeTrack === 'All' ||
      display === activeNorm ||
      pVenue === activeNorm ||
      (activeNorm.length > 3 && pVenue.includes(activeNorm)) ||
      (pVenue.length > 3 && activeNorm.includes(pVenue));

    const matchesClass = matchesCarClass(p.carClass, p.carType, selectedCarClass);
    const matchesModel = !selectedCarModel || selectedCarModel === 'All' || p.carType === selectedCarModel;

    const matchesType = matchesSessionType(p.sessionType, p.sessionName, filterType);

    const q = (searchQuery || '').toLowerCase().trim();
    const matchesSearch = q === '' ||
      p.carType.toLowerCase().includes(q) ||
      p.driverName.toLowerCase().includes(q) ||
      p.sessionType.toLowerCase().includes(q) ||
      (p.sessionName || '').toLowerCase().includes(q) ||
      (p.weatherInfo || '').toLowerCase().includes(q);

    return matchesTrack && matchesClass && matchesModel && matchesType && matchesSearch;
  });

  const allTrackData = rawTrackData.filter(p => !hideEmpty || (p.totalLapsCount > 0 && p.bestLapTime !== null));

  // Apply Date Range / Session Count filter
  const trackData = (() => {
    if (activeRange === 'all') return allTrackData;
    if (activeRange === 'last-5') return allTrackData.slice(-5);
    if (activeRange === 'last-10') return allTrackData.slice(-10);
    if (activeRange === 'last-20') return allTrackData.slice(-20);

    if (allTrackData.length === 0) return [];
    const validTimestamps = allTrackData.map(p => p.timestamp).filter(t => !isNaN(t) && t > 0);
    if (validTimestamps.length === 0) return allTrackData;
    const latestTimestamp = Math.max(...validTimestamps);

    let durationMs = 0;
    if (activeRange === 'week') durationMs = 7 * 24 * 60 * 60 * 1000;
    else if (activeRange === 'month') durationMs = 30 * 24 * 60 * 60 * 1000;
    else if (activeRange === 'year') durationMs = 365 * 24 * 60 * 60 * 1000;

    const cutoff = latestTimestamp - durationMs;
    const filtered = allTrackData.filter(p => p.timestamp >= cutoff);
    return filtered.length > 0 ? filtered : allTrackData;
  })();

  // Calculate improvement stats
  const sessionsWithValidLaps = trackData.filter(p => p.bestLapTime !== null);
  const firstValidSession = sessionsWithValidLaps[0];
  const bestLapTimeInTrack = trackData.reduce<number | null>((min, curr) => {
    if (curr.bestLapTime === null) return min;
    if (min === null || curr.bestLapTime < min) return curr.bestLapTime;
    return min;
  }, null);

  let totalImprovement: number | null = null;
  if (firstValidSession?.bestLapTime && bestLapTimeInTrack !== null && sessionsWithValidLaps.length > 1) {
    totalImprovement = parseFloat((firstValidSession.bestLapTime - bestLapTimeInTrack).toFixed(3));
  }

  // Format chart data with rolling 3-session moving average
  const validLapsQueue: number[] = [];
  const chartData = trackData.map((p, idx) => {
    const sessionDate = p.dateString ? p.dateString.split(' ')[0] : '';
    const dateParts = sessionDate.split('/');
    const shortDate = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : sessionDate;
    const labelSession = p.sessionName || p.sessionType || `S#${idx + 1}`;
    const shortSessionLabel = shortDate ? `${labelSession} (${shortDate})` : `#${idx + 1} ${labelSession}`;

    let movingAvg: number | null = null;
    if (p.bestLapTime !== null && p.bestLapTime > 0) {
      validLapsQueue.push(p.bestLapTime);
      if (validLapsQueue.length > 3) {
        validLapsQueue.shift();
      }
      const sum = validLapsQueue.reduce((a, b) => a + b, 0);
      movingAvg = parseFloat((sum / validLapsQueue.length).toFixed(3));
    }

    return {
      sessionId: p.sessionId,
      session: `${labelSession} #${idx + 1}${sessionDate ? ` (${sessionDate})` : ''}`,
      shortSession: shortSessionLabel,
      date: sessionDate || `Session ${idx + 1}`,
      fullDate: p.dateString,
      car: p.carType,
      weather: p.weatherInfo,
      bestLap: p.bestLapTime,
      bestLapStr: formatTime(p.bestLapTime),
      movingAvg,
      movingAvgStr: formatTime(movingAvg),
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
    };
  });

  // Min / Max domain calculation for chart Y axis based on active metric
  const validTimes = (() => {
    if (metric === 'sectors') {
      return [
        ...trackData.map(p => p.bestS1),
        ...trackData.map(p => p.bestS2),
        ...trackData.map(p => p.bestS3),
      ];
    }
    if (metric === 'theoretical') {
      return [
        ...trackData.map(p => p.bestLapTime),
        ...chartData.map(p => p.movingAvg),
        ...trackData.map(p => p.theoreticalBest),
      ];
    }
    // bestLap
    return [
      ...trackData.map(p => p.bestLapTime),
      ...trackData.map(p => p.avgLapTime),
      ...chartData.map(p => p.movingAvg),
    ];
  })().filter((t): t is number => t !== null && t !== undefined && !isNaN(t) && t > 0);

  const minTime = validTimes.length > 0 ? Math.max(0, Math.floor(Math.min(...validTimes) - 2)) : 0;
  const maxTime = validTimes.length > 0 ? Math.ceil(Math.max(...validTimes) + 2) : 100;

  // Custom rich tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-lmu-card/95 backdrop-blur-md border border-lmu-border p-3.5 rounded-xl shadow-xl space-y-2 text-xs min-w-[210px]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-white text-sm">{data.session}</span>
              {data.weather && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-lmu-bg border border-lmu-border/60 text-lmu-cyan">
                  {data.weather}
                </span>
              )}
            </div>
            <p className="text-[11px] text-lmu-muted mt-0.5">{data.fullDate}</p>
            <p className="text-xs text-lmu-gold font-medium mt-0.5 truncate max-w-[200px]" title={data.car}>
              {data.car}
            </p>
          </div>

          <div className="border-t border-lmu-border/60 pt-2 space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={`item-${index}`} className="flex items-center justify-between text-xs font-mono">
                <span style={{ color: entry.color }} className="font-sans font-medium text-[11px]">
                  {entry.name}:
                </span>
                <span className="font-bold text-white">
                  {entry.value !== null && entry.value !== undefined ? formatTime(Number(entry.value)) : '-'}
                </span>
              </div>
            ))}
          </div>

          {onSelectSession && (
            <p className="text-[10px] text-lmu-accent pt-1.5 border-t border-lmu-border/40 text-center font-semibold cursor-pointer hover:underline">
              Click dot to view session telemetry &rarr;
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">

      {/* Standalone Header (Only when not embedded) */}
      {!embedded && (
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
          </div>
        </div>
      )}

      {/* Highlights / Improvement Stat Banner */}
      {trackData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-panel p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs text-lmu-muted uppercase font-semibold">Total Sessions Parsed</p>
              <h4 className="text-2xl font-extrabold text-white mt-0.5">{trackData.length}</h4>
              <p className="text-[11px] text-lmu-muted mt-0.5">
                {selectedCarModel !== 'All' ? `${selectedCarModel}` : `${selectedCarClass === 'All' ? 'All Classes' : selectedCarClass}`}
              </p>
            </div>
            <Clock className="w-8 h-8 text-lmu-blue opacity-50" />
          </div>

          <div className="glass-panel p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs text-lmu-muted uppercase font-semibold">
                Your Best ({selectedCarModel !== 'All' ? selectedCarModel : (selectedCarClass === 'All' ? 'Overall' : selectedCarClass)})
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <h4 className="text-2xl font-extrabold text-lmu-gold font-mono">
                  {yourBest?.timeStr || (bestLapTimeInTrack ? formatTime(bestLapTimeInTrack) : '--:--.---')}
                </h4>
              </div>
              {yourBest?.paceCat && (
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${getPaceCategoryStyle(yourBest.paceCat).badgeClass}`}>
                    <span>{getPaceCategoryStyle(yourBest.paceCat).emoji}</span>
                    <span>{yourBest.paceCat}</span>
                    <span className="opacity-80 text-[10px]">({formatPacePercentage(yourBest.pacePct)})</span>
                  </span>
                </div>
              )}
            </div>
            <Trophy className="w-8 h-8 text-lmu-gold opacity-50 shrink-0" />
          </div>

          <div className="glass-panel p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs text-lmu-muted uppercase font-semibold">Overall Pace Improvement</p>
              <h4 className={`text-2xl font-extrabold mt-0.5 font-mono ${totalImprovement !== null && totalImprovement > 0 ? 'text-lmu-green' : 'text-white'
                }`}>
                {totalImprovement !== null
                  ? `${totalImprovement > 0 ? '-' : '+'}${Math.abs(totalImprovement).toFixed(3)}s`
                  : sessionsWithValidLaps.length === 1 ? '0.000s' : 'N/A'}
              </h4>
              <p className="text-[11px] text-lmu-muted mt-0.5">
                {sessionsWithValidLaps.length > 1 && totalImprovement !== null && totalImprovement > 0
                  ? `Baseline ${formatTime(firstValidSession.bestLapTime)} → PB ${formatTime(bestLapTimeInTrack)}`
                  : sessionsWithValidLaps.length === 1
                  ? 'Initial baseline session recorded'
                  : 'Session progression tracking'}
              </p>
            </div>
            <Zap className="w-8 h-8 text-lmu-green opacity-50" />
          </div>
        </div>
      )}

      {/* Main Chart Card with Integrated Controls */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-lmu-border/50">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-lmu-accent" />
              <span>Progression Timeline — {activeTrack}</span>
            </h3>
            <span className="text-xs text-lmu-muted">
              Displaying {trackData.length} of {allTrackData.length} recorded sessions
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Range & Session Count Selector */}
            <div className="flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white shrink-0">
              <Calendar className="w-3.5 h-3.5 text-lmu-accent" />
              <span className="text-lmu-muted font-medium">History:</span>
              <select
                value={activeRange}
                onChange={(e) => setRange(e.target.value as TimeRangeFilter)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                <optgroup label="Session Count" className="bg-lmu-card text-white font-semibold">
                  <option value="all" className="bg-lmu-card text-white">All Sessions ({allTrackData.length})</option>
                  <option value="last-5" className="bg-lmu-card text-white">Last 5 Sessions</option>
                  <option value="last-10" className="bg-lmu-card text-white">Last 10 Sessions</option>
                  <option value="last-20" className="bg-lmu-card text-white">Last 20 Sessions</option>
                </optgroup>
                <optgroup label="Date Range" className="bg-lmu-card text-white font-semibold">
                  <option value="week" className="bg-lmu-card text-white">Last Week (7 Days)</option>
                  <option value="month" className="bg-lmu-card text-white">Last Month (30 Days)</option>
                  <option value="year" className="bg-lmu-card text-white">Last Year (365 Days)</option>
                </optgroup>
              </select>
            </div>

            {/* Metric Toggle */}
            <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium">
              <button
                onClick={() => setMetric('bestLap')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  metric === 'bestLap' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
                }`}
              >
                Lap Pace (Best, Trend & Avg)
              </button>
              <button
                onClick={() => setMetric('sectors')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  metric === 'sectors' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
                }`}
              >
                Sectors (S1/S2/S3)
              </button>
              <button
                onClick={() => setMetric('theoretical')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  metric === 'theoretical' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
                }`}
              >
                Theoretical Best
              </button>
            </div>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="py-16 text-center text-lmu-muted">
            No session data found for this track matching current filters.
          </div>
        ) : (
          <div className="w-full h-80 min-h-[320px] pt-2">
            <ResponsiveContainer width="100%" height="100%" minHeight={280}>
              <LineChart
                key={`${activeTrack}-${selectedCarClass}-${selectedCarModel}-${filterType}-${activeRange}-${chartData.length}-${metric}`}
                data={chartData}
                margin={{ top: 10, right: 25, left: 10, bottom: chartData.length > 5 ? 35 : 15 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length > 0) {
                    const sId = e.activePayload[0].payload.sessionId;
                    if (sId && onSelectSession) {
                      onSelectSession(sId);
                    }
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#232A36" />
                <XAxis
                  dataKey="shortSession"
                  stroke="#8D99AE"
                  tick={{ fill: '#8D99AE', fontSize: 11 }}
                  interval={chartData.length > 10 ? 'preserveStartEnd' : 0}
                  height={chartData.length > 5 ? 40 : 25}
                  angle={chartData.length > 5 ? -18 : 0}
                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                  dy={chartData.length > 5 ? 4 : 0}
                />
                <YAxis
                  domain={[minTime, maxTime]}
                  stroke="#8D99AE"
                  tick={{ fill: '#8D99AE', fontSize: 12 }}
                  tickFormatter={(val) => formatTime(val)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '15px' }} />

                {metric === 'bestLap' && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="bestLap"
                      name="Best Lap Time"
                      stroke="#E63946"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#E63946', cursor: onSelectSession ? 'pointer' : 'default' }}
                      activeDot={{ r: 8, cursor: onSelectSession ? 'pointer' : 'default' }}
                      connectNulls={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="movingAvg"
                      name="3-Session Moving Avg"
                      stroke="#F59E0B"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={{ r: 3.5, fill: '#F59E0B' }}
                      connectNulls={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgLap"
                      name="Session Avg Lap"
                      stroke="#8ECAE6"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={{ r: 3.5, fill: '#8ECAE6' }}
                      connectNulls={true}
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
                      dot={{ r: 5, cursor: onSelectSession ? 'pointer' : 'default' }}
                      activeDot={{ r: 8, cursor: onSelectSession ? 'pointer' : 'default' }}
                      connectNulls={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="movingAvg"
                      name="3-Session Moving Avg"
                      stroke="#F59E0B"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={{ r: 3.5, fill: '#F59E0B' }}
                      connectNulls={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="theoretical"
                      name="Theoretical Best (S1+S2+S3)"
                      stroke="#2A9D8F"
                      strokeWidth={3}
                      strokeDasharray="3 3"
                      dot={{ r: 5, fill: '#2A9D8F' }}
                      connectNulls={true}
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
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#FFB703' }}
                      activeDot={{ r: 7 }}
                      connectNulls={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="s2"
                      name="Sector 2"
                      stroke="#219EBC"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#219EBC' }}
                      activeDot={{ r: 7 }}
                      connectNulls={true}
                    />
                    <Line
                      type="monotone"
                      dataKey="s3"
                      name="Sector 3"
                      stroke="#2A9D8F"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#2A9D8F' }}
                      activeDot={{ r: 7 }}
                      connectNulls={true}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

    </div>
  );
};

