import { Pin, Target } from 'lucide-react';
import { FOLLOWED_SEC, SLIPPING_SEC, SLIPPING_SESSIONS } from '../../../shared/domain/cornerAnalysis/habitFocus.js';

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

/** A cost in seconds with a true minus sign when the driver was quicker than the target. */
export function formatCostSec(sec: number): string {
  const shown = Math.abs(sec).toFixed(2);
  return sec < 0 && Number(shown) !== 0 ? `−${shown}` : shown;
}

/** Colour for a cost change over sessions: green when down, red when up, neutral within noise. */
export function costChangeTone(changeSec: number): string {
  return changeSec <= -FOLLOWED_SEC ? 'text-lmu-gain' : changeSec >= FOLLOWED_SEC ? 'text-lmu-loss' : 'text-lmu-text-soft';
}

interface CostSparklineProps {
  costs: readonly number[];
  tone: string;
  testId?: string;
}

/** Inline 5-session cost sparkline (lower on screen = lower cost = faster): muted line, only the latest dot wears the trend colour. */
export function CostSparkline({ costs, tone, testId = 'cost-sparkline' }: CostSparklineProps) {
  if (costs.length < 2) return null;
  const w = 52, h = 16, pad = 2.5;
  const min = Math.min(...costs), max = Math.max(...costs), span = max - min;
  const coords = costs.map((value, index) => {
    const x = pad + (index / (costs.length - 1)) * (w - pad * 2);
    const y = span < 1e-4 ? h / 2 : pad + ((max - value) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const points = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = coords[coords.length - 1];
  const label = `${costs.map(formatCostSec).join(' → ')} s/lap`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-4 w-13 shrink-0 self-center text-lmu-muted" role="img" aria-label={`Cost trend: ${label}`} data-testid={testId}>
      <title>{label}</title>
      <polyline fill="none" stroke="currentColor" strokeOpacity="0.65" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <circle cx={lastX} cy={lastY} r="2" fill="currentColor" className={tone} />
    </svg>
  );
}
