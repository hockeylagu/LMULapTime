import type { LiveDeployment } from '../../../../shared/types/liveStrategy.js';
import type { PlanReadout } from './raceAction.js';

/**
 * The deployment cell: the adjustment to make now, the setting change, the battery and the time until its lap average
 * reaches the range edge.
 * Hold reads as a word (a big "0 kW" looks like zero deployment). Values are in the unit the car's settings come in:
 * kW with a plugin list, else the game's map position.
 */
/** Minutes and seconds; an hour or more reads as `60:00+`, too far to matter. */
function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return whole >= 3600 ? '60:00+' : `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function deploymentReadout(deployment: LiveDeployment): PlanReadout {
  const kw = deployment.unit === 'kW';
  const label = (setting: number) => kw ? `${setting} kW` : `MAP ${setting}`;
  const { current, target, settlingLaps, next, changeSeconds, chargePercent: charge, edge, edgeSeconds } = deployment;
  const adjustment = current !== null && target !== null ? target - current : null;
  const trend = settlingLaps > 0 ? `CHECK IN ${settlingLaps} LAP${settlingLaps === 1 ? '' : 'S'}`
    : edge === null || edgeSeconds === null ? 'MEASURING' : `${edge}% ${edgeSeconds > 0 ? `IN ${clock(edgeSeconds)}` : 'NOW'}`;
  const hold = adjustment === 0;
  return {
    label: 'DEPLOYMENT', value: adjustment === null ? '—' : hold ? 'HOLD' : `${adjustment > 0 ? '+' : ''}${adjustment}`,
    unit: adjustment === null || hold ? undefined : kw ? 'kW' : 'MAP', tone: adjustment === null || settlingLaps > 0 ? 'muted' : hold ? 'gain' : 'warn',
    note: current === null ? 'NO BATTERY DATA'
      : target === null ? `CURRENT ${label(current)}`
        : settlingLaps > 0 ? `${label(target)} SET`
          : hold ? (next !== null && changeSeconds !== null ? `${label(next)} IN ${clock(changeSeconds)}` : `AT ${label(target)}`)
            : kw ? `${current} → ${target} kW` : `MAP ${current} → ${target}`,
    detail: charge === null ? undefined : `BATT ${Math.round(charge)}% · ${trend}`,
    detailTone: 'muted',
  };
}
