/** Session storage key of the telemetry page's current visit. */
const STORAGE_KEY = 'lmu-telemetry-visit-v1';

interface VisitRecord {
  /** History index of the entry the page opened on: Back leaves to the one before. */
  entryIdx: number | null;
  /** The page opened on the race view (its Back then leaves the page). */
  enteredInRace: boolean;
  /** The race view was opened from the lap view (its Back returns there). */
  raceFromLap: boolean;
  /** History keys of the visit's entries: a remount or reload on one of them carries on the visit. */
  keys: string[];
}

function historyEntry(): { idx: number | null; key: string | null } {
  const state = window.history.state as { idx?: unknown; key?: unknown } | null;
  return { idx: typeof state?.idx === 'number' ? state.idx : null, key: typeof state?.key === 'string' ? state.key : null };
}

function read(): VisitRecord | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as VisitRecord : null;
  } catch {
    return null;
  }
}

/**
 * One visit of the telemetry page, from the history entry it opened on. Kept in session storage by history entry, so a
 * hot reload or a page reload inside the visit (which remounts the page) keeps where Back leaves to.
 */
export class TelemetryVisit {
  private record: VisitRecord;

  constructor(isRace: boolean) {
    const { idx, key } = historyEntry();
    const stored = read();
    this.record = stored && key !== null && stored.keys.includes(key)
      ? stored
      : { entryIdx: idx, enteredInRace: isRace, raceFromLap: false, keys: key === null ? [] : [key] };
    this.save();
  }

  get entryIdx(): number | null { return this.record.entryIdx; }
  get currentIdx(): number | null { return historyEntry().idx; }
  /** Whether the race view's Back returns to the lap view rather than leaving the page. */
  get raceFromLap(): boolean { return !this.record.enteredInRace || this.record.raceFromLap; }

  markRaceFromLap(): void {
    this.record.raceFromLap = true;
    this.save();
  }

  /** The visit moved to another history entry. */
  noteEntry(): void {
    const { key } = historyEntry();
    if (key === null || this.record.keys.includes(key)) return;
    this.record.keys.push(key);
    this.save();
  }

  private save(): void {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.record));
    } catch {
      // Without storage a remount starts a new visit.
    }
  }
}
