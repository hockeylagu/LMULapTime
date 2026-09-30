import React from 'react';
import { AlertTriangle, Ban, ShieldAlert } from 'lucide-react';
import { DriverData, LapData } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/formatters.js';
import { getWorstTrackLimitSeverity, type TrackLimitSeverity } from '../../../utils/trackLimits.js';

interface StewardsEvent {
  lapNum?: number;
  elapsedSeconds?: number;
  description: string;
}

const eventKey = (event: StewardsEvent) => `${event.elapsedSeconds ?? ''}|${event.description}`;

const TRACK_LIMIT_TEXT: Record<TrackLimitSeverity, string> = {
  cleared: 'text-lmu-text-soft',
  warning: 'text-lmu-warn',
  serious: 'text-lmu-loss',
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The race log's events of the driver that no lap holds (reported before the first lap, or after the last). */
function eventsOffLaps(driver: DriverData): StewardsEvent[] {
  const onLaps = new Set(
    (driver.laps ?? []).flatMap((lap: LapData) => [...(lap.incidents ?? []), ...(lap.trackLimits ?? []), ...(lap.penalties ?? [])].map(eventKey)),
  );
  return [...(driver.incidents ?? []), ...(driver.trackLimits ?? []), ...(driver.penalties ?? [])]
    .filter((event) => !onLaps.has(eventKey(event)))
    .sort((a, b) => (a.elapsedSeconds ?? 0) - (b.elapsedSeconds ?? 0));
}

/**
 * The stewards' tally of the driver under the lap table's heading: incidents, track limits and
 * penalties, with the details on each lap's expanded row. The few events no lap holds are listed here.
 */
export const SessionLapStewardsLine: React.FC<{ driver: DriverData }> = ({ driver }) => {
  const incidents = driver.totalIncidents ?? 0;
  const trackLimits = driver.totalTrackLimits ?? 0;
  const penalties = driver.totalPenalties ?? 0;
  if (incidents + trackLimits + penalties === 0) return null;

  const allTrackLimits = driver.trackLimits?.length ? driver.trackLimits : (driver.laps ?? []).flatMap((lap) => lap.trackLimits ?? []);
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
          <span className={`inline-flex items-center gap-1 font-semibold ${TRACK_LIMIT_TEXT[getWorstTrackLimitSeverity(allTrackLimits)]}`}>
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
        <p key={eventKey(event)} className="text-lmu-muted">
          <span className="text-lmu-text-soft">Not on a lap{event.elapsedSeconds ? ` (${formatElapsedSeconds(event.elapsedSeconds)})` : ''}:</span>{' '}
          {event.description}
        </p>
      ))}
    </div>
  );
};
