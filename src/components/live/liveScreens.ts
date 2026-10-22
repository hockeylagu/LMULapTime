import type { LiveSessionKind, LiveSnapshot } from '../../../shared/types/live.js';
import type { LiveGaragePlan, LiveGarageTyres } from '../../../shared/types/liveStrategy.js';
import { knownCarClass, resolveVehicle } from '../../../shared/domain/vehicleMapping.js';
import { formatLapTime, UNKNOWN } from './liveFormat.js';
import { formatAmount, resourceName } from './race/livePlanFormat.js';
import { LIVE_TYRE_TREAD_FLOOR } from '../../../shared/domain/live/liveInsights.js';
import { requestDirectoryScan } from '../../api/useAppData.js';

/**
 * The way back to the dashboard brings the session just driven along: its results XML, replay and telemetry are
 * synced. Asked during a session, the server holds the scan until the session ends.
 */
export function syncOnReturnToDashboard(): void {
  // A server that does not answer shows on the dashboard itself.
  requestDirectoryScan().catch(() => undefined);
}

/** One thing to set in the garage: the target, what the garage holds now, and what to do about it. */
export interface GarageCheck {
  label: string;
  target: string;
  current: string;
  unit?: string;
  /** `ok` when the garage already matches, `change` when the driver must act, `warn` when they cannot. */
  action: { text: string; tone: 'ok' | 'change' | 'warn' } | null;
  note?: string;
  /** The tyre compound shown after the label, in its colour. */
  compound?: string;
}

export interface LiveScreen {
  title: string;
  note: string;
  /** Offline and menu read as waiting: muted title. */
  muted: boolean;
  /** In the garage and on the grid before the formation lap: the VE or fuel and the tyres to set before leaving. */
  checks: GarageCheck[];
  /** The pedal trace stays for an input check (starting) and while driving. */
  showTrace: boolean;
  preparation?: { laps: number | null; length: string; stopPlan: string | null };
  /** With the game closed: a way back to the dashboard. */
  dashboardLink?: boolean;
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
  return resolveVehicle(vehicleName)?.carClass ?? knownCarClass(vehicleClass);
}

function startingNote(gamePhase: number): string {
  if (gamePhase === 3) return 'FORMATION LAP';
  if (gamePhase === 4) return 'COUNTDOWN';
  return 'ON THE GRID';
}

/**
 * The VE or fuel to load against the garage setting: raise it when short, fine when it covers the session. Practice
 * may run light on purpose (qualifying runs), so a short load there only says how many laps it holds.
 */
function resourceCheck(plan: LiveGaragePlan, practice: boolean): GarageCheck {
  const name = resourceName(plan.kind);
  const { needed, setInGarage: set, unit, perLap } = plan;
  const action: GarageCheck['action'] = needed === null || set === null ? null
    : set >= needed ? { text: 'OK', tone: 'ok' }
      : practice ? perLap ? { text: `~${Math.floor(set / perLap)} LAPS`, tone: 'warn' } : null
        : { text: `RAISE +${formatAmount(needed - set, unit)}${unit === '%' ? '%' : ' L'}`, tone: 'change' };
  return {
    label: name,
    target: formatAmount(needed, unit), current: formatAmount(set, unit), unit, action,
    note: plan.learning ? 'LEARNED CORRECTION' : plan.perLapSource === 'game' ? 'GAME ESTIMATE' : plan.perLapSource === null ? 'USE NOT MEASURED' : undefined,
  };
}

/**
 * The set the car goes out on. Qualifying and the race want a new set: one carried over from the session before
 * reads as a change to make (or a warning with no new sets left). In practice any set is fine.
 */
function tyreCheck(tyres: LiveGarageTyres | null, wantNew: boolean): GarageCheck {
  const label = 'TYRES';
  const compound = tyres?.compound ? tyres.compound.toUpperCase() : undefined;
  const current = !tyres ? UNKNOWN : tyres.used ? `USED ${Math.round(tyres.wear * 100)}%` : 'NEW';
  if (!wantNew) return { label, compound, target: 'ANY', current, action: null };
  const action: GarageCheck['action'] = !tyres ? null
    : !tyres.used ? { text: 'OK', tone: 'ok' }
      : tyres.newSets === 0 ? { text: 'NO NEW SETS', tone: 'warn' } : { text: 'FIT NEW', tone: 'change' };
  return { label, compound, target: 'NEW', current, action };
}

/** The garage checklist: the VE or fuel load, the fuel ratio (VE classes) and the tyres the car goes out on. */
function garageChecks(snapshot: LiveSnapshot, plan: LiveGaragePlan): GarageCheck[] {
  const kind = snapshot.session?.kind;
  const checks = [resourceCheck(plan, kind === 'practice'), tyreCheck(plan.tyres, kind === 'race' || kind === 'qualifying')];
  const ratio = snapshot.strategy?.fuelRatio;
  if (plan.kind === 've' && ratio) checks.splice(1, 0, {
    label: 'FUEL RATIO', target: ratio.recommended?.toFixed(2) ?? UNKNOWN, current: ratio.garageSetting?.toFixed(2) ?? UNKNOWN,
    note: ratio.recommended === null ? 'SETTING RANGE NOT READ' : ratio.source === 'game' ? 'GAME ESTIMATE' : undefined,
    action: ratio.recommended === null || ratio.garageSetting === null ? null : ratio.garageSetting < ratio.recommended
      ? { text: 'RAISE', tone: 'change' } : ratio.garageSetting > ratio.recommended ? { text: 'LOWER', tone: 'change' } : { text: 'OK', tone: 'ok' },
  });
  // Qualifying wants a new set however long the fitted one would last.
  const coverage = kind === 'qualifying' ? null : plan.tyreCoverage;
  if (coverage) {
    const tyres = checks[checks.length - 1];
    tyres.target = `~${Math.round(coverage.projectedTread * 100)}% END`;
    tyres.note = coverage.projectedTread < LIVE_TYRE_TREAD_FLOOR ? 'BELOW 40% MIN' : undefined;
    tyres.action = coverage.projectedTread < LIVE_TYRE_TREAD_FLOOR ? plan.tyres?.newSets === 0 ? { text: 'NO NEW SETS', tone: 'warn' } : { text: 'FIT NEW', tone: 'change' } : coverage.availableSetsCover === false ? { text: 'SETS SHORT', tone: 'warn' } : null;
  }
  return checks;
}

/** The session laps, length and (races) stop plan the garage load is worked out for. */
function garagePreparation(kind: LiveSessionKind | undefined, plan: LiveGaragePlan): NonNullable<LiveScreen['preparation']> {
  // Before the green flag LMU's clock is the countdown to the start: the race length (and its laps) come with it.
  return { laps: kind === 'race' && plan.laps !== null ? Math.max(0, plan.laps - 1) : plan.laps,
    length: plan.sessionMinutes !== null ? `${plan.sessionMinutes} MIN` : kind === 'race' ? 'LAPS AT THE START' : 'SESSION LENGTH UNKNOWN',
    stopPlan: kind !== 'race' || plan.sessionMinutes === null ? null
      : plan.stops === null ? 'STOPS UNKNOWN' : plan.stops === 0 ? 'NO STOP PLANNED'
        : `${plan.stops} STOP${plan.stops === 1 ? '' : 'S'} PLANNED · ${plan.firstPitLap != null ? `PIT ~LAP ${plan.firstPitLap}` : 'PIT LAP UNKNOWN'}` };
}

/** The game's name for the track, as on its own screens (the same text in the bar and on every state screen). */
export function liveTrackName(snapshot: LiveSnapshot): string {
  return snapshot.session?.trackName || snapshot.identity?.layoutName || '';
}

/** What the page shows for a snapshot: the lifecycle state screen (or the driving placeholder). */
export function liveScreen(snapshot: LiveSnapshot): LiveScreen {
  const session = snapshot.session;
  const kind = session ? sessionKindLabel(session.kind) : 'SESSION';
  switch (snapshot.lifecycle) {
    case 'offline':
      return { title: 'WAITING FOR LMU', note: 'WAITING FOR LIVE DATA FROM THE GAME', muted: true, checks: [], showTrace: false, dashboardLink: true };
    case 'menu':
      return { title: 'IN MENU', note: 'JOIN A SESSION TO BEGIN', muted: true, checks: [], showTrace: false };
    case 'loading': {
      const progress = snapshot.loadingProgress;
      return { title: 'LOADING', note: progress === null ? '' : `${Math.round(progress * 100)}%`, muted: true, checks: [], showTrace: false };
    }
    case 'garage': {
      // The bar already says GARAGE and the track: the title names the session, the note how the targets were worked out.
      const plan = snapshot.strategy?.garage ?? null;
      const qualifying = snapshot.qualifyingResult;
      const qualiNote = session?.kind === 'race' && qualifying ? `QUALI ${qualifying.classPlace !== null ? `P${qualifying.classPlace}` : UNKNOWN} ${formatLapTime(qualifying.bestLap)}${qualifying.settled === true ? '' : ' (PROVISIONAL)'}` : '';
      return {
        title: kind,
        note: plan ? qualiNote : 'WAITING FOR GARAGE DATA',
        preparation: plan ? garagePreparation(session?.kind, plan) : undefined,
        muted: false,
        checks: plan ? garageChecks(snapshot, plan) : [],
        showTrace: false,
      };
    }
    case 'starting': {
      // On the grid, until the formation lap, the driver can still go back to the garage for fuel, tyres or setup: the
      // checklist stays, and the start phase becomes the title (the bar names the session) so it fits over the trace.
      // From the formation lap the checklist goes, but the stop plan stays until the race plan takes over at the green flag.
      const gamePhase = session?.gamePhase ?? 0;
      const garage = snapshot.strategy?.garage ?? null;
      const plan = gamePhase < 3 ? garage : null;
      const phase = startingNote(gamePhase);
      const stopPlan = !plan && garage ? garagePreparation(session?.kind, garage).stopPlan : null;
      return {
        title: plan ? phase : session?.kind === 'race' ? 'RACE STARTING' : `${kind} STARTING`,
        note: plan ? '' : stopPlan ? `${phase} · ${stopPlan}` : phase, muted: false,
        preparation: plan ? garagePreparation(session?.kind, plan) : undefined,
        checks: plan ? garageChecks(snapshot, plan) : [],
        showTrace: true,
      };
    }
    case 'finished':
      return { title: 'SESSION OVER', note: '', muted: false, checks: [], showTrace: false };
    case 'driving':
      // The driving content is the session views (`LiveDriving`); this only says the trace stays.
      return { title: kind, note: '', muted: false, checks: [], showTrace: true };
  }
}
