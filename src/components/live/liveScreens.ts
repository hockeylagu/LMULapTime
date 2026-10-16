import type { LiveSessionKind, LiveSnapshot } from '../../../shared/types/live.js';
import type { LiveGaragePlan } from '../../../shared/types/liveStrategy.js';
import { mapVehicleIdToClass } from '../../../shared/domain/vehicleMapping.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { formatAmount, formatPerLap, resourceName } from './race/livePlanFormat.js';

export interface LiveFigure {
  label: string;
  value: string;
  /** Small text after the value. */
  unit?: string;
  /** `need` marks the amount to load; `short` a garage setting below it, `enough` one that covers it. */
  tone?: 'need' | 'short' | 'enough';
}

export interface LiveScreen {
  title: string;
  note: string;
  /** Offline and menu read as waiting: muted title. */
  muted: boolean;
  figures: LiveFigure[];
  /** The pedal trace stays for an input check (starting) and while driving. */
  showTrace: boolean;
}

const KIND_LABELS: Record<LiveSessionKind, string> = {
  practice: 'PRACTICE',
  qualifying: 'QUALIFYING',
  warmup: 'WARMUP',
  race: 'RACE',
  unknown: 'SESSION',
};

export function sessionKindLabel(kind: LiveSessionKind): string {
  return KIND_LABELS[kind];
}

/** The canonical class (`Hyper`, `GT3`, ...) of the player's car, from the names the game reports. */
export function liveCarClass(vehicleName: string, vehicleClass: string): string | null {
  const resolved = mapVehicleIdToClass(vehicleName, vehicleClass);
  return resolved || null;
}

function startingNote(gamePhase: number): string {
  if (gamePhase === 3) return 'FORMATION LAP';
  if (gamePhase === 4) return 'COUNTDOWN';
  return 'ON THE GRID';
}

const reserveText = (laps: number): string => `${laps} ${laps === 1 ? 'LAP' : 'LAPS'}`;

/** Where the per-lap figure comes from, said once under the title. */
function perLapSourceNote(plan: LiveGaragePlan): string {
  const name = resourceName(plan.kind);
  if (plan.perLapSource === 'measured') return `${name} / LAP FROM ${plan.lapsMeasured} ${plan.lapsMeasured === 1 ? 'LAP' : 'LAPS'} THIS EVENT`;
  if (plan.perLapSource === 'game') return `${name} / LAP FROM THE GAME'S ESTIMATE`;
  return `${name} / LAP AFTER THE FIRST LAP`;
}

/**
 * In the garage: what to load for the loaded session. The session's laps come from its length and the lap time,
 * the amount from the per-lap use and the reserve; the garage's own setting sits beside it.
 */
function garageFigures(plan: LiveGaragePlan): LiveFigure[] {
  const name = resourceName(plan.kind);
  const unit = plan.unit;
  const set = plan.setInGarage;
  const covered = set !== null && plan.needed !== null ? set >= plan.needed : null;
  return [
    { label: plan.sessionMinutes !== null ? `${plan.sessionMinutes} MIN · ${formatLapTime(plan.lapSeconds)}` : 'SESSION', value: plan.laps !== null ? `${plan.laps}` : UNKNOWN, unit: 'LAPS' },
    { label: `${name} / LAP`, value: formatPerLap(plan.perLap, unit), unit },
    { label: 'RESERVE', value: reserveText(plan.reserveLaps) },
    { label: plan.stops ? `${name} NEEDED · ${plan.stops} ${plan.stops === 1 ? 'STOP' : 'STOPS'}` : `${name} NEEDED`, value: formatAmount(plan.needed, unit), unit, tone: 'need' },
    { label: 'SET IN GARAGE', value: formatAmount(set, unit), unit, tone: covered === null ? undefined : covered ? 'enough' : 'short' },
  ];
}

/** The game's name for the track, as on its own screens (the same text in the bar and on every state screen). */
export function liveTrackName(snapshot: LiveSnapshot): string {
  return snapshot.session?.trackName || snapshot.identity?.layoutName || '';
}

/** What the page shows for a snapshot: the lifecycle state screen (or the driving placeholder). */
export function liveScreen(snapshot: LiveSnapshot): LiveScreen {
  const session = snapshot.session;
  const kind = session ? sessionKindLabel(session.kind) : 'SESSION';
  const track = liveTrackName(snapshot);
  const where = track ? `${kind} · ${track}` : kind;
  switch (snapshot.lifecycle) {
    case 'offline':
      return { title: 'WAITING FOR LMU', note: 'GAME NOT RUNNING', muted: true, figures: [], showTrace: false };
    case 'menu':
      return { title: 'IN MENU', note: 'WAITING FOR A SESSION', muted: true, figures: [], showTrace: false };
    case 'loading': {
      const progress = snapshot.loadingProgress;
      return { title: 'LOADING', note: progress === null ? 'LOADING THE SESSION' : `${Math.round(progress * 100)}%`, muted: true, figures: [], showTrace: false };
    }
    case 'garage': {
      // The bar already says GARAGE: the title names the session, the note the track and where the figures come from.
      const plan = snapshot.strategy?.garage ?? null;
      return {
        title: kind,
        note: plan ? `${track} · ${perLapSourceNote(plan)}` : track,
        muted: false,
        figures: plan ? garageFigures(plan) : [],
        showTrace: false,
      };
    }
    case 'starting':
      return {
        title: session?.kind === 'race' ? 'RACE STARTING' : `${kind} STARTING`,
        note: startingNote(session?.gamePhase ?? 0), muted: false, figures: [], showTrace: true,
      };
    case 'finished':
      return { title: 'SESSION OVER', note: where, muted: false, figures: [], showTrace: false };
    case 'driving':
      // The driving content is the session views (`LiveDriving`); this only says the trace stays.
      return { title: kind, note: session?.trackName ?? '', muted: false, figures: [], showTrace: true };
  }
}
