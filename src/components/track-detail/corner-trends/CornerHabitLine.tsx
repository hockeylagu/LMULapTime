import React from 'react';
import type { CornerHabitTrend } from '../../../../shared/types/corners/cornerAnalysis.js';
import { cornerHabitText, sessionRefLabel } from './cornerHabitText.js';

/**
 * Under a corner trends row: the corner's main habit in the latest analysed session, how often it showed lately, and
 * the corner against the session before (the driver against themself).
 */
export const CornerHabitLine: React.FC<{ trend: CornerHabitTrend; className: string }> = ({ trend, className }) => {
  const text = cornerHabitText(trend);
  if (!text.habit && !text.since && !text.fixed) return null;
  return (
    <div className={`${className} space-y-0.5 text-[11px] leading-snug`} data-testid="corner-habit">
      {text.habit && (
        <p className="text-lmu-text-soft" title={`Your main habit here in ${sessionRefLabel(trend.session)}, against that session's reference`}>{text.habit}</p>
      )}
      {text.since && <p className="text-lmu-muted">{text.since}</p>}
      {text.fixed && <p className="text-lmu-gain">{text.fixed}</p>}
    </div>
  );
};
