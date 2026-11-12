import React from 'react';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { lapClassPositions } from '../../../../shared/domain/lapPlaces.js';
import { SummaryStat } from '../overview/SummaryStat.js';

export interface DriverRaceStandingsRowProps {
  session: DetailedSession;
  selectedDriver: DriverData;
  isMultiClass: boolean;
}

const Overall: React.FC<{ position?: number | null; title: string }> = ({ position, title }) =>
  position ? <span className="text-[11px] leading-4 font-normal text-lmu-muted" title={title}>Overall P{position}</span> : null;

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/**
 * The race result of the selected driver, set on the summary's columns: the finish under the best lap,
 * six figures under the pace figures. Color only where it means something: gold for P1 and laps led,
 * gain and loss for places, loss for incidents and penalties, warn for track limits.
 */
export const DriverRaceStandingsRow: React.FC<DriverRaceStandingsRowProps> = ({ session, selectedDriver: d, isMultiClass }) => {
  const byClass = isMultiClass && Boolean(d.classPosition && d.classPosition > 0);
  const finish = byClass ? d.classPosition : d.position;
  const grid = isMultiClass && d.classGridPosition ? d.classGridPosition : d.gridPosition;
  const delta =
    isMultiClass && d.classGridPosition && d.classPosition ? d.classGridPosition - d.classPosition : d.positionGain;
  const incidents = d.incidents?.length ?? 0;
  const penalties = d.penalties?.length ?? 0;
  const trackLimits = d.trackLimits?.length ?? 0;
  // Most track limit events end in "No Further Action"; only a warning adds points.
  const warnings = d.trackLimits?.filter(limit => limit.action === 'Warning').length ?? 0;
  // Peak and laps led follow the finish: in a multiclass race they count the cars of the class only.
  const classRun = React.useMemo(() => {
    if (!byClass) return null;
    const lapPlaces = [...lapClassPositions(session, d, true).values()].filter(place => place > 0);
    const places = [...lapPlaces, d.classPosition, ...(d.classGridPosition ? [d.classGridPosition] : [])];
    return { peak: Math.min(...places), lapsLed: lapPlaces.filter(place => place === 1).length };
  }, [byClass, session, d]);
  const peak = classRun ? classRun.peak : d.highestPosition;
  const lapsLed = classRun ? classRun.lapsLed : d.lapsLedCount ?? 0;

  return (
    <div className="col-span-2 grid grid-cols-[240px_minmax(0,1fr)] gap-x-6 border-t border-lmu-border/50 pt-3">
      <SummaryStat
        label={byClass ? 'Class finish' : 'Finish'}
        value={finish ? <span className="inline-flex items-baseline gap-2.5"><span className="text-2xl leading-tight font-extrabold">P{finish}</span>{byClass && <Overall position={d.position} title="Overall finish position" />}</span> : '-'}
        valueClass={finish === 1 ? 'text-lmu-gold' : 'text-white'}
        title={grid ? `Started P${grid}${isMultiClass ? ' in class' : ''}` : undefined}
      />
      <div className="grid grid-cols-6 gap-4">
        <SummaryStat
          label={isMultiClass ? 'Class places' : 'Places'}
          value={delta !== null && delta !== undefined ? signed(delta) : '-'}
          valueClass={(delta ?? 0) > 0 ? 'text-lmu-gain' : (delta ?? 0) < 0 ? 'text-lmu-loss' : 'text-white'}
          hint="grid to finish"
        />
        <SummaryStat label="Peak" value={peak ? `P${peak}` : '-'} hint={byClass ? 'best in class' : 'best position'} />
        <SummaryStat label="Laps led" value={lapsLed} valueClass={lapsLed > 0 ? 'text-lmu-gold' : 'text-white'} />
        <SummaryStat label="Pit stops" value={d.declaredPitStopsCount ?? 0} />
        <SummaryStat
          label="Incidents"
          value={incidents}
          valueClass={incidents > 0 ? 'text-lmu-loss' : 'text-white'}
          hint={penalties > 0 ? <span className="text-lmu-loss">{penalties} {penalties === 1 ? 'penalty' : 'penalties'}</span> : 'no penalty'}
          title={`Contacts reported by the race log: ${incidents}\nPenalties: ${penalties}`}
        />
        <SummaryStat
          label="Track limits"
          value={trackLimits}
          valueClass={trackLimits > 0 ? 'text-lmu-warn' : 'text-white'}
          hint={`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`}
          title={`Track limit events from the race log: ${trackLimits}\nWarnings: ${warnings}`}
        />
      </div>
    </div>
  );
};
