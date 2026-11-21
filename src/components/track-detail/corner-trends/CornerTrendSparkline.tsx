import React from 'react';
import type { CornerTrend } from '../../../../shared/types/corners/cornerTrends.js';
import { formatCornerSec, graphTopSec, sessionMark, type SessionMark } from './cornerTrendRows.js';

const WIDTH = 320;
const HEIGHT = 48;
const PAD_X = 6;
const PAD_Y = 6;

/** The graph's box: at most 360 px wide so a trend still reads as a slope, centred in its column. */
export const SPARKLINE_BOX = 'w-full max-w-[360px] mx-auto';

export const dateOf = (timestamp: number) => new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const MARK_SHAPES: Record<SessionMark, string> = {
  race: 'rounded-full bg-current',
  qualifying: 'rotate-45 bg-current',
  practice: 'rounded-full border border-current bg-lmu-card',
};

/** A session's mark in the current colour: race filled, qualifying a diamond, practice hollow; the latest one larger. */
const SessionMarkGlyph: React.FC<{ mark: SessionMark; large?: boolean }> = ({ mark, large = false }) => (
  <span className={`block ${large ? 'w-2 h-2' : 'w-1.5 h-1.5'} ${MARK_SHAPES[mark]}`} data-mark={mark} />
);

/**
 * The driver's usual time through a corner, one mark per session in date order, quicker higher, in grey; only the
 * latest mark wears the row's trend colour (`toneClass`), as a whole red or green line read as too loud (driver,
 * 2026-11-19), and no band behind the recent sessions. Each mark's shape is its session type and it names the session
 * on hover. The reference (the target's usual) is the dashed line.
 */
export const CornerTrendSparkline: React.FC<{ corner: CornerTrend; toneClass: string; spanSec: number }> = ({ corner, toneClass, spanSec }) => {
  const { points, reference } = corner;
  const top = graphTopSec(corner) ?? 0;
  const x = (index: number) => (points.length < 2 ? WIDTH / 2 : PAD_X + (index / (points.length - 1)) * (WIDTH - 2 * PAD_X));
  // Quicker higher, the reference line on top as the goal (driver, 2026-11-19; the target since 2026-11-21); every row
  // shares `spanSec` (`sharedGraphSpanSec`), so a mark's distance below the line is its gap, the same height on every row.
  const y = (sec: number) => PAD_Y + Math.min(1, (sec - top) / spanSec) * (HEIGHT - 2 * PAD_Y);
  const line = points.map((point, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(point.usualSec).toFixed(1)}`).join(' ');

  return (
    <div className={`relative ${SPARKLINE_BOX} h-12 text-lmu-muted`} data-testid="corner-trend-sparkline">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full block" preserveAspectRatio="none" aria-hidden="true">
        {reference && (
          <line x1={0} x2={WIDTH} y1={y(reference.usualSec)} y2={y(reference.usualSec)} className="stroke-lmu-muted"
            strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" data-testid="corner-trend-reference" />
        )}
        {points.length > 1 && (
          <path d={line} fill="none" stroke="currentColor" strokeWidth={1} strokeOpacity={0.7} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Marks are HTML so the stretched SVG never squashes them; the larger span is the hover target. */}
      {points.map((point, index) => (
        <span
          key={point.sessionId}
          className={`absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center ${index === points.length - 1 ? toneClass : ''}`}
          style={{ left: `${(x(index) / WIDTH) * 100}%`, top: `${(y(point.usualSec) / HEIGHT) * 100}%` }}
          title={`${dateOf(point.timestamp)} · ${point.sessionType} · ${point.carType}\nUsual ${formatCornerSec(point.usualSec)} s, best ${formatCornerSec(point.bestSec)} s (${point.passCount} ${point.passCount === 1 ? 'lap' : 'laps'})`}
          data-testid="corner-trend-point"
        >
          <SessionMarkGlyph mark={sessionMark(point.sessionType, point.sessionName)} large={index === points.length - 1} />
        </span>
      ))}
    </div>
  );
};
