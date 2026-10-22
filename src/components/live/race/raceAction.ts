import type { LiveSnapshot } from '../../../../shared/types/live.js';
import type { LiveForecast, LivePitInfo, LiveResourcePlan, LiveTyres } from '../../../../shared/types/liveStrategy.js';
import { UNKNOWN } from '../liveFormat.js';
import { LIVE_TYRE_TREAD_FLOOR } from '../../../../shared/domain/live/liveInsights.js';
import {
  CORNER_NAMES, compoundTone, formatAmount, formatPerLap, formatSecondsRange, formatSignedPerLap, resourceName, tyreCallText,
  type CompoundTone,
} from './livePlanFormat.js';

export type PlanTone = 'gain' | 'loss' | 'warn' | 'muted' | CompoundTone | null;

export interface PlanReadout {
  label: string;
  /** A word after the label (`TYRES · MEDIUM`) in its own tone. */
  labelAccent?: string;
  labelAccentTone?: PlanTone;
  value: string;
  unit?: string;
  note?: string;
  tone?: PlanTone;
  noteTone?: PlanTone;
  detail?: string;
  detailTone?: PlanTone;
}

/** Which advice leads; the place of every readout stays the same in each. */
export type RaceMode = 'calculating' | 'pit-now' | 'in-pit' | 'pit' | 'stint' | 'sprint' | 'saving';

export interface RacePlanView {
  mode: RaceMode;
  action: PlanReadout;
  /** Sprint keeps two supporting figures; pit and stint modes keep three. */
  cells: [PlanReadout, PlanReadout] | [PlanReadout, PlanReadout, PlanReadout];
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
  const coverage = tyres?.coverage;
  if (coverage) return {
    label: `TREAD AT ${coverage.target === 'finish' ? 'FINISH' : 'PIT'}`,
    value: `~${Math.round(coverage.projectedTread * 100)}`, unit: '%',
    note: coverage.projectedTread < LIVE_TYRE_TREAD_FLOOR ? 'BELOW 40% MIN' : undefined,
    detail: coverage.availableSetsCover === false ? 'NOT ENOUGH SETS' : undefined,
    tone: coverage.projectedTread < LIVE_TYRE_TREAD_FLOOR ? 'loss' : null,
  };
  const worst = tyres?.worst ?? null;
  return {
    label: 'TYRES',
    labelAccent: tyres?.compound?.toUpperCase(),
    labelAccentTone: compoundTone(tyres?.compound),
    value: worst === null ? UNKNOWN : `${Math.round(worst * 100)}`,
    unit: worst === null ? undefined : '%',
    note: tyres?.newSets === 0 ? 'NO NEW SETS' : undefined,
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

/** `now`: the stop is this lap (damage, in the pit lane), maybe earlier than planned: its target covers more laps. */
function mfdResourceCell(resource: LiveResourcePlan, pit: LivePitInfo | null, now: boolean): PlanReadout {
  const race = resource.race;
  const needed = !race ? null : now ? race.neededStopNow : race.neededAfterStop;
  const set = pit?.mfd?.resourceValue ?? null;
  const short = needed !== null && set !== null && set < needed;
  return {
    label: `${resourceName(resource.kind)} · MFD`,
    value: formatAmount(needed, resource.unit),
    unit: resource.unit,
    note: set === null ? 'MFD NOT READ' : set === needed ? undefined : `SET ${formatAmount(set, resource.unit)}${resource.unit}${short ? ' · RAISE' : ''}`,
    noteTone: set === null ? 'muted' : short ? 'loss' : 'gain',
  };
}

function tyreMfdCell(pit: LivePitInfo | null): PlanReadout {
  const call = pit?.mfd?.tyres ?? null;
  return {
    label: 'TYRES · MFD',
    value: tyreCallText(call),
    tone: compoundTone(call),
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
  const pitCells = (now: boolean): [PlanReadout, PlanReadout, PlanReadout] => [
    resource && race ? mfdResourceCell(resource, pit, now) : { label: `${name} · MFD`, value: UNKNOWN },
    tyreMfdCell(pit),
    pitTimeCell(pit, damage?.repairSeconds ?? null),
  ];
  const ratio = strategy?.fuelRatio;
  const ratioCell: PlanReadout | null = ratio ? {
    label: 'FUEL RATIO', value: ratio.recommended?.toFixed(2) ?? UNKNOWN,
    note: ratio.mfdSetting !== null && ratio.mfdSetting === ratio.recommended ? undefined : `SET ${ratio.mfdSetting?.toFixed(2) ?? UNKNOWN}`,
    detail: ratio.fuelBiasLaps !== null && ratio.fuelBiasLaps < 0 ? 'FUEL RUNS OUT FIRST' : ratio.source === 'game' ? 'GAME ESTIMATE' : undefined,
    tone: (ratio.fuelBiasLaps !== null && ratio.fuelBiasLaps < 0) || (ratio.recommended !== null && ratio.mfdSetting !== null && ratio.mfdSetting < ratio.recommended) ? 'loss' : null,
    detailTone: ratio.fuelBiasLaps !== null && ratio.fuelBiasLaps < 0 ? 'loss' : 'muted',
  } : null;
  const executionCells = (now: boolean): [PlanReadout, PlanReadout, PlanReadout] => {
    const cells = pitCells(now);
    if (ratio) {
      cells[0].detail = `RATIO ${ratio.recommended?.toFixed(2) ?? UNKNOWN}${ratio.mfdSetting !== null && ratio.mfdSetting === ratio.recommended ? '' : ` · SET ${ratio.mfdSetting?.toFixed(2) ?? UNKNOWN}`}`;
      cells[0].detailTone = ratio.recommended !== null && ratio.mfdSetting !== null && ratio.mfdSetting < ratio.recommended ? 'loss' : 'muted';
    }
    const coverage = tyres?.coverage;
    const needsNew = !!damage?.wheel || (coverage !== undefined && coverage !== null && coverage.projectedTread < LIVE_TYRE_TREAD_FLOOR);
    const noChange = /no change/i.test(pit?.mfd?.tyres ?? '');
    if (needsNew && noChange) {
      cells[1].value = tyres?.compound ? `NEW ${tyres.compound.toUpperCase()}` : 'NEW SET';
      cells[1].note = 'SET NO CHANGE';
      cells[1].noteTone = 'loss';
      cells[1].tone = 'warn';
    } else if (coverage && coverage.projectedTread < LIVE_TYRE_TREAD_FLOOR) {
      cells[1].note = `TREAD ~${Math.round(coverage.projectedTread * 100)}% · 40% MIN`;
      cells[1].noteTone = 'loss';
    }
    if (!pit?.penalties) cells[2].note = pit?.mfd?.repair
      ? /^N\/A$/i.test(pit.mfd.repair) ? undefined : `REPAIR: ${pit.mfd.repair.replace(/^Repair /i, '').toUpperCase()}`
      : damage?.significant ? 'REPAIR NOT READ' : undefined;
    return cells;
  };

  if (damage?.wheel) {
    return {
      mode: 'pit-now',
      action: { label: '', value: 'PIT NOW', tone: 'loss', note: `${damage.wheel.problem === 'flat' ? 'FLAT' : 'WHEEL OFF'} · ${CORNER_NAMES[damage.wheel.corner]}`, noteTone: 'loss' },
      cells: executionCells(true),
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
      cells: executionCells(true),
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
  const estimate = resource.learning ? ' · LEARNED' : resource.perLapSource === 'game' ? ' · GAME EST.' : '';
  if (race.finishReachable) {
    return {
      mode: 'sprint',
      action: {
        label: 'ESTIMATED LAP', value: UNKNOWN,
      },
      cells: [{ label: `${name} AT FINISH`, value: `~${formatAmount(race.atFinish, unit)}`, unit }, tyresCell(tyres)],
    };
  }
  const saving = resource.saving;
  // This is a display cutoff for a modest scenario, not a claim that the saving is achievable.
  if (saving && saving.savePercent > 0 && saving.savePercent <= 5 && resource.lapsMeasured >= 3 && saving.source === 'measured' && !damage && !pit?.penalties) {
    return { mode: 'saving', action: { label: 'TO SKIP STOP', value: saving.targetPerLap.toFixed(2), unit: `${unit}/lap`,
      note: `SAVE ${saving.savePerLap.toFixed(2)} ${unit}/LAP`, noteTone: 'warn' },
      cells: [{ label: 'SHORT TO FINISH', value: formatAmount(saving.shortfall, unit), unit },
        tyresCell(tyres), { label: 'OR PIT IN', value: `${race.pitInLaps ?? 0}`, unit: 'LAPS' }] };
  }
  const pitInLaps = race.pitInLaps ?? 0;
  if (pitInLaps <= PIT_LEAD_LAPS) {
    return {
      mode: 'pit',
      action: pitInLaps === 0
        ? { label: 'PIT', value: 'THIS LAP', tone: 'warn' }
        : { label: 'PIT IN', value: `${pitInLaps}`, unit: lapsUnit(pitInLaps) },
      cells: executionCells(false),
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
      ratioCell ?? (saving && saving.savePercent > 0 ? { label: 'NO-STOP TARGET', value: saving.targetPerLap.toFixed(2), unit: `${unit}/lap`, note: `${saving.savePercent}% LESS USE`, detail: saving.source === 'game' ? 'GAME ESTIMATE' : undefined } : forecastCell(forecast, resource)),
    ],
  };
}
