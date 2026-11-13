import React, { useMemo } from 'react';
import type { RaceReplayCar, RaceReplayEvent } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/formatters.js';
import { Select } from '../../common/dropdown/Select.js';
import { incidentsOf, incidentText } from './raceEventText.js';

/** A pick lands this long before the incident, so it plays in. */
export const INCIDENT_LEAD_IN_SEC = 3;

interface Props {
  events: RaceReplayEvent[];
  cars: ReadonlyMap<number, RaceReplayCar>;
  followSlot: number | null;
  startSec: number;
  onSeek: (timeSec: number) => void;
}

/** The followed car's incidents (what, who, when); picking one jumps to just before it. */
export const RaceIncidentSelect: React.FC<Props> = ({ events, cars, followSlot, startSec, onSeek }) => {
  const incidents = useMemo(() => incidentsOf(events, followSlot), [events, followSlot]);
  const options = useMemo(() => followSlot === null ? [] : incidents.map((event, i) => {
    const { what, who } = incidentText(event, followSlot, cars);
    return { value: i, text: `${what} ${who}`, detail: formatElapsedSeconds(event.timeSec - startSec),
      label: <span className="flex min-w-0 gap-1.5"><span className="shrink-0 text-lmu-text">{what}</span><span className="truncate text-lmu-muted">{who}</span></span> };
  }), [incidents, followSlot, cars, startSec]);
  return (
    <Select<number> aria-label="Incidents of the followed car" value={null} size="compact" align="end"
      className="w-40" panelClassName="w-80" disabled={!options.length} options={options}
      placeholder={options.length ? `Incidents (${options.length})` : 'No incidents'}
      onChange={i => onSeek(Math.max(startSec, incidents[i].timeSec - INCIDENT_LEAD_IN_SEC))} />
  );
};
