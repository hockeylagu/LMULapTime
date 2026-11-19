import type { Gain, PassMarks } from './cornerInsight.js';

export const DASH = '–';
/** A pass's marks in words; a lap that does not count for another reason (contact, off pace) says so. */
export function marksText(marks: PassMarks, counts: boolean): string {
  const words = [marks.start && 'start', marks.pitLane && 'pit lane', marks.wet && 'wet', marks.traffic && 'traffic',
    marks.incident && 'incident', marks.invalid && 'invalid'].filter(Boolean);
  if (!counts && !marks.start && !marks.pitLane && !marks.invalid) words.push('not counted');
  return words.join(' · ');
}

/** Points closer than this (metres, km/h) to the faster car's are not worth a word. */
const SAME_M = 1;
const SAME_KMH = 0.5;

/**
 * What the faster pass does differently (the class's fastest usual, or the compare lap's pass):
 * "brakes 8 m later, +4 km/h min, throttle 6 m sooner".
 */
export function howText(gain: Pick<Gain, 'brakeM' | 'minSpeedKmh' | 'throttleM'>): string {
  const words: string[] = [];
  if (gain.brakeM !== null && Math.abs(gain.brakeM) >= SAME_M) words.push(`brakes ${Math.round(Math.abs(gain.brakeM))} m ${gain.brakeM > 0 ? 'later' : 'earlier'}`);
  if (gain.minSpeedKmh !== null && Math.abs(gain.minSpeedKmh) >= SAME_KMH) words.push(`${gain.minSpeedKmh > 0 ? '+' : '−'}${Math.round(Math.abs(gain.minSpeedKmh))} km/h min`);
  if (gain.throttleM !== null && Math.abs(gain.throttleM) >= SAME_M) words.push(`throttle ${Math.round(Math.abs(gain.throttleM))} m ${gain.throttleM < 0 ? 'sooner' : 'later'}`);
  return words.length ? words.join(', ') : 'same points';
}