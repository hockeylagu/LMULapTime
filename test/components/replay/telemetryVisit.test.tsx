import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryVisit } from '../../../src/components/replay/telemetryVisit.js';

const at = (idx: number, key: string) => window.history.replaceState({ idx, key }, '');

describe('TelemetryVisit', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('keeps the entry the page opened on across a remount on one of its entries', () => {
    at(2, 'lap');
    const first = new TelemetryVisit(false);
    at(3, 'race');
    first.noteEntry();
    first.markRaceFromLap();
    // A hot reload or page reload remounts the page on the race entry.
    const remounted = new TelemetryVisit(true);
    expect([remounted.entryIdx, remounted.currentIdx, remounted.raceFromLap]).toEqual([2, 3, true]);
  });

  it('starts a new visit on an entry it has not seen, and a race opened first leaves the page on Back', () => {
    at(2, 'lap');
    void new TelemetryVisit(false);
    at(5, 'elsewhere');
    const fresh = new TelemetryVisit(true);
    expect([fresh.entryIdx, fresh.raceFromLap]).toEqual([5, false]);
  });
});
