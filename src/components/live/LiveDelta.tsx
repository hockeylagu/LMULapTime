import { deltaTone, formatSignedDelta, UNKNOWN, type DeltaTone } from './liveFormat.js';

const TONE_CLASS: Record<DeltaTone, string> = {
  gain: 'text-lmu-gain',
  loss: 'text-lmu-loss',
  neutral: 'text-lmu-text',
};

interface LiveDeltaProps {
  seconds: number | null;
  /** Show the `s` unit after the value. */
  unit?: boolean;
}

/** A signed time delta in mono: green gain, red loss, the unknown mark (never 0) without a value. */
export function LiveDelta({ seconds, unit = true }: LiveDeltaProps) {
  if (seconds === null) return <span data-delta="unknown" className="text-lmu-muted">{UNKNOWN}</span>;
  const tone = deltaTone(seconds);
  return (
    <span data-delta={tone} className={TONE_CLASS[tone]}>
      {formatSignedDelta(seconds)}
      {unit && <span className="ml-[0.2em] text-[0.5em] font-normal text-lmu-text-soft">s</span>}
    </span>
  );
}
