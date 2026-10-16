import type { LiveSessionKind, LiveSnapshot } from '../../../shared/types/live.js';
import { mapVehicleIdToClass } from '../../../shared/domain/vehicleMapping.js';

export interface LiveFigure {
  label: string;
  value: string;
  /** Small text after the value. */
  unit?: string;
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

/** What the page shows for a snapshot: the lifecycle state screen (or the driving placeholder). */
export function liveScreen(snapshot: LiveSnapshot): LiveScreen {
  const session = snapshot.session;
  const kind = session ? sessionKindLabel(session.kind) : 'SESSION';
  const where = session?.trackName ? `${kind} · ${session.trackName}` : kind;
  switch (snapshot.lifecycle) {
    case 'offline':
      return { title: 'WAITING FOR LMU', note: 'GAME NOT RUNNING', muted: true, figures: [], showTrace: false };
    case 'menu':
      return { title: 'IN MENU', note: 'WAITING FOR A SESSION', muted: true, figures: [], showTrace: false };
    case 'garage':
      return { title: 'GARAGE', note: where, muted: false, figures: [], showTrace: false };
    case 'starting':
      return {
        title: session?.kind === 'race' ? 'RACE STARTING' : `${kind} STARTING`,
        note: startingNote(session?.gamePhase ?? 0), muted: false, figures: [], showTrace: true,
      };
    case 'finished':
      return { title: 'SESSION OVER', note: where, muted: false, figures: [], showTrace: false };
    case 'driving': {
      const figures: LiveFigure[] = [];
      if (session?.playerPlace != null) figures.push({ label: 'PLACE', value: `P${session.playerPlace}` });
      if (session?.playerLapsCompleted != null) {
        figures.push({
          label: 'LAPS', value: String(session.playerLapsCompleted), unit: session.maxLaps ? `/ ${session.maxLaps}` : undefined,
        });
      }
      return { title: kind, note: session?.trackName ?? '', muted: false, figures, showTrace: true };
    }
  }
}
