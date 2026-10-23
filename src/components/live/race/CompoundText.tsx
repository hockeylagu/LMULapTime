import { COMPOUND_CLASS, compoundTone } from './livePlanFormat.js';

/** A tyre call with each compound word (SOFT, MED, MEDIUM, HARD, WET) in its sidewall colour; `NEW`, `USED` stay as they are. */
export function CompoundText({ text }: { text: string }) {
  return <>{text.split(' ').map((word, index) => {
    const tone = compoundTone(word === 'MED' ? 'MEDIUM' : word);
    return <span key={index} className={tone ? COMPOUND_CLASS[tone] : undefined}>{index ? ' ' : ''}{word}</span>;
  })}</>;
}
