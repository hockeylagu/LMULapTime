import React from 'react';
import type { RivalStatus } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';

export interface RivalInsightsProps {
  status: RivalStatus;
}

/** The gap to the rival over the player's last sessions. */
export const RivalInsights: React.FC<RivalInsightsProps> = ({ status }) => {
  const { gap, trend } = status;
  if (gap === null || !status.rival || trend.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-lmu-text-soft" aria-label="Gap after each session">
      <span
        className="text-lmu-muted mr-1"
        title="Your best lap in each of your last sessions here, minus your rival's lap time. Oldest on the left."
      >
        Your best per session, seconds behind (oldest → latest)
      </span>
      {trend.map((point, i) => (
        <React.Fragment key={point.sessionId}>
          {i > 0 && <span className="text-lmu-muted">→</span>}
          <span
            title={`${point.sessionName}: ${formatTime(point.best)}`}
            className={`font-mono ${point.gap <= 0 ? 'text-lmu-gain' : i === trend.length - 1 ? 'text-white font-bold' : 'text-lmu-muted'}`}
          >
            {point.gap <= 0 ? 'beaten' : point.gap.toFixed(2)}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};
