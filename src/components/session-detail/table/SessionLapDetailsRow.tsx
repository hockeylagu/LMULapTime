import React from 'react';
import { ArrowDownRight, ArrowUpRight, Ban, Car, CloudRain, Flag, Shield, ShieldAlert, Swords, Wrench, type LucideIcon } from 'lucide-react';
import type { LapData } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/formatters.js';
import { getTrackLimitSeverity } from '../../../utils/trackLimits.js';
import type { LapDetailSection } from './lapDetailSections.js';

export interface SessionLapDetailsRowProps {
  lapNum: number;
  lap?: LapData;
  sections: LapDetailSection[];
  columnCount: number;
}

const NEUTRAL = 'text-lmu-text-soft';
const WARN = 'text-lmu-warn-soft';
const LOSS = 'text-lmu-loss-soft';
const GAIN = 'text-lmu-gain-soft';

function sectionStyle(label: string): { Icon: LucideIcon; color: string } {
  switch (label) {
    case 'Position gained': return { Icon: ArrowUpRight, color: GAIN };
    case 'Position lost': return { Icon: ArrowDownRight, color: LOSS };
    case 'Around you': return { Icon: Swords, color: 'text-lmu-muted' };
    case 'Incidents': return { Icon: ShieldAlert, color: WARN };
    case 'Track limits': return { Icon: Flag, color: NEUTRAL };
    case 'Penalties': return { Icon: Ban, color: LOSS };
    case 'Pit stop': return { Icon: Wrench, color: 'text-lmu-muted' };
    case 'Conditions': return { Icon: CloudRain, color: 'text-lmu-muted' };
    default: return { Icon: Flag, color: NEUTRAL };
  }
}

/** Recorded event times only. A missing lap start keeps the original session clock. */
export function lapEventTime(lap: LapData | undefined, elapsed: number | undefined): string | undefined {
  if (elapsed === undefined || !Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const start = lap?.elapsedSeconds;
  const relative = start !== undefined && start !== null ? elapsed - start : undefined;
  if (relative !== undefined && relative >= 0 && lap?.lapTime != null && relative <= lap.lapTime) {
    return `Lap +${formatElapsedSeconds(relative)}`;
  }
  return `Session ${formatElapsedSeconds(elapsed)}`;
}

function eventElapsed(lap: LapData | undefined, label: string, index: number): number | undefined {
  if (label === 'Incidents') return lap?.incidents?.[index]?.elapsedSeconds;
  if (label === 'Track limits') return lap?.trackLimits?.[index]?.elapsedSeconds;
  if (label === 'Penalties') return lap?.penalties?.[index]?.elapsedSeconds;
  return undefined;
}

const DetailLine: React.FC<{ line: string; section: string; lap?: LapData; index: number }> = ({ line, section, lap, index }) => {
  const colon = line.indexOf(': ');
  const prefix = colon < 0 ? undefined : line.slice(0, colon);
  let { color } = sectionStyle(section);
  let Icon: LucideIcon | undefined;
  if (section === 'Around you') {
    color = 'text-lmu-muted';
    if (prefix === 'Attacking') Icon = ArrowUpRight;
    else if (prefix === 'Defending') Icon = Shield;
    else Icon = Car;
  }
  if (section === 'Track limits' && lap?.trackLimits?.[index]) {
    const severity = getTrackLimitSeverity(lap.trackLimits[index]);
    color = severity === 'serious' ? LOSS : severity === 'warning' ? WARN : NEUTRAL;
    if (severity !== 'cleared') Icon = Flag;
  }
  const time = lapEventTime(lap, eventElapsed(lap, section, index));
  return (
    <div className="flex items-start gap-2.5">
      {Icon && <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />}
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
        <p className={`max-w-[72ch] text-[13px] leading-5 ${section === 'Position gained' ? GAIN : NEUTRAL}`}>
          {prefix ? <><span className="font-semibold">{prefix}:</span>{line.slice(colon + 1)}</> : line}
        </p>
        {time && <p className="shrink-0 font-mono text-[11px] leading-4 tabular-nums text-lmu-muted">{time}</p>}
      </div>
    </div>
  );
};

/** A quiet lap debrief: neutral prose, small severity cues, and emphasis on places gained. */
export const SessionLapDetailsRow: React.FC<SessionLapDetailsRowProps> = ({ lapNum, lap, sections, columnCount }) => {
  const context = sections.filter(section => section.label === 'Left out of average' || section.label === 'Conditions');
  const events = sections.filter(section => !context.includes(section));
  const priority = (label: string) => label.startsWith('Position ') ? 0 : label === 'Pit stop' ? 1 : 2;
  const orderedEvents = [...events].sort((a, b) => priority(a.label) - priority(b.label));
  const compact = events.length === 1;
  return (
  <tr className="bg-lmu-bg/60" data-testid={`lap-details-${lapNum}`}>
    <td colSpan={columnCount} className="px-6 py-4 pl-10">
      <dl aria-label={`What happened on lap ${lapNum}`} className="grid max-w-[1200px] grid-cols-2 gap-x-12 gap-y-4 font-sans">
        {orderedEvents.map((section) => {
          const { Icon, color } = sectionStyle(section.label);
          return (
            <div key={section.label} className={compact ? 'col-span-2 grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-x-4' : 'min-w-0'}>
              <dt className={`${compact ? '' : 'mb-1.5'} flex items-center gap-2 text-xs font-semibold ${section.label === 'Position gained' ? GAIN : NEUTRAL}`}>
                <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
                {section.label}
              </dt>
              <dd className={`space-y-1.5 ${compact ? '' : 'pl-6'}`}>
                {section.lines.map((line, index) => <DetailLine key={`${index}-${line}`} line={line} section={section.label} lap={lap} index={index} />)}
              </dd>
            </div>
          );
        })}
        {context.length > 0 && (
          <div className={`col-span-2 space-y-1.5 ${events.length > 0 ? 'border-t border-lmu-border/60 pt-3' : ''}`}>
            {context.map(section => (
              <div key={section.label} className="flex items-baseline gap-4 text-xs leading-5 text-lmu-muted">
                <dt className="w-40 shrink-0 font-medium">{section.label}</dt>
                <dd className="max-w-[90ch]">{section.lines.join(' · ')}</dd>
              </div>
            ))}
          </div>
        )}
      </dl>
    </td>
  </tr>
  );
};
