import React from 'react';
import { AlertTriangle, Ban, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DriverData } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/formatters.js';
import { getTrackLimitStandingsPillClasses, getWorstTrackLimitSeverity } from '../../../utils/trackLimits.js';

const BADGE = 'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-mono font-medium whitespace-nowrap';

/** Independent safety signals: reported contacts, track-limit severity and issued penalties. */
export const DriverSafetySummary: React.FC<{ driver: DriverData }> = ({ driver: d }) => {
  const incCount = d.totalIncidents ?? d.incidents?.length ?? 0;
  const tlCount = d.totalTrackLimits ?? d.trackLimits?.length ?? 0;
  const penCount = d.totalPenalties ?? d.penalties?.length ?? 0;
  const tooltip = [
    `Driver: ${d.name}`,
    `- Contacts / Incidents: ${incCount}x`,
    `- Track Limits Warnings: ${tlCount}`,
    `- Penalties: ${penCount}`,
    ...(d.penalties && d.penalties.length > 0
      ? [
          '',
          'Penalties:',
          ...d.penalties.map((p) => {
            const lapLabel = p.lapNum
              ? `Lap ${p.lapNum}`
              : p.elapsedSeconds
              ? formatElapsedSeconds(p.elapsedSeconds)
              : '';
            return `  - ${lapLabel ? `${lapLabel}: ` : ''}${p.penalty} (${p.reason})`;
          }),
        ]
      : []),
    ...(d.incidents && d.incidents.length > 0
      ? [
          '',
          'Incidents:',
          ...d.incidents.slice(0, 8).map((inc) => {
            const lapLabel = inc.lapNum
              ? `Lap ${inc.lapNum}`
              : inc.elapsedSeconds
              ? formatElapsedSeconds(inc.elapsedSeconds)
              : 'Lap ?';
            const desc = inc.description || (inc.otherVehicle
              ? `Contact with ${inc.otherVehicle}`
              : inc.type === 'contact'
              ? 'Contact with barrier'
              : inc.type || 'Incident');
            return `  - ${lapLabel}: ${desc}`;
          }),
          ...(d.incidents.length > 8 ? [`  ...and ${d.incidents.length - 8} more`] : []),
        ]
      : []),
    ...(d.trackLimits && d.trackLimits.length > 0
      ? [
          '',
          'Track Limits:',
          ...d.trackLimits.slice(0, 6).map((tl) => {
            const lapLabel = tl.lapNum
              ? `Lap ${tl.lapNum}`
              : tl.elapsedSeconds
              ? formatElapsedSeconds(tl.elapsedSeconds)
              : 'Warning';
            return `  - ${lapLabel}: ${tl.description}`;
          }),
          ...(d.trackLimits.length > 6 ? [`  ...and ${d.trackLimits.length - 6} more`] : []),
        ]
      : []),
  ].join('\n');

  if (incCount === 0 && penCount === 0 && tlCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-lmu-gain-soft cursor-help" title={tooltip}>
        <ShieldCheck className="w-3.5 h-3.5 text-lmu-gain" aria-hidden="true" />
        Clean
      </span>
    );
  }

  const allTls = d.trackLimits?.length ? d.trackLimits : d.laps.flatMap(lap => lap.trackLimits || []);
  const tlSeverity = getWorstTrackLimitSeverity(allTls);

  return (
    <span className="inline-flex items-center justify-start gap-1.5 cursor-help" title={tooltip}>
      {incCount > 0 && (
        <span role="img" aria-label={`${incCount} contacts / incidents`}
          className={`${BADGE} bg-lmu-warn-strong/10 text-lmu-warn-soft border-lmu-warn-strong/25`}>
          <ShieldAlert className="w-3 h-3" aria-hidden="true" />
          <span aria-hidden="true">{incCount}×</span>
        </span>
      )}
      {tlCount > 0 && (
        <span role="img" aria-label={`${tlCount} track limits, ${tlSeverity}`}
          className={`${BADGE} ${getTrackLimitStandingsPillClasses(tlSeverity)}`}>
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          <span aria-hidden="true">{tlCount} TL</span>
        </span>
      )}
      {penCount > 0 && (
        <span role="img" aria-label={`${penCount} ${penCount === 1 ? 'penalty' : 'penalties'}`}
          className={`${BADGE} bg-lmu-loss-strong/15 text-lmu-loss-soft border-lmu-loss-strong/40`}>
          <Ban className="w-3 h-3" aria-hidden="true" />
          <span aria-hidden="true">{penCount} Pen</span>
        </span>
      )}
    </span>
  );
};
