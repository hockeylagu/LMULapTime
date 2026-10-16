import type { LiveSnapshot } from '../../../../shared/types/live.js';
import type { LiveForecast, LivePitInfo, LiveResourcePlan, LiveTyres } from '../../../../shared/types/liveStrategy.js';
import { UNKNOWN } from '../liveFormat.js';
import {
  CORNER_NAMES, formatAmount, formatPerLap, formatSecondsRange, formatSignedPerLap, isWetTyre, resourceName, tyreCallText,
} from './livePlanFormat.js';

export type PlanTone = 'gain' | 'loss' | 'warn' | 'wet' | 'muted' | null;

export interface PlanReadout {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: PlanTone;
  noteTone?: PlanTone;
}

/** Which advice leads; the place of every readout stays the same in each. */
export type RaceMode = 'calculating' | 'pit-now' | 'in-pit' | 'pit' | 'stint' | 'sprint';

export interface RacePlanView {
  mode: RaceMode;
  action: PlanReadout;
  /** Always three, so the row never reflows. */
  cells: [PlanReadout, PlanReadout, PlanReadout];
}

/** The pit countdown leads from this many laps out; before that the per-lap use leads (mid-stint). */
export const PIT_LEAD_LAPS = 2;

/** `RAIN ~LAP 20 · 60%`, `RAIN ENDS ~LAP 25`: the forecast explains, it never recommends. */
export function forecastText(forecast: LiveForecast): string {
  const lap = forecast.lap !== null ? `~LAP ${forecast.lap}` : null;
  return forecast.change === 'rain'
    ? ['RAIN', lap, `${forecast.chance}%`].filter(Boolean).join(' · ').replace('RAIN · ', 'RAIN ')
    : ['RAIN ENDS', lap].filter(Boolean).join(' ');
}

const lapsUnit = (laps: number): string => (laps === 1 ? 'LAP' : 'LAPS');
const marginTone = (value: number | null): PlanTone => (value === null ? null : value < 0 ? 'loss' : 'gain');

function tyresCell(tyres: LiveTyres | null): PlanReadout {
  const worst = tyres?.worst ?? null;
  const wear = tyres?.wearPerLap ?? null;
  return {
    label: tyres?.compound ? `TYRES · ${tyres.compound.toUpperCase()}` : 'TYRES',
    value: worst === null ? UNKNOWN : `${Math.round(worst * 100)}`,
    unit: worst === null ? undefined : '%',
    note: wear !== null ? `${(wear * 100).toFixed(1)}% / LAP` : tyres?.newSets != null ? `${tyres.newSets} NEW SETS` : undefined,
    tone: tyres?.compound && isWetTyre(tyres.compound) ? 'wet' : null,
  };
}

function forecastCell(forecast: LiveForecast | null, resource: LiveResourcePlan | null): PlanReadout {
  if (forecast) {
    return {
      label: forecast.change === 'rain' ? `RAIN · ${forecast.chance}%` : 'RAIN ENDS',
      value: forecast.lap !== null ? `~LAP ${forecast.lap}` : UNKNOWN,
      tone: 'wet',
    };
  }
  const unit = resource?.unit ?? '%';
  return { label: `${resource ? resourceName(resource.kind) : 'VE'} NOW`, value: formatAmount(resource?.amount, unit), unit };
}

function mfdResourceCell(resource: LiveResourcePlan, pit: LivePitInfo | null): PlanReadout {
  const needed = resource.race?.neededAfterStop ?? null;
  const set = pit?.mfd?.resourceValue ?? null;
  const short = needed !== null && set !== null && set < needed;
  return {
    label: `${resourceName(resource.kind)} · MFD`,
    value: formatAmount(needed, resource.unit),
    unit: resource.unit,
    note: set === null ? 'MFD NOT READ' : `SET ${formatAmount(set, resource.unit)}${resource.unit}`,
    noteTone: set === null ? 'muted' : short ? 'loss' : 'gain',
  };
}

function tyreMfdCell(pit: LivePitInfo | null, forecast: LiveForecast | null): PlanReadout {
  const call = pit?.mfd?.tyres ?? null;
  return {
    label: 'TYRES · MFD',
    value: tyreCallText(call),
    tone: isWetTyre(call) ? 'wet' : null,
    note: forecast ? forecastText(forecast) : undefined,
    noteTone: 'wet',
  };
}

function pitTimeCell(pit: LivePitInfo | null, repairSeconds: number | null): PlanReadout {
  if (pit && pit.penalties > 0) {
    return {
      label: 'STOP & GO',
      value: formatSecondsRange(pit.penaltySeconds, null),
      unit: 's',
      tone: 'warn',
      // The service waits for the stop after the penalty: its repair estimate stays in view.
      note: repairSeconds !== null ? `THEN REPAIR ${repairSeconds} s` : pit.penalties > 1 ? `${pit.penalties} PENALTIES` : 'NO SERVICE',
      noteTone: 'warn',
    };
  }
  return { label: 'PIT TIME · EST.', value: formatSecondsRange(pit?.serviceSeconds ?? null, pit?.serviceMaxSeconds ?? null), unit: 's' };
}

/** The race primary area for a snapshot: one deterministic choice, from the strategy only. */
export function racePlanView(snapshot: LiveSnapshot): RacePlanView {
  const strategy = snapshot.strategy;
  const resource = strategy?.resource ?? null;
  const race = resource?.race ?? null;
  const pit = strategy?.pit ?? null;
  const tyres = strategy?.tyres ?? null;
  const forecast = strategy?.forecast ?? null;
  const damage = strategy?.damage ?? null;
  const unit = resource?.unit ?? '%';
  const name = resource ? resourceName(resource.kind) : 'VE';
  const pitCells = (): RacePlanView['cells'] => [
    resource && race ? mfdResourceCell(resource, pit) : { label: `${name} · MFD`, value: UNKNOWN },
    tyreMfdCell(pit, forecast),
    pitTimeCell(pit, damage?.repairSeconds ?? null),
  ];

  if (damage?.wheel) {
    return {
      mode: 'pit-now',
      action: { label: '', value: 'PIT NOW', tone: 'loss', note: `${damage.wheel.problem === 'flat' ? 'FLAT' : 'WHEEL OFF'} · ${CORNER_NAMES[damage.wheel.corner]}`, noteTone: 'loss' },
      cells: pitCells(),
    };
  }
  if (pit && (pit.state === 'entering' || pit.state === 'stopped')) {
    const penalty = pit.penalties > 0;
    return {
      mode: 'in-pit',
      action: {
        label: penalty ? 'STOP & GO' : 'PIT STOP · EST.',
        value: formatSecondsRange(penalty ? pit.penaltySeconds : pit.serviceSeconds, penalty ? null : pit.serviceMaxSeconds),
        unit: 's',
      },
      cells: pitCells(),
    };
  }
  if (!resource || !race || resource.perLap === null) {
    return {
      mode: 'calculating',
      action: { label: '', value: 'CALCULATING', tone: 'muted', note: resource?.perLapSource === null ? `${name} / LAP AFTER ONE LAP` : undefined, noteTone: 'muted' },
      cells: [
        { label: `${name} NOW`, value: formatAmount(resource?.amount, unit), unit },
        { label: 'LAPS IN TANK', value: resource?.lapsInTank != null ? resource.lapsInTank.toFixed(1) : UNKNOWN },
        tyresCell(tyres),
      ],
    };
  }
  const estimate = resource.perLapSource === 'game' ? ' · GAME EST.' : '';
  if (race.finishReachable) {
    return {
      mode: 'sprint',
      action: {
        label: 'SPARE / LAP', value: formatSignedPerLap(race.sparePerLap, unit), unit,
        tone: marginTone(race.sparePerLap), note: 'NO PIT STOP', noteTone: 'gain',
      },
      cells: [{ label: `${name} AT FINISH`, value: formatAmount(race.atFinish, unit), unit }, tyresCell(tyres), forecastCell(forecast, resource)],
    };
  }
  const pitInLaps = race.pitInLaps ?? 0;
  if (pitInLaps <= PIT_LEAD_LAPS) {
    return {
      mode: 'pit',
      action: pitInLaps === 0
        ? { label: 'PIT', value: 'THIS LAP', tone: 'warn' }
        : { label: 'PIT IN', value: `${pitInLaps}`, unit: lapsUnit(pitInLaps) },
      cells: pitCells(),
    };
  }
  return {
    mode: 'stint',
    action: {
      label: `${name} / LAP · LAST 3${estimate}`,
      value: formatPerLap(resource.perLap, unit),
      unit,
      tone: marginTone(race.sparePerLap),
      note: race.sparePerLap === null ? undefined : `${formatSignedPerLap(race.sparePerLap, unit)} ${unit} ${race.sparePerLap < 0 ? 'OVER' : 'SPARE'} / LAP`,
      noteTone: marginTone(race.sparePerLap),
    },
    cells: [
      { label: 'PIT IN', value: `${pitInLaps}`, unit: lapsUnit(pitInLaps), note: race.stopsAfterNext > 0 ? `+${race.stopsAfterNext} MORE ${race.stopsAfterNext === 1 ? 'STOP' : 'STOPS'}` : undefined },
      tyresCell(tyres),
      forecastCell(forecast, resource),
    ],
  };
}
