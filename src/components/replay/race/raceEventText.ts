import type { RaceReplayCar, RaceReplayEvent } from '../../../../shared/types/index.js';

/** The followed car's incidents: its pit stops and penalties, and every contact it was part of. */
export function incidentsOf(events: readonly RaceReplayEvent[], slot: number | null): RaceReplayEvent[] {
  return slot === null ? [] : events.filter(event => event.slot === slot || event.otherSlot === slot);
}

const carName = (cars: ReadonlyMap<number, RaceReplayCar>, slot: number): string => {
  const car = cars.get(slot);
  return car ? `${car.carNumber ? `#${car.carNumber} ` : ''}${car.name}` : `Car ${slot}`;
};

/** What happened and who or what else it involved, seen from the followed car `slot`. */
export function incidentText(event: RaceReplayEvent, slot: number, cars: ReadonlyMap<number, RaceReplayCar>): { what: string; who: string } {
  switch (event.kind) {
    case 'pit':
      return event.serviceSec == null
        ? { what: 'Pit lane', who: event.pitLaneSec == null ? 'did not leave' : `${event.pitLaneSec.toFixed(1)} s, no stop` }
        : { what: 'Pit stop', who: `${event.serviceSec.toFixed(1)} s stopped` };
    case 'contact': {
      const other = event.slot === slot ? event.otherSlot : event.slot;
      return { what: 'Contact', who: other !== undefined ? carName(cars, other) : event.label ?? 'the track' };
    }
    case 'penalty':
      return { what: 'Penalty', who: event.label ?? '' };
    case 'penaltyServed':
      return { what: 'Penalty served', who: event.label ?? '' };
  }
}
