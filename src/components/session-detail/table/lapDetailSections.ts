import type { LapData } from '../../../../shared/types/index.js';
import type { LapEvents } from '../../../../shared/domain/lapComparison.js';
import { describeLapTraffic, describeNonRepresentative, type LapPlaces } from '../../../utils/lapTrafficText.js';
import { describePitStopLap, type LapPitStop } from './pitStopText.js';
import { formatRain } from '../../../../shared/domain/lapConditions.js';

/** What the rest of the driver's race adds to a lap: the places it won or lost, the stop it is part of. */
export interface LapDetailContext {
  places?: LapPlaces;
  pitStop?: LapPitStop;
  /** The driver's events that fell on the lap. */
  events?: LapEvents;
}

export interface LapDetailSection {
  label: string;
  lines: string[];
}

/** How a lap with conditions is judged (shared/domain/lapConditions.ts). */
export const CONDITIONS_NOTE = 'judged against your other laps in the same conditions';

/** Rain as the replay records it (raw 0-255), as a share of full rain. */
export const describeRain = (rain: number): string => `Rain ${formatRain(rain)}`;

/** "Track limits review (No Further Action)" as "Review (No Further Action)", under a Track limits heading. */
export function withoutTrackLimitsPrefix(description: string): string {
  const rest = description.replace(/^track limits\s+/i, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * What happened on a lap beyond its times, grouped for the lap table's expanded row: the
 * conditions, why it is left out of the average, the cars around the driver, incidents, track
 * limits, penalties and the pit stop. Empty when there is nothing to add.
 */
export function lapDetailSections(lap: LapData, context: LapDetailContext = {}): LapDetailSection[] {
  const sections: LapDetailSection[] = [];
  if (lap.conditions) {
    const lines = [
      ...(lap.conditions.rain !== undefined ? [describeRain(lap.conditions.rain)] : []),
      ...(lap.conditions.wetTyres ? ['On wet tyres'] : []),
    ];
    sections.push({ label: 'Conditions', lines: [`${lines.join(' · ')}: ${CONDITIONS_NOTE}`] });
  }
  if (lap.nonRepresentativeReason) {
    sections.push({ label: 'Left out of average', lines: [describeNonRepresentative(lap.nonRepresentativeReason, lap.traffic)] });
  }
  // Cars going by while the driver is in or out of the pits are not a fight.
  const inPits = lap.isPitStop || lap.isOutLap === true;
  const places = context.places;
  if (places && places.from !== places.to) {
    const gained = places.from > places.to;
    const count = Math.abs(places.from - places.to);
    sections.push({
      label: gained ? 'Position gained' : 'Position lost',
      lines: [`P${places.from} → P${places.to} · ${count} ${count === 1 ? 'place' : 'places'} ${gained ? 'gained' : 'lost'}`],
    });
  }
  const traffic = inPits ? [] : describeLapTraffic(lap.traffic);
  if (traffic.length > 0) sections.push({ label: 'Around you', lines: traffic });
  const { incidents, trackLimits, penalties } = context.events ?? { incidents: [], trackLimits: [], penalties: [] };
  if (incidents.length) sections.push({ label: 'Incidents', lines: incidents.map((i) => i.description) });
  if (trackLimits.length) sections.push({ label: 'Track limits', lines: trackLimits.map((tl) => withoutTrackLimitsPrefix(tl.description)) });
  if (penalties.length) sections.push({ label: 'Penalties', lines: penalties.map((p) => p.description) });
  const pitStop = context.pitStop ?? (lap.isPitStop ? { inLap: lap, onOutLap: false } : undefined);
  const pitLines = pitStop ? describePitStopLap(pitStop) : [];
  if (pitLines.length > 0) sections.push({ label: 'Pit stop', lines: pitLines });
  return sections;
}

/** The incidents, track limits and penalties of a lap as one tooltip, or undefined when there are none. */
export function lapEventsTooltip({ incidents, trackLimits, penalties }: LapEvents): string | undefined {
  const blocks: string[] = [];
  if (incidents.length > 0) blocks.push(`Incidents (${incidents.length}):\n${incidents.map((i) => `  • ${i.description}`).join('\n')}`);
  if (trackLimits.length > 0) {
    blocks.push(`Track limits (${trackLimits.length}):\n${trackLimits.map((tl) => `  • ${withoutTrackLimitsPrefix(tl.description)}`).join('\n')}`);
  }
  if (penalties.length > 0) blocks.push(`Penalties (${penalties.length}):\n${penalties.map((p) => `  • ${p.description}`).join('\n')}`);
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}
