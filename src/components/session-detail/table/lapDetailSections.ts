import type { LapData } from '../../../../shared/types/index.js';
import { NON_REPRESENTATIVE_LABELS, describeLapGaps, describeLapTraffic } from '../../../utils/lapTrafficText.js';

export interface LapDetailSection {
  label: string;
  lines: string[];
}

/** How a lap with conditions is judged (shared/domain/lapConditions.ts). */
export const CONDITIONS_NOTE = 'judged against your other laps in the same conditions';

/** Rain as the replay records it (0-25). */
export const describeRain = (rain: number): string => `Rain ${rain}/25`;

/**
 * What happened on a lap beyond its times, grouped for the lap table's expanded row: the
 * conditions, why it is left out of the average, the cars around the driver, incidents, track
 * limits, penalties and the pit stop. Empty when there is nothing to add.
 */
export function lapDetailSections(lap: LapData): LapDetailSection[] {
  const sections: LapDetailSection[] = [];
  if (lap.conditions) {
    const lines = [
      ...(lap.conditions.rain !== undefined ? [describeRain(lap.conditions.rain)] : []),
      ...(lap.conditions.wetTyres ? ['On wet tyres'] : []),
    ];
    sections.push({ label: 'Conditions', lines: [`${lines.join(' · ')}: ${CONDITIONS_NOTE}`] });
  }
  if (lap.nonRepresentativeReason) {
    sections.push({ label: 'Left out of average', lines: [NON_REPRESENTATIVE_LABELS[lap.nonRepresentativeReason].title] });
  }
  const traffic = [...describeLapTraffic(lap.traffic), ...describeLapGaps(lap.traffic)];
  if (traffic.length > 0) sections.push({ label: 'Around you', lines: traffic });
  if (lap.incidents?.length) sections.push({ label: 'Incidents', lines: lap.incidents.map((i) => i.description) });
  if (lap.trackLimits?.length) sections.push({ label: 'Track limits', lines: lap.trackLimits.map((tl) => tl.description) });
  if (lap.penalties?.length) sections.push({ label: 'Penalties', lines: lap.penalties.map((p) => p.description) });
  if (lap.isPitStop && lap.pitStopDurationString) {
    sections.push({ label: 'Pit stop', lines: [`Estimated pit loss: ${lap.pitStopDurationString}`] });
  }
  return sections;
}

/** The incidents, track limits and penalties of a lap as one tooltip, or undefined when there are none. */
export function lapEventsTooltip(lap: LapData): string | undefined {
  const blocks: string[] = [];
  if (lap.incidentCount && lap.incidentCount > 0) {
    blocks.push(`Incidents (${lap.incidentCount}):\n${lap.incidents?.map((i) => `  • ${i.description}`).join('\n')}`);
  }
  if (lap.trackLimitCount && lap.trackLimitCount > 0) {
    blocks.push(`Track limits (${lap.trackLimitCount}):\n${lap.trackLimits?.map((tl) => `  • ${tl.description}`).join('\n')}`);
  }
  if (lap.penaltyCount && lap.penaltyCount > 0) {
    blocks.push(`Penalties (${lap.penaltyCount}):\n${lap.penalties?.map((p) => `  • ${p.description}`).join('\n')}`);
  }
  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}
