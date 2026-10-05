import React from 'react';
import { Link } from 'react-router';
import { formatTime } from '../../../shared/domain/formatters.js';
import { PaceBadge, SectorSplitsRow, CarClassBadge } from '../common';
import { CarLogo } from '../vehicle/index.js';
import { PaceCategory } from '../../../shared/types/index.js';
import { TrackCircuitLayout } from '../track-detail/TrackCircuitLayout.js';

export interface TrackSummaryItem {
  trackVenue: string;
  sessionsCount: number;
  totalLaps: number;
  bestLapTime: number | null;
  bestLapDriver: string;
  bestLapCar: string;
  bestLapClass?: string;
  bestLapWet?: boolean;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  carsUsed: string[];
  lastSessionTimestamp?: number;
}

interface TrackSummaryCardProps {
  track: TrackSummaryItem;
  paceInfo: { category: PaceCategory; pct: number } | null;
  onSelectTrack: (trackName: string) => void;
  selectedCarClass: string;
  benchmarkState: 'loading' | 'error' | 'ready';
}

export const TrackSummaryCard: React.FC<TrackSummaryCardProps> = ({
  track: t,
  paceInfo,
  onSelectTrack,
  selectedCarClass,
  benchmarkState,
}) => {
  const hasLap = t.bestLapTime !== null && Number.isFinite(t.bestLapTime) && t.bestLapTime > 0;
  const hasTheoretical = t.theoreticalBest !== null && Number.isFinite(t.theoreticalBest) && t.theoreticalBest > 0;
  const lastDriven = t.lastSessionTimestamp && Number.isFinite(t.lastSessionTimestamp) && t.lastSessionTimestamp > 0
    ? new Date(t.lastSessionTimestamp) : null;
  const validLastDriven = lastDriven && Number.isFinite(lastDriven.getTime()) ? lastDriven : null;
  const suffix = selectedCarClass !== 'All' ? `?carClass=${encodeURIComponent(selectedCarClass)}` : '';
  return (
    <Link
      to={`/track/${encodeURIComponent(t.trackVenue)}${suffix}`}
      aria-label={`View ${t.trackVenue} records`}
      onClick={event => {
        if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          onSelectTrack(t.trackVenue);
        }
      }}
      className="min-w-0 bg-lmu-card border border-lmu-border transition-colors duration-200 hover:bg-lmu-cardHover hover:border-lmu-rule p-5 rounded-2xl cursor-pointer space-y-4 flex flex-col justify-between focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-4"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[128px_minmax(0,1fr)] items-center gap-5">
            <TrackCircuitLayout
              trackName={t.trackVenue}
              size="card"
            />
          <div className="min-w-0 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-lmu-text break-words" dir="auto">
                {t.trackVenue}
              </h3>
              <p className="text-xs text-lmu-muted mt-0.5 break-words">
                {t.sessionsCount} {t.sessionsCount === 1 ? 'Session' : 'Sessions'} • {t.totalLaps} Total Laps
              </p>
              {validLastDriven && (
                <p className="text-[11px] text-lmu-muted mt-1">
                  Last driven <time dateTime={validLastDriven.toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(validLastDriven)}</time>
                </p>
              )}
            </div>

        {/* Best Lap vs Theoretical */}
        {hasLap ? <>
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-4 pt-1">
          <div className="min-w-0 flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-lmu-muted font-semibold uppercase tracking-wider">Personal Best</p>
              <div className="mt-0.5 flex items-center gap-3">
                <h4 className="shrink-0 text-xl font-bold text-lmu-personal-best font-mono">
                  {formatTime(t.bestLapTime)}
                </h4>
                {paceInfo && <PaceBadge category={paceInfo.category} percentage={paceInfo.pct} showPercentage size="xs" />}
              </div>
              {!paceInfo && <p className="text-[11px] text-lmu-muted mt-1.5">
                {benchmarkState === 'loading' ? 'Loading benchmark…' : benchmarkState === 'error' ? 'Benchmark unavailable' : 'No matching benchmark'}
              </p>}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <CarLogo carType={t.bestLapCar} size="xs" />
                <span className="text-[11px] text-lmu-text-soft break-words min-w-0" dir="auto">{t.bestLapCar || 'Car not recorded'}</span>
                {t.bestLapClass && (
                  <CarClassBadge carClass={t.bestLapClass} carType={t.bestLapCar} size="xs" />
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] text-lmu-muted font-semibold uppercase tracking-wider">Theoretical Best</p>
            <h4 className="text-xl font-semibold text-lmu-text-soft font-mono mt-0.5">
              {hasTheoretical ? formatTime(t.theoreticalBest) : 'Unavailable'}
            </h4>
            <p className="text-[11px] text-lmu-muted mt-1">
              {hasTheoretical ? 'Optimal S1 + S2 + S3' : 'Complete sector timings needed'}
            </p>
            {hasTheoretical && t.theoreticalBest !== null && t.bestLapTime !== null && t.theoreticalBest > t.bestLapTime + 0.001 && (
              <p className="text-[11px] text-lmu-warn mt-1">Sector timing differs from the recorded best.</p>
            )}
          </div>
        </div>

        </> : <p className="text-xs text-lmu-muted py-4">
          {t.sessionsCount === 0 ? 'No sessions recorded for this class.' : 'No completed lap time recorded.'}
        </p>}
            {hasLap && <SectorSplitsRow s1={t.bestS1} s2={t.bestS2} s3={t.bestS3} className="grid! grid-cols-3 gap-4 text-left" />}
          </div>
        </div>
      </div>

      {/* Cars driven */}
      {t.carsUsed.length > 0 && (
        <div className="pt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-lmu-border/60">
          {t.carsUsed.slice(0, 4).map(car => (
            <span
              key={car}
              className="text-[11px] text-lmu-muted min-w-0 break-words inline-flex items-center gap-1"
              dir="auto"
            >
              <CarLogo carType={car} size="xs" />
              <span>{car}</span>
            </span>
          ))}
          {t.carsUsed.length > 4 && (
            <span className="text-[11px] text-lmu-muted">
              +{t.carsUsed.length - 4} more
            </span>
          )}
        </div>
      )}
    </Link>
  );
};
