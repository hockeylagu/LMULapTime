import { FOLLOWED_SEC } from '../../../shared/domain/cornerAnalysis/habitFocus.js';

/** A cost in seconds with a true minus sign when the driver was quicker than the target. */
export function formatCostSec(sec: number): string {
  const shown = Math.abs(sec).toFixed(2);
  return sec < 0 && Number(shown) !== 0 ? `−${shown}` : shown;
}

/**
 * A cost up by at least this (s) reads red. Smaller rises stay neutral (driver, 2026-11-21: progress should not read
 * overly negative; one session's rise is often race against qualifying, and Slipping already flags a lasting one).
 */
export const COST_RISE_RED_SEC = 0.15;

/** Colour for a cost change over sessions: green when down from FOLLOWED_SEC, red only for a big rise, neutral otherwise. */
export function costChangeTone(changeSec: number): string {
  return changeSec <= -FOLLOWED_SEC ? 'text-lmu-gain' : changeSec >= COST_RISE_RED_SEC ? 'text-lmu-loss' : 'text-lmu-text-soft';
}

interface CostSparklineProps {
  costs: readonly number[];
  tone: string;
  testId?: string;
}

/**
 * Inline 5-session cost sparkline (higher on screen = lower cost = faster, the same way up as the corner trend graph):
 * muted line, only the latest dot wears the trend colour.
 */
export function CostSparkline({ costs, tone, testId = 'cost-sparkline' }: CostSparklineProps) {
  if (costs.length < 2) return null;
  const w = 52, h = 16, pad = 2.5;
  const min = Math.min(...costs), max = Math.max(...costs), span = max - min;
  const coords = costs.map((value, index) => {
    const x = pad + (index / (costs.length - 1)) * (w - pad * 2);
    const y = span < 1e-4 ? h / 2 : pad + ((value - min) / span) * (h - pad * 2);
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
