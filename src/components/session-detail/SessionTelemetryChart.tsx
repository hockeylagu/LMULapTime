import React from 'react';
import { Clock, Zap, Gauge, ArrowUpDown, Disc, Fuel, TrendingUp } from 'lucide-react';
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
import { DetailedSession, DriverData, FuelStrategyData } from '../../../server/types.js';
import { formatTime } from '../../utils/formatters.js';
import { SessionFuelStrategyCard } from './SessionFuelStrategyCard.js';
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

  return (
    <div className="glass-panel p-5 rounded-2xl relative space-y-4">
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
            title={hasFuelData ? 'View fuel & energy telemetry' : 'No fuel or energy data available'}
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

      {activeChartMetric === 'fuelEnergy' && hasFuelData && (
        <SessionFuelStrategyCard selectedDriver={selectedDriver} fuelStrategy={fuelStrategy} />
      )}

      {/* Chart */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={activeChartMetric === 'positions' ? positionChartData : sessionChartData}
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.6} />
            <XAxis dataKey="lapNum" stroke="#718096" fontSize={11} tickLine={false} />
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
              stroke="#718096"
              fontSize={11}
              tickLine={false}
              tickFormatter={(val) => {
                if (activeChartMetric === 'positions') return `P${val}`;
                if (activeChartMetric === 'topSpeed') return `${val} km/h`;
                if (activeChartMetric === 'tireWear' || activeChartMetric === 'fuelEnergy') return `${val}%`;
                return formatTime(val);
              }}
            />
            <Tooltip
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
              onClick={handleLegendClick}
              wrapperStyle={{ paddingTop: 10, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
              formatter={(value, entry: LegendPayload) => {
                const key = typeof entry.dataKey === 'function' ? '' : String(entry.dataKey || '');
                const isHidden = Boolean(hiddenSeries[key]);
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
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
