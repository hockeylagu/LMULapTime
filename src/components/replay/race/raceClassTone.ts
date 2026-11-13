/** A car class's colour on the race map and tower: the hues of CarClassBadge. */
export interface RaceClassTone {
  fill: string;
  stroke: string;
  text: string;
  bar: string;
}

const TONES: Record<string, RaceClassTone> = {
  Hyper: { fill: 'fill-lmu-loss', stroke: 'stroke-lmu-loss', text: 'text-lmu-loss', bar: 'bg-lmu-loss' },
  LMP2: { fill: 'fill-lmu-info', stroke: 'stroke-lmu-info', text: 'text-lmu-info', bar: 'bg-lmu-info' },
  LMP2_ELMS: { fill: 'fill-lmu-info', stroke: 'stroke-lmu-info', text: 'text-lmu-info', bar: 'bg-lmu-info' },
  LMP3: { fill: 'fill-lmu-purple', stroke: 'stroke-lmu-purple', text: 'text-lmu-purple', bar: 'bg-lmu-purple' },
  GT3: { fill: 'fill-lmu-gain', stroke: 'stroke-lmu-gain', text: 'text-lmu-gain', bar: 'bg-lmu-gain' },
  GTE: { fill: 'fill-lmu-warn', stroke: 'stroke-lmu-warn', text: 'text-lmu-warn', bar: 'bg-lmu-warn' },
};
const UNKNOWN: RaceClassTone = { fill: 'fill-lmu-muted', stroke: 'stroke-lmu-muted', text: 'text-lmu-muted', bar: 'bg-lmu-muted' };

export const raceClassTone = (carClass?: string): RaceClassTone => TONES[carClass ?? ''] ?? UNKNOWN;
