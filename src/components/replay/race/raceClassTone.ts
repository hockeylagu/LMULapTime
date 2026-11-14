/** A car class's colour on the race map and tower: the hues of CarClassBadge. */
export interface RaceClassTone {
  fill: string;
  stroke: string;
  text: string;
  bar: string;
  /** The same hue as a colour value, for the minimap's dots. */
  hex: string;
}

const TONES: Record<string, RaceClassTone> = {
  Hyper: { fill: 'fill-lmu-loss', stroke: 'stroke-lmu-loss', text: 'text-lmu-loss', bar: 'bg-lmu-loss', hex: '#FB7185' },
  LMP2: { fill: 'fill-lmu-info', stroke: 'stroke-lmu-info', text: 'text-lmu-info', bar: 'bg-lmu-info', hex: '#38BDF8' },
  LMP2_ELMS: { fill: 'fill-lmu-info', stroke: 'stroke-lmu-info', text: 'text-lmu-info', bar: 'bg-lmu-info', hex: '#38BDF8' },
  LMP3: { fill: 'fill-lmu-purple', stroke: 'stroke-lmu-purple', text: 'text-lmu-purple', bar: 'bg-lmu-purple', hex: '#C084FC' },
  GT3: { fill: 'fill-lmu-gain', stroke: 'stroke-lmu-gain', text: 'text-lmu-gain', bar: 'bg-lmu-gain', hex: '#34D399' },
  GTE: { fill: 'fill-lmu-warn', stroke: 'stroke-lmu-warn', text: 'text-lmu-warn', bar: 'bg-lmu-warn', hex: '#FCD34D' },
};
const UNKNOWN: RaceClassTone = { fill: 'fill-lmu-muted', stroke: 'stroke-lmu-muted', text: 'text-lmu-muted', bar: 'bg-lmu-muted', hex: '#8D99AE' };

export const raceClassTone = (carClass?: string): RaceClassTone => TONES[carClass ?? ''] ?? UNKNOWN;
