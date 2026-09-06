import React from 'react';
import { Trash2 } from 'lucide-react';
import { ComparableLap, computeLapDeltas } from '../../utils/lapComparison';
import { ReferenceLaptimeEntry } from '../../../server/types';
import { formatTime } from '../../utils/formatters';
import { matchesCarClass, getPaceCategoryFromPercentage } from '../../utils/paceCategory';
import { PaceBadge } from '../common';

export interface CompareLapCardProps {
  lap: ComparableLap;
  isBaseline: boolean;
  deltas: ReturnType<typeof computeLapDeltas> | null;
  color: string;
  isCardS1Best: boolean;
  isCardS2Best: boolean;
  isCardS3Best: boolean;
  onSetBaseline: (id: string) => void;
  onRemoveLap: (lap: ComparableLap) => void;
  onSelectSession?: (sessionId: string) => void;
  benchmarks: ReferenceLaptimeEntry[];
  allLaps: ComparableLap[];
  selectedCarClass: string;
}

export const CompareLapCard: React.FC<CompareLapCardProps> = ({
  lap,
  isBaseline,
  deltas,
  color,
  isCardS1Best,
  isCardS2Best,
  isCardS3Best,
  onSetBaseline,
  onRemoveLap,
  onSelectSession,
  benchmarks,
  allLaps,
  selectedCarClass,
}) => {
  let cat = lap.paceCategory;
  let pct = lap.pacePercentage;

  if (!cat && lap.lapTime && lap.lapTime > 0) {
    const matchingRef =
      benchmarks.find((b) => matchesCarClass(b.carClass, '', selectedCarClass)) || benchmarks[0];

    if (matchingRef?.target100Sec) {
      pct = parseFloat(((lap.lapTime / matchingRef.target100Sec) * 100).toFixed(2));
      cat = getPaceCategoryFromPercentage(pct);
    } else {
      const sampleLap = allLaps.find((l) => l.isValid && l.lapTime && l.pacePercentage);
      if (sampleLap?.lapTime && sampleLap.pacePercentage) {
        const target100 = sampleLap.lapTime / (sampleLap.pacePercentage / 100);
        pct = parseFloat(((lap.lapTime / target100) * 100).toFixed(2));
        cat = getPaceCategoryFromPercentage(pct);
      }
    }
  }

  return (
    <div
      className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
        isBaseline
          ? 'bg-lmu-card/90 border-lmu-accent shadow-lg shadow-lmu-accent/10'
          : 'bg-lmu-card/50 border-lmu-border hover:border-lmu-border/80'
      }`}
    >
      {/* Card Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
            <span
              className={`text-xs font-bold uppercase tracking-wider truncate ${
                lap.isAllTimePB ? 'text-lmu-gold' : lap.isSessionBest ? 'text-lmu-blue' : 'text-white'
              }`}
            >
              {lap.tag || `Lap ${lap.lapNum || '-'}`}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isBaseline && (
              <button
                type="button"
                onClick={() => onSetBaseline(lap.id)}
                className="text-[10px] text-lmu-muted hover:text-lmu-gold font-semibold transition-colors px-1.5 py-0.5 rounded hover:bg-lmu-bg cursor-pointer"
                title="Set as baseline for deltas"
              >
                Set Baseline
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemoveLap(lap)}
              className="text-lmu-muted hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
              title="Remove from comparison"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Driver & Car Info */}
        <div className="mt-3">
          <p className="text-xs text-lmu-muted truncate" title={lap.driverName}>
            {lap.driverName}
          </p>
          <p className="text-xs font-medium text-white truncate" title={lap.carType}>
            {lap.carType}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-lmu-muted mt-0.5">
            <span className="px-1.5 py-0.2 bg-lmu-bg rounded text-[10px] font-semibold text-lmu-cyan border border-lmu-border">
              {lap.carClass}
            </span>
            {lap.sessionName && (
              <span className="truncate">
                {lap.sessionName} ({lap.sessionType || 'P'})
              </span>
            )}
          </div>
          <h4
            className={`text-2xl font-extrabold font-mono mt-0.5 ${
              lap.isAllTimePB ? 'text-lmu-gold' : lap.isSessionBest ? 'text-lmu-blue' : 'text-white'
            }`}
          >
            {lap.lapTimeString}
          </h4>

          {cat && (
            <div className="mt-1 flex items-center gap-1.5">
              <PaceBadge
                category={cat}
                percentage={pct}
                showPercentage={true}
                size="xs"
              />
            </div>
          )}
        </div>

        {/* Sector Breakdown */}
        <div className="mt-3 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
            <span className="text-lmu-gold font-sans font-semibold">S1</span>
            <div className="flex items-baseline gap-2">
              <span className={`font-bold ${isCardS1Best ? 'text-lmu-gold' : 'text-white'}`}>
                {lap.s1String || formatTime(lap.s1)}
              </span>
              {deltas && !isBaseline && (
                <span className={`text-[11px] font-bold ${deltas.s1DeltaClass}`}>{deltas.s1DeltaFormatted}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
            <span className="text-lmu-blue font-sans font-semibold">S2</span>
            <div className="flex items-baseline gap-2">
              <span className={`font-bold ${isCardS2Best ? 'text-lmu-blue' : 'text-white'}`}>
                {lap.s2String || formatTime(lap.s2)}
              </span>
              {deltas && !isBaseline && (
                <span className={`text-[11px] font-bold ${deltas.s2DeltaClass}`}>{deltas.s2DeltaFormatted}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
            <span className="text-lmu-green font-sans font-semibold">S3</span>
            <div className="flex items-baseline gap-2">
              <span className={`font-bold ${isCardS3Best ? 'text-lmu-green' : 'text-white'}`}>
                {lap.s3String || formatTime(lap.s3)}
              </span>
              {deltas && !isBaseline && (
                <span className={`text-[11px] font-bold ${deltas.s3DeltaClass}`}>{deltas.s3DeltaFormatted}</span>
              )}
            </div>
          </div>
        </div>

        {/* Top Speed & Tires */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
            <span className="text-[10px] uppercase text-lmu-muted font-sans block">Top Speed</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-bold text-lmu-cyan font-mono">
                {lap.topSpeed ? `${lap.topSpeed.toFixed(1)} km/h` : 'N/A'}
              </span>
            </div>
            {deltas && !isBaseline && deltas.speedDelta !== null && (
              <span className={`text-[10px] font-bold font-mono ${deltas.speedDeltaClass}`}>
                {deltas.speedDeltaFormatted}
              </span>
            )}
          </div>

          <div className="p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
            <span className="text-[10px] uppercase text-lmu-muted font-sans block">Tires & Wear</span>
            <span className="text-xs text-white font-medium block truncate mt-0.5">
              {lap.fCompound || lap.rCompound ? `${lap.fCompound || lap.rCompound}` : 'Standard'}
            </span>
            {lap.tireWear ? (
              <span
                className="text-[10px] text-lmu-gold font-mono font-bold block"
                title={`FL: ${lap.tireWear.fl}% | FR: ${lap.tireWear.fr}%\nRL: ${lap.tireWear.rl}% | RR: ${lap.tireWear.rr}%`}
              >
                Wear: {lap.tireWear.avg}% avg
              </span>
            ) : (
              <span className="text-[10px] text-lmu-muted">
                {lap.isPitStop ? '🛑 Pit Stop' : lap.isValid ? '✓ Valid Lap' : '⚠️ Incomplete'}
              </span>
            )}
          </div>
        </div>

        {/* Fuel & Virtual Energy */}
        {((lap.fuel !== undefined && lap.fuel !== null) ||
          (lap.virtualEnergy !== undefined && lap.virtualEnergy !== null)) && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
            {lap.fuel !== undefined && lap.fuel !== null && (
              <div className="p-1.5 rounded-lg bg-lmu-bg/30 border border-lmu-border/30 flex items-center justify-between text-[11px]">
                <span className="text-lmu-muted font-sans">⛽ Fuel:</span>
                <span className="text-amber-300 font-bold">
                  {lap.fuel}% {lap.fuelUsed ? `(-${lap.fuelUsed}%)` : ''}
                </span>
              </div>
            )}
            {lap.virtualEnergy !== undefined && lap.virtualEnergy !== null && (
              <div className="p-1.5 rounded-lg bg-lmu-bg/30 border border-lmu-border/30 flex items-center justify-between text-[11px]">
                <span className="text-lmu-muted font-sans">⚡ VE:</span>
                <span className="text-indigo-300 font-bold">
                  {lap.virtualEnergy}% {lap.virtualEnergyUsed ? `(-${lap.virtualEnergyUsed}%)` : ''}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Open Session Link */}
      {lap.sessionId && onSelectSession && (
        <div className="mt-3 pt-2 border-t border-lmu-border/40 text-right">
          <button
            type="button"
            onClick={() => onSelectSession(lap.sessionId!)}
            className="text-[11px] text-lmu-muted hover:text-lmu-gold transition-colors font-medium cursor-pointer"
          >
            View Full Session →
          </button>
        </div>
      )}
    </div>
  );
};
