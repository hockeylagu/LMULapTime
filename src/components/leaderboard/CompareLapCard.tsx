import React from 'react';
import { Target, Trash2 } from 'lucide-react';
import { computeLapDeltas } from '../../../shared/domain/lapComparison.js';
import { ReferenceLaptimeEntry, ComparableLap } from '../../../shared/types/index.js';
import { formatTime } from '../../../shared/domain/formatters.js';
import { matchesCarClass, getPaceCategoryFromPercentage } from '../../../shared/domain/paceCategory.js';
import { PaceBadge, LapStatusBadge } from '../common';
import { CarClassBadge } from '../common/CarClassBadge.js';

export interface CompareLapCardProps {
  lap: ComparableLap;
  isBaseline: boolean;
  /** The lap is the player's rival's best. */
  isRival?: boolean;
  deltas: ReturnType<typeof computeLapDeltas> | null;
  color: string;
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
  isRival = false,
  deltas,
  color,
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

  const hasStatus = lap.isPitStop || lap.isOutLap || lap.isInferred || !lap.isValid;

  return (
    <div
      data-testid={isBaseline ? 'compare-baseline' : undefined}
      className="p-4 rounded-2xl border transition-all relative flex flex-col justify-between bg-lmu-card/50 border-lmu-border hover:border-lmu-border/80"
    >
      {/* Card Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span
              className={`text-xs font-bold uppercase tracking-wider truncate ${
                lap.isAllTimePB ? 'text-lmu-gold' : lap.isSessionBest ? 'text-lmu-blue' : 'text-white'
              }`}
            >
              {lap.tag || `Lap ${lap.lapNum || '-'}`}
            </span>
            {isRival && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-lmu-warn-soft shrink-0">
                <Target className="w-3 h-3" /> Your rival
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isBaseline ? (
              <span
                className="text-[10px] uppercase tracking-wider text-lmu-gold font-semibold px-1.5 py-0.5"
                title="The other laps' deltas are measured against this one"
              >
                Baseline
              </span>
            ) : (
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
              className="text-lmu-muted hover:text-lmu-loss p-0.5 rounded transition-colors cursor-pointer"
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
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span className="text-xs font-medium text-white truncate" title={lap.carType}>
              {lap.carType}
            </span>
            {lap.carClass && (
              <CarClassBadge carClass={lap.carClass} carType={lap.carType} size="xs" />
            )}
          </div>
          {lap.sessionName && (
            <p className="text-[11px] text-lmu-muted truncate mt-0.5">
              {lap.sessionName} ({lap.sessionType || 'P'})
            </p>
          )}
          <div className="flex items-baseline gap-2 mt-0.5">
            <h4
              className={`text-2xl font-extrabold font-mono ${
                lap.isAllTimePB ? 'text-lmu-gold' : lap.isSessionBest ? 'text-lmu-blue' : 'text-white'
              }`}
            >
              {lap.lapTimeString}
            </h4>
            {deltas && !isBaseline && deltas.lapTimeDelta !== null && (
              <span className={`text-sm font-mono ${deltas.lapTimeDeltaClass}`} data-testid="lap-time-delta">
                {deltas.lapTimeDeltaFormatted}
              </span>
            )}
          </div>

          {(cat || hasStatus) && (
            <div className="mt-1 flex items-center gap-1.5">
              {cat && (
                <PaceBadge
                  category={cat}
                  percentage={pct}
                  showPercentage={true}
                  size="xs"
                />
              )}
              {hasStatus && (
                <LapStatusBadge
                  isPitStop={lap.isPitStop}
                  isOutLap={lap.isOutLap}
                  isValid={lap.isValid}
                  isInferred={lap.isInferred}
                  pitTooltip={lap.pitStopDurationString ? `Estimated pit loss: ${lap.pitStopDurationString}` : undefined}
                  size="xs"
                />
              )}
            </div>
          )}
        </div>

        {/* Sector Breakdown */}
        <div className="mt-3 space-y-2 text-xs font-mono">
          {([
            { label: 'S1', time: lap.s1String || formatTime(lap.s1), delta: deltas?.s1DeltaFormatted, cls: deltas?.s1DeltaClass },
            { label: 'S2', time: lap.s2String || formatTime(lap.s2), delta: deltas?.s2DeltaFormatted, cls: deltas?.s2DeltaClass },
            { label: 'S3', time: lap.s3String || formatTime(lap.s3), delta: deltas?.s3DeltaFormatted, cls: deltas?.s3DeltaClass },
          ]).map((sector) => (
            <div key={sector.label} className="flex items-center justify-between p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
              <span className="text-white font-sans font-semibold">{sector.label}</span>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-white">{sector.time}</span>
                {deltas && !isBaseline && (
                  <span className={`text-[11px] font-bold ${sector.cls}`}>{sector.delta}</span>
                )}
              </div>
            </div>
          ))}
        </div>
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
