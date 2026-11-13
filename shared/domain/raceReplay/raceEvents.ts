import type { RaceReplayEvent } from '../../types/index.js';
import { pitStopsFromEvents, serviceSeconds } from '../pitStops.js';

/** A replay driver event as stored (replay_driver_events). */
export interface StoredDriverEvent {
  kind: 'pit' | 'contact' | 'penalty_given' | 'penalty_served';
  driverSlot: number;
  timeSec: number;
  code: number | null;
  value: number | null;
  otherSlot: number | null;
  detail: Record<string, unknown> | null;
}

/** Touches of the same two parties closer than this are one contact (cars bounce, both report it). */
const CONTACT_MERGE_SEC = 2;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * The race replay's timeline from the replay's driver events: each pit stop from entry to exit
 * (pitStops.ts), each contact once (both cars report it, and a scrape reports it many times), and
 * the penalties. `carSlots` are the session's cars: another slot is a wall or an object.
 */
export function buildRaceEvents(events: readonly StoredDriverEvent[], carSlots: ReadonlySet<number>): RaceReplayEvent[] {
  const out: RaceReplayEvent[] = [];
  const pitsBySlot = new Map<number, StoredDriverEvent[]>();
  for (const event of events) {
    if (event.kind === 'pit') pitsBySlot.set(event.driverSlot, [...pitsBySlot.get(event.driverSlot) ?? [], event]);
    else if (event.kind === 'penalty_given' || event.kind === 'penalty_served') {
      out.push({ kind: event.kind === 'penalty_given' ? 'penalty' : 'penaltyServed', timeSec: event.timeSec, slot: event.driverSlot,
        ...(text(event.detail?.penaltyText) ? { label: text(event.detail?.penaltyText) } : {}) });
    }
  }
  for (const [slot, pits] of pitsBySlot) {
    for (const stop of pitStopsFromEvents(pits)) {
      out.push({ kind: 'pit', timeSec: stop.entrySec, slot,
        pitLaneSec: stop.exitSec === null ? null : stop.exitSec - stop.entrySec, serviceSec: serviceSeconds(stop) });
    }
  }

  const open = new Map<string, RaceReplayEvent & { lastSec: number }>();
  const contacts = events.filter(event => event.kind === 'contact').sort((a, b) => a.timeSec - b.timeSec);
  for (const contact of contacts) {
    const other = contact.otherSlot !== null && carSlots.has(contact.otherSlot) ? contact.otherSlot : undefined;
    const key = other === undefined ? `${contact.driverSlot}|object` : [contact.driverSlot, other].sort((a, b) => a - b).join('|');
    const impact = contact.value ?? undefined;
    const current = open.get(key);
    if (current && contact.timeSec - current.lastSec <= CONTACT_MERGE_SEC) {
      current.lastSec = contact.timeSec;
      if (impact !== undefined && impact > (current.impact ?? -Infinity)) current.impact = impact;
      continue;
    }
    const event: RaceReplayEvent & { lastSec: number } = { kind: 'contact', timeSec: contact.timeSec, slot: contact.driverSlot, lastSec: contact.timeSec,
      ...(other !== undefined ? { otherSlot: other } : text(contact.detail?.otherPartyName) ? { label: text(contact.detail?.otherPartyName) } : {}),
      ...(impact !== undefined ? { impact } : {}) };
    open.set(key, event);
    out.push(event);
  }
  return out
    .map(event => { const { lastSec: _lastSec, ...rest } = event as RaceReplayEvent & { lastSec?: number }; return rest; })
    .sort((a, b) => a.timeSec - b.timeSec);
}
