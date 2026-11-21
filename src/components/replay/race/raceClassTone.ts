/** A car class's colour on the race map and tower: the hues of CarClassBadge. */
export interface RaceClassTone {
  fill: string;
  stroke: string;
  text: string;
  bar: string;
  /** The text and bar of a car out of the race or in the pits: the family's low-chroma `faded` step, not an opacity fade. */
  textFaded: string;
  barFaded: string;
  /** The same hue as a colour value, for the minimap's dots. */
  hex: string;
}

const TONES: Record<string, RaceClassTone> = {
  Hyper: { fill: 'fill-lmu-loss', stroke: 'stroke-lmu-loss', text: 'text-lmu-loss', bar: 'bg-lmu-loss', textFaded: 'text-lmu-loss-faded', barFaded: 'bg-lmu-loss-faded', hex: '#FB7185' },
  LMP2: { fill: 'fill-lmu-info', stroke: 'stroke-lmu-info', text: 'text-lmu-info', bar: 'bg-lmu-info', textFaded: 'text-lmu-info-faded', barFaded: 'bg-lmu-info-faded', hex: '#38BDF8' },
  LMP2_ELMS: { fill: 'fill-lmu-info', stroke: 'stroke-lmu-info', text: 'text-lmu-info', bar: 'bg-lmu-info', textFaded: 'text-lmu-info-faded', barFaded: 'bg-lmu-info-faded', hex: '#38BDF8' },
  LMP3: { fill: 'fill-lmu-purple', stroke: 'stroke-lmu-purple', text: 'text-lmu-purple', bar: 'bg-lmu-purple', textFaded: 'text-lmu-purple-faded', barFaded: 'bg-lmu-purple-faded', hex: '#C084FC' },
  GT3: { fill: 'fill-lmu-gain', stroke: 'stroke-lmu-gain', text: 'text-lmu-gain', bar: 'bg-lmu-gain', textFaded: 'text-lmu-gain-faded', barFaded: 'bg-lmu-gain-faded', hex: '#34D399' },
  GTE: { fill: 'fill-lmu-warn', stroke: 'stroke-lmu-warn', text: 'text-lmu-warn', bar: 'bg-lmu-warn', textFaded: 'text-lmu-warn-faded', barFaded: 'bg-lmu-warn-faded', hex: '#FCD34D' },
};
const UNKNOWN: RaceClassTone = { fill: 'fill-lmu-muted', stroke: 'stroke-lmu-muted', text: 'text-lmu-muted', bar: 'bg-lmu-muted', textFaded: 'text-lmu-faint', barFaded: 'bg-lmu-faint', hex: '#8D99AE' };

export const raceClassTone = (carClass?: string): RaceClassTone => TONES[carClass ?? ''] ?? UNKNOWN;
