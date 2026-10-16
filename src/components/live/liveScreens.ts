import type { LiveSessionKind, LiveSnapshot } from '../../../shared/types/live.js';
import type { LiveGaragePlan, LiveGarageTyres } from '../../../shared/types/liveStrategy.js';
import { mapVehicleIdToClass } from '../../../shared/domain/vehicleMapping.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { formatAmount, formatPerLap, resourceName } from './race/livePlanFormat.js';

/** One thing to set in the garage: the target, what the garage holds now, and what to do about it. */
export interface GarageCheck {
  label: string;
  target: string;
  current: string;
  unit?: string;
  /** `ok` when the garage already matches, `change` when the driver must act, `warn` when they cannot. */
  action: { text: string; tone: 'ok' | 'change' | 'warn' } | null;
}

export interface LiveScreen {
  title: string;
  note: string;
  /** Offline and menu read as waiting: muted title. */
  muted: boolean;
  /** In the garage: the VE or fuel and the tyres to set before leaving. */
  checks: GarageCheck[];
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

/** How the target was worked out, said once under the title: session, laps, lap time and per-lap use. */
function garageBasis(plan: LiveGaragePlan): string {
  const name = resourceName(plan.kind);
  const session = plan.sessionMinutes !== null ? `${plan.sessionMinutes} MIN` : 'SESSION';
  const laps = plan.laps !== null ? `${plan.laps} LAPS AT ${formatLapTime(plan.lapSeconds)}` : `LAPS ${UNKNOWN}`;
  const perLap = `${formatPerLap(plan.perLap, plan.unit)} ${plan.unit} ${name} / LAP`;
  const source = plan.perLapSource === 'measured'
    ? `FROM ${plan.lapsMeasured} ${plan.lapsMeasured === 1 ? 'LAP' : 'LAPS'} THIS EVENT`
    : plan.perLapSource === 'game' ? "GAME'S ESTIMATE" : 'AFTER THE FIRST LAP';
  return `${session} · ${laps} · ${perLap} ${source}`;
}

/** The VE or fuel to load against the garage setting: raise it when short, fine when it covers the session. */
function resourceCheck(plan: LiveGaragePlan): GarageCheck {
  const name = resourceName(plan.kind);
  const { needed, setInGarage: set, unit } = plan;
  const action: GarageCheck['action'] = needed === null || set === null ? null
    : set >= needed ? { text: 'OK', tone: 'ok' }
      : { text: `RAISE +${formatAmount(needed - set, unit)}${unit === '%' ? '%' : ' L'}`, tone: 'change' };
  return {
    label: plan.stops ? `${name} · ${plan.stops} ${plan.stops === 1 ? 'STOP' : 'STOPS'}` : name,
    target: formatAmount(needed, unit), current: formatAmount(set, unit), unit, action,
  };
}

/**
 * The set the car goes out on. Qualifying and the race want a new set: one carried over from the session before
 * reads as a change to make (or a warning with no new sets left). In practice any set is fine.
 */
function tyreCheck(tyres: LiveGarageTyres | null, wantNew: boolean): GarageCheck {
  const label = tyres?.compound ? `TYRES · ${tyres.compound.toUpperCase()}` : 'TYRES';
  const current = !tyres ? UNKNOWN : tyres.used ? `USED ${Math.round(tyres.wear * 100)}%` : 'NEW';
  if (!wantNew) return { label, target: 'ANY', current, action: null };
  const action: GarageCheck['action'] = !tyres ? null
    : !tyres.used ? { text: 'OK', tone: 'ok' }
      : tyres.newSets === 0 ? { text: 'NO NEW SETS', tone: 'warn' } : { text: 'FIT NEW', tone: 'change' };
  return { label, target: 'NEW', current, action };
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
      return { title: 'WAITING FOR LMU', note: 'GAME NOT RUNNING', muted: true, checks: [], showTrace: false };
    case 'menu':
      return { title: 'IN MENU', note: 'WAITING FOR A SESSION', muted: true, checks: [], showTrace: false };
    case 'loading': {
      const progress = snapshot.loadingProgress;
      return { title: 'LOADING', note: progress === null ? 'LOADING THE SESSION' : `${Math.round(progress * 100)}%`, muted: true, checks: [], showTrace: false };
    }
    case 'garage': {
      // The bar already says GARAGE and the track: the title names the session, the note how the targets were worked out.
      const plan = snapshot.strategy?.garage ?? null;
      const wantNew = session?.kind === 'race' || session?.kind === 'qualifying';
      return {
        title: kind,
        note: plan ? garageBasis(plan) : track,
        muted: false,
        checks: plan ? [resourceCheck(plan), tyreCheck(plan.tyres, wantNew)] : [],
        showTrace: false,
      };
    }
    case 'starting':
      return {
        title: session?.kind === 'race' ? 'RACE STARTING' : `${kind} STARTING`,
        note: startingNote(session?.gamePhase ?? 0), muted: false, checks: [], showTrace: true,
      };
    case 'finished':
      return { title: 'SESSION OVER', note: where, muted: false, checks: [], showTrace: false };
    case 'driving':
      // The driving content is the session views (`LiveDriving`); this only says the trace stays.
      return { title: kind, note: session?.trackName ?? '', muted: false, checks: [], showTrace: true };
  }
}
