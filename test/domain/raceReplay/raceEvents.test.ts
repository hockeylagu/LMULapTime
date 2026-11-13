import { describe, expect, it } from 'vitest';
import { buildRaceEvents, type StoredDriverEvent } from '../../../shared/domain/raceReplay/raceEvents.js';

const event = (kind: StoredDriverEvent['kind'], driverSlot: number, timeSec: number, extra: Partial<StoredDriverEvent> = {}): StoredDriverEvent => ({
  kind, driverSlot, timeSec, code: null, value: null, otherSlot: null, detail: null, ...extra,
});
const pit = (slot: number, timeSec: number, code: number) => event('pit', slot, timeSec, { code });

describe('buildRaceEvents', () => {
  it('makes one pit stop from entry to exit, with the time stopped', () => {
    const events = buildRaceEvents([pit(1, 100, 34), pit(1, 110, 35), pit(1, 134, 37), pit(1, 140, 32), pit(2, 300, 34)], new Set([1, 2]));
    expect(events).toEqual([
      { kind: 'pit', timeSec: 100, slot: 1, pitLaneSec: 40, serviceSec: 24 },
      { kind: 'pit', timeSec: 300, slot: 2, pitLaneSec: null, serviceSec: null },
    ]);
  });

  it('merges the reports of one contact and keeps the hardest impact', () => {
    const events = buildRaceEvents([
      event('contact', 1, 50, { otherSlot: 2, value: 3 }),
      event('contact', 2, 50.1, { otherSlot: 1, value: 5 }),
      event('contact', 1, 51.5, { otherSlot: 2, value: 2 }),
      event('contact', 1, 60, { otherSlot: 2, value: 1 }),
      event('contact', 3, 70, { otherSlot: 99, detail: { otherPartyName: 'Immovable' } }),
    ], new Set([1, 2, 3]));
    expect(events).toEqual([
      { kind: 'contact', timeSec: 50, slot: 1, otherSlot: 2, impact: 5 },
      { kind: 'contact', timeSec: 60, slot: 1, otherSlot: 2, impact: 1 },
      { kind: 'contact', timeSec: 70, slot: 3, label: 'Immovable' },
    ]);
  });

  it('keeps penalties given and served with their text, in time order', () => {
    const events = buildRaceEvents([
      event('penalty_served', 4, 200, { detail: { penaltyText: 'Drive Through Served' } }),
      event('penalty_given', 4, 120, { detail: { penaltyText: ' Speeding In Pitlane ' } }),
      event('penalty_given', 5, 130),
    ], new Set([4, 5]));
    expect(events).toEqual([
      { kind: 'penalty', timeSec: 120, slot: 4, label: 'Speeding In Pitlane' },
      { kind: 'penalty', timeSec: 130, slot: 5 },
      { kind: 'penaltyServed', timeSec: 200, slot: 4, label: 'Drive Through Served' },
    ]);
  });
});
