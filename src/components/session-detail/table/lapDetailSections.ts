import type { LapData } from '../../../../shared/types/index.js';
import { describeLapTraffic, describeNonRepresentative, type LapPlaces } from '../../../utils/lapTrafficText.js';
import { describePitService, type EarlierDamage } from './pitStopText.js';

/** The pit stop an in-lap or its out-lap belongs to: a stop always spans both laps. */
export interface LapPitStop {
  inLap: LapData;
  outLapNum?: number;
  damageBefore?: EarlierDamage;
}

/** What the rest of the driver's race adds to a lap: the places it won or lost, the stop it is part of. */
export interface LapDetailContext {
  places?: LapPlaces;
  pitStop?: LapPitStop;
}

export interface LapDetailSection {
  label: string;
  lines: string[];
}

/** How a lap with conditions is judged (shared/domain/lapConditions.ts). */
export const CONDITIONS_NOTE = 'judged against your other laps in the same conditions';

/** Rain as the replay records it (0-25). */
export const describeRain = (rain: number): string => `Rain ${rain}/25`;

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
  const traffic = inPits ? [] : describeLapTraffic(lap.traffic, context.places);
  if (traffic.length > 0) sections.push({ label: 'Around you', lines: traffic });
  if (lap.incidents?.length) sections.push({ label: 'Incidents', lines: lap.incidents.map((i) => i.description) });
  if (lap.trackLimits?.length) sections.push({ label: 'Track limits', lines: lap.trackLimits.map((tl) => withoutTrackLimitsPrefix(tl.description)) });
  if (lap.penalties?.length) sections.push({ label: 'Penalties', lines: lap.penalties.map((p) => p.description) });
  const pitStop = context.pitStop ?? (lap.isPitStop ? { inLap: lap } : undefined);
  const pitLines = pitStop ? pitStopLines(pitStop) : [];
  if (pitLines.length > 0) sections.push({ label: 'Pit stop', lines: pitLines });
  return sections;
}

/** The stop on both of its laps, e.g. "Estimated pit loss: +100.1s (laps 14 and 15)", then the service. */
function pitStopLines({ inLap, outLapNum, damageBefore }: LapPitStop): string[] {
  const laps = outLapNum !== undefined ? ` (laps ${inLap.lapNum} and ${outLapNum})` : '';
  return [
    ...(inLap.pitStopDurationString ? [`Estimated pit loss: ${inLap.pitStopDurationString}${laps}`] : []),
    ...(inLap.pitService ? describePitService(inLap.pitService, damageBefore) : []),
  ];
}

/** The incidents, track limits and penalties of a lap as one tooltip, or undefined when there are none. */
export function lapEventsTooltip(lap: LapData): string | undefined {
  const blocks: string[] = [];
  if (lap.incidentCount && lap.incidentCount > 0) {
    blocks.push(`Incidents (${lap.incidentCount}):\n${lap.incidents?.map((i) => `  • ${i.description}`).join('\n')}`);
  }
  if (lap.trackLimitCount && lap.trackLimitCount > 0) {
    blocks.push(`Track limits (${lap.trackLimitCount}):\n${lap.trackLimits?.map((tl) => `  • ${withoutTrackLimitsPrefix(tl.description)}`).join('\n')}`);
  }
  if (lap.penaltyCount && lap.penaltyCount > 0) {
    blocks.push(`Penalties (${lap.penaltyCount}):\n${lap.penalties?.map((p) => `  • ${p.description}`).join('\n')}`);
  }
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}
