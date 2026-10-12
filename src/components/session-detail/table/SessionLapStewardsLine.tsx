import React from 'react';
import { AlertTriangle, Ban, ShieldAlert } from 'lucide-react';
import { DriverData } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/formatters.js';
import { getWorstTrackLimitSeverity, type TrackLimitSeverity } from '../../../utils/trackLimits.js';

interface StewardsEvent {
  lapNumber?: number;
  elapsedSeconds?: number;
  description: string;
}

const TRACK_LIMIT_TEXT: Record<TrackLimitSeverity, string> = {
  cleared: 'text-lmu-text-soft',
  warning: 'text-lmu-warn',
  serious: 'text-lmu-loss',
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The race log's events of the driver that no lap holds (reported before the first lap, or after the last). */
function eventsOffLaps(driver: DriverData): StewardsEvent[] {
  const lapNumbers = new Set(driver.laps.map((lap) => lap.lapNumber));
  return [...(driver.incidents ?? []), ...(driver.trackLimits ?? []), ...(driver.penalties ?? [])]
    .filter((event) => event.lapNumber === undefined || !lapNumbers.has(event.lapNumber))
    .sort((a, b) => (a.elapsedSeconds ?? 0) - (b.elapsedSeconds ?? 0));
}

/**
 * The stewards' tally of the driver under the lap table's heading: incidents, track limits and
 * penalties, with the details on each lap's expanded row. The few events no lap holds are listed here.
 */
export const SessionLapStewardsLine: React.FC<{ driver: DriverData }> = ({ driver }) => {
  const incidents = driver.incidents?.length ?? 0;
  const trackLimits = driver.trackLimits?.length ?? 0;
  const penalties = driver.penalties?.length ?? 0;
  if (incidents + trackLimits + penalties === 0) return null;

  const offLaps = eventsOffLaps(driver);

  return (
    <div className="space-y-0.5 text-xs" data-testid="lap-stewards-line">
      <p className="flex items-center gap-3 flex-wrap">
        {incidents > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-lmu-loss">
            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            {plural(incidents, 'incident', 'incidents')}
          </span>
        )}
        {trackLimits > 0 && (
          <span className={`inline-flex items-center gap-1 font-semibold ${TRACK_LIMIT_TEXT[getWorstTrackLimitSeverity(driver.trackLimits)]}`}>
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            {plural(trackLimits, 'track limit', 'track limits')}
          </span>
        )}
        {penalties > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-lmu-loss">
            <Ban className="w-3.5 h-3.5" aria-hidden="true" />
            {plural(penalties, 'penalty', 'penalties')}
          </span>
        )}
      </p>
      {offLaps.map((event) => (
        <p key={`${event.elapsedSeconds ?? ''}|${event.description}`} className="text-lmu-muted">
          <span className="text-lmu-text-soft">Not on a lap{event.elapsedSeconds ? ` (${formatElapsedSeconds(event.elapsedSeconds)})` : ''}:</span>{' '}
          {event.description}
        </p>
      ))}
    </div>
  );
};
