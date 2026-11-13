import { describe, expect, it } from 'vitest';
import { incidentText, incidentsOf } from '../../../../src/components/replay/race/raceEventText.js';
import type { RaceReplayCar, RaceReplayEvent } from '../../../../shared/types/index.js';

const cars = new Map<number, RaceReplayCar>([[1, { slot: 1, name: 'Ann', carNumber: '7' }], [2, { slot: 2, name: 'Bea' }]]);
const events: RaceReplayEvent[] = [
  { kind: 'pit', timeSec: 10, slot: 1, pitLaneSec: 32.1, serviceSec: 24 },
  { kind: 'contact', timeSec: 20, slot: 2, otherSlot: 1 },
  { kind: 'penalty', timeSec: 30, slot: 2, label: 'Speeding In Pitlane' },
];

describe('race incidents', () => {
  it('keeps the followed car\'s incidents, including contacts it was hit in', () => {
    expect(incidentsOf(events, 1).map(event => event.timeSec)).toEqual([10, 20]);
    expect(incidentsOf(events, 2).map(event => event.timeSec)).toEqual([20, 30]);
    expect(incidentsOf(events, null)).toEqual([]);
  });

  it('says what happened and who else, seen from the followed car', () => {
    expect(incidentText(events[0], 1, cars)).toEqual({ what: 'Pit stop', who: '24.0 s stopped' });
    expect(incidentText(events[1], 1, cars)).toEqual({ what: 'Contact', who: 'Bea' });
    expect(incidentText(events[1], 2, cars)).toEqual({ what: 'Contact', who: '#7 Ann' });
    expect(incidentText(events[2], 2, cars)).toEqual({ what: 'Penalty', who: 'Speeding In Pitlane' });
    expect(incidentText({ kind: 'pit', timeSec: 0, slot: 9, pitLaneSec: 30, serviceSec: null }, 9, cars)).toEqual({ what: 'Pit lane', who: '30.0 s, no stop' });
    expect(incidentText({ kind: 'contact', timeSec: 0, slot: 1, label: 'Immovable' }, 1, cars)).toEqual({ what: 'Contact', who: 'Immovable' });
    expect(incidentText({ kind: 'contact', timeSec: 0, slot: 1, otherSlot: 5 }, 1, cars)).toEqual({ what: 'Contact', who: 'Car 5' });
    expect(incidentText({ kind: 'penaltyServed', timeSec: 0, slot: 2, label: 'Drive Through Served' }, 2, cars)).toEqual({ what: 'Penalty served', who: 'Drive Through Served' });
  });
});
