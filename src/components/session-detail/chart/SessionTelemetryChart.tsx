import React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Clock, Zap, Gauge, ArrowUpDown, Disc, Fuel, TrendingUp, type LucideIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  type LegendPayload,
} from 'recharts';
import { DetailedSession, DriverData, FuelStrategyData } from '../../../../shared/types/index.js';
import { formatTime, getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { LMU_COLORS } from '../../../utils/themeColors.js';
import { SessionFuelStrategyCard } from '../standings/SessionFuelStrategyCard.js';
import { useSessionChartData } from './useSessionChartData.js';
import { SessionTelemetryTooltip } from './SessionTelemetryTooltip.js';
import { SessionTelemetrySeries } from './SessionTelemetrySeries.js';

export interface SessionTelemetryChartProps {
  session: DetailedSession;
  selectedDriver: DriverData;
  chartMetric: 'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions';
  setChartMetric: (m: 'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions') => void;
  activeChartMetric: 'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions';
  hasTireWearData: boolean;
  hasFuelData: boolean;
  hasVirtualEnergyData: boolean;
  isMultiClass: boolean;
  fuelStrategy: FuelStrategyData | null;
  hiddenSeries: Record<string, boolean>;
  handleLegendClick: (e: LegendPayload) => void;
}

type ChartMetric = SessionTelemetryChartProps['activeChartMetric'];

const METRIC_VIEWS: { metric: ChartMetric; label: string; icon: LucideIcon }[] = [
  { metric: 'lapTime', label: 'Lap Pace', icon: Clock },
  { metric: 'sectors', label: 'Sectors', icon: Zap },
  { metric: 'topSpeed', label: 'Top Speed', icon: Gauge },
  { metric: 'positions', label: 'Positions', icon: ArrowUpDown },
  { metric: 'tireWear', label: 'Tire Wear', icon: Disc },
  { metric: 'fuelEnergy', label: 'Fuel', icon: Fuel },
];

/** Legend order: you first, then the measured series, then their averages; alphabetical within each group. */
const legendOrder = (item: LegendPayload) => {
  const name = String(item.value ?? '');
  return `${name.endsWith('(You)') ? 0 : name.startsWith('Avg') || name.includes(' Avg') ? 2 : 1}${name}`;
};

export const SessionTelemetryChart: React.FC<SessionTelemetryChartProps> = ({
  session,
  selectedDriver,
  setChartMetric,
  activeChartMetric,
  hasTireWearData,
  hasFuelData,
  hasVirtualEnergyData,
  isMultiClass,
  fuelStrategy,
  hiddenSeries,
  handleLegendClick,
}) => {
  const navigate = useNavigate();
  const [focusedSeries, setFocusedSeries] = React.useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const {
    driversToPlot,
    maxPosInClass,
    avgLapTime,
    avgS1,
    avgS2,
    avgS3,
    positionChartData,
    sessionChartData,
  } = useSessionChartData({ session, selectedDriver, isMultiClass });

  const handleChartClick = (state: { activeLabel?: string | number } | null | undefined) => {
    if (state && state.activeLabel !== undefined) {
      const lapNum = parseInt(String(state.activeLabel), 10);
      if (!isNaN(lapNum) && lapNum > 0) {
        if (session.matchingReplayFile) {
          const telemetryParams = new URLSearchParams(searchParams);
          telemetryParams.set('replayName', session.matchingReplayFile.name);
          telemetryParams.set('lap', String(lapNum));
          navigate(`/telemetry?${telemetryParams.toString()}`);
        } else {
          const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
          const carClass = selectedDriver?.carClass || 'LMGT3';
          navigate(`/leaderboard?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
            carClass
          )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${lapNum}`);
        }
      }
    }
  };

  return (
    <div className="bg-lmu-card border border-lmu-border p-5 rounded-2xl relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-lmu-accent-text" aria-hidden="true" />
            {activeChartMetric === 'positions'
              ? 'Class positions'
              : activeChartMetric === 'tireWear'
              ? 'Tire wear'
              : activeChartMetric === 'fuelEnergy'
              ? 'Fuel & energy'
              : 'Lap trends'}
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            {activeChartMetric === 'positions'
              ? `${selectedDriver.carClass || 'Same class'} positions by lap. Select a point for telemetry.`
              : activeChartMetric === 'tireWear'
              ? 'Wear by wheel across stints. Select a lap for telemetry.'
              : activeChartMetric === 'fuelEnergy'
              ? 'Fuel use and available virtual energy. Select a lap for telemetry.'
              : 'Select a lap point for telemetry.'}
          </p>
        </div>

        {/* Metric switch: a view switch, so the selected view rests neutral, never red */}
        <div role="group" aria-label="Chart view" className="h-8 inline-flex items-center gap-0.5 bg-lmu-bg px-1 rounded-lg border border-lmu-border text-xs font-semibold shrink-0">
          {METRIC_VIEWS.map(({ metric, label, icon: Icon }) => {
            const available = metric === 'tireWear' ? hasTireWearData : metric === 'fuelEnergy' ? hasFuelData : true;
            const selected = activeChartMetric === metric;
            return (
              <button
                key={metric}
                type="button"
                aria-pressed={selected}
                disabled={!available}
                onClick={() => setChartMetric(metric)}
                title={available ? undefined : `No ${metric === 'tireWear' ? 'tire wear' : 'fuel or energy'} data in this session`}
                className={`h-6 px-2.5 inline-flex items-center gap-1.5 rounded-[5px] transition-colors ${
                  selected
                    ? 'bg-lmu-raised text-white'
                    : 'text-lmu-muted hover:text-white disabled:opacity-40 disabled:hover:text-lmu-muted disabled:cursor-not-allowed cursor-pointer'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${selected ? 'text-lmu-text-soft' : ''}`} aria-hidden="true" />
                {metric === 'fuelEnergy' && hasVirtualEnergyData ? 'Fuel & Energy' : label}
              </button>
            );
          })}
        </div>
      </div>

      {activeChartMetric === 'fuelEnergy' && hasFuelData && (
        <SessionFuelStrategyCard selectedDriver={selectedDriver} fuelStrategy={fuelStrategy} />
      )}

      {/* Chart */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={activeChartMetric === 'positions' ? positionChartData : sessionChartData}
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            onClick={handleChartClick}
            className="cursor-pointer"
          >
            <CartesianGrid vertical={false} stroke={LMU_COLORS.border} />
            <XAxis dataKey="lapNum" stroke={LMU_COLORS.muted} fontSize={11} tickLine={false} axisLine={{ stroke: LMU_COLORS.border }} />
            <YAxis
              reversed={activeChartMetric === 'positions'}
              domain={
                activeChartMetric === 'positions'
                  ? [1, maxPosInClass]
                  : activeChartMetric === 'tireWear'
                  ? [0, 100]
                  : activeChartMetric === 'fuelEnergy'
                  ? [0, 100]
                  : ['auto', 'auto']
              }
              stroke={LMU_COLORS.muted}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => {
                if (activeChartMetric === 'positions') return `P${val}`;
                if (activeChartMetric === 'topSpeed') return `${val} km/h`;
                if (activeChartMetric === 'tireWear' || activeChartMetric === 'fuelEnergy') return `${val}%`;
                return formatTime(val);
              }}
            />
            <Tooltip
              // The legend is drawn after the tooltip, so without this it paints over a tall tooltip.
              wrapperStyle={{ zIndex: 20 }}
              content={
                <SessionTelemetryTooltip
                  activeChartMetric={activeChartMetric}
                  driversToPlot={driversToPlot}
                  session={session}
                  selectedDriver={selectedDriver}
                />
              }
            />
            <Legend
              onMouseEnter={(entry: LegendPayload) => {
                if (activeChartMetric === 'positions' && typeof entry.dataKey === 'string') setFocusedSeries(entry.dataKey);
              }}
              onMouseLeave={() => setFocusedSeries(null)}
              itemSorter={legendOrder}
              wrapperStyle={{ paddingTop: 10, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
              formatter={(value, entry: LegendPayload) => {
                const key = typeof entry.dataKey === 'function' ? '' : String(entry.dataKey || '');
                const isHidden = Boolean(hiddenSeries[key]);
                return (
                  <button
                    type="button"
                    onClick={() => handleLegendClick(entry)}
                    aria-pressed={!isHidden}
                    onFocus={() => { if (activeChartMetric === 'positions' && typeof entry.dataKey === 'string') setFocusedSeries(entry.dataKey); }}
                    onBlur={() => setFocusedSeries(null)}
                    className={`inline-flex items-center gap-1 rounded cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent ${
                      isHidden ? 'line-through text-lmu-faint' : 'font-semibold text-lmu-text-soft'
                    }`}
                    title={`Click to toggle ${value} visibility`}
                  >
                    {value}
                  </button>
                );
              }}
            />
            <SessionTelemetrySeries
              activeChartMetric={activeChartMetric}
              driversToPlot={driversToPlot}
              session={session}
              avgLapTime={avgLapTime}
              avgS1={avgS1}
              avgS2={avgS2}
              avgS3={avgS3}
              hasVirtualEnergyData={hasVirtualEnergyData}
              hiddenSeries={hiddenSeries}
              focusedSeries={activeChartMetric === 'positions' ? focusedSeries : null}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
