import { Pin, Target } from 'lucide-react';
import { SLIPPING_SEC, SLIPPING_SESSIONS } from '../../../shared/domain/cornerAnalysis/habitFocus.js';

/** The shape of a habit tag (DESIGN.md, Status Pills): 4px radius, 10px bold tracked caps. */
export const HABIT_TAG = 'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 text-[10px] font-bold uppercase tracking-wider';

/** A corner whose cost sits well above its recent level: an amber warning tag, the same in the debrief and the corner trends. */
export function SlippingTag() {
  return (
    <span className={`${HABIT_TAG} border-lmu-warn-strong/30 bg-lmu-warn-strong/15 text-lmu-warn-soft`}
      title={`Its cost is at least ${SLIPPING_SEC.toFixed(2)} s a lap above its recent level in the last ${SLIPPING_SESSIONS} sessions`}>
      Slipping
    </span>
  );
}

/**
 * A focus corner's tag: a neutral chip, as a focus is a choice, not a warning (amber stays for Slipping and Try).
 * A target marks one of the 2 the rules picked, a pin the driver's own pick. Said once per corner.
 */
export function FocusTag({ focus, label, title }: { focus: 'focus' | 'pinned'; label: string; title?: string }) {
  const Icon = focus === 'pinned' ? Pin : Target;
  return (
    <span title={title} className={`${HABIT_TAG} border-lmu-rule bg-lmu-raised text-lmu-text-soft`}>
      <Icon aria-hidden="true" className="size-2.5 text-lmu-muted" />{label}
    </span>
  );
}
