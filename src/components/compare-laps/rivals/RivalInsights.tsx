import React from 'react';
import type { LeaderboardEntry, RivalStatus } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { formatGap } from '../leaderboard/leaderboardFormat.js';

export interface RivalInsightsProps {
  status: RivalStatus;
  player: LeaderboardEntry;
}

const SECTORS = [
  { key: 's1', label: 'S1' },
  { key: 's2', label: 'S2' },
  { key: 's3', label: 'S3' },
] as const;

/** Where the time to the rival is: sector by sector, in the player's best sectors, and over the last sessions. */
export const RivalInsights: React.FC<RivalInsightsProps> = ({ status, player }) => {
  const { gap, theoreticalGap, rivalEntry, trend } = status;
  if (gap === null || !status.rival) return null;

  // Sector gaps between the two laps (the player's best lap against the rival's).
  const sectorGaps = rivalEntry
    ? SECTORS.map((s) => {
        const yours = player.bestLap[s.key];
        const theirs = rivalEntry.bestLap[s.key];
        return { ...s, gap: yours !== null && theirs !== null ? yours - theirs : null };
      })
    : [];
  const worst = sectorGaps.reduce<(typeof sectorGaps)[number] | null>(
    (w, s) => (s.gap !== null && s.gap > 0 && (w === null || s.gap > (w.gap ?? 0)) ? s : w), null);

  let sectorsLine: React.ReactNode = null;
  if (theoreticalGap !== null && player.theoreticalBest !== null && gap > 0) {
    sectorsLine = theoreticalGap < 0 ? (
      <>
        Your best sectors add up to <span className="font-mono text-white">{formatTime(player.theoreticalBest)}</span>,{' '}
        <span className="font-mono text-emerald-400">{Math.abs(theoreticalGap).toFixed(3)} s</span> under your rival.
        You have already driven it, just not on one lap.
      </>
    ) : (
      <>
        Your best sectors close <span className="font-mono text-white">{Math.max(0, gap - theoreticalGap).toFixed(3)}</span> of the{' '}
        <span className="font-mono text-white">{gap.toFixed(3)} s</span>: the rest is new pace.
      </>
    );
  }

  return (
    <div className="space-y-2 text-xs text-slate-300">
      {sectorsLine && <p>{sectorsLine}</p>}
      {sectorGaps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lmu-muted">Lap vs lap</span>
          {sectorGaps.map((s) => (
            <span
              key={s.key}
              className={`px-2 py-0.5 rounded-lg border font-mono ${
                s === worst ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-lmu-border bg-lmu-bg/60'
              }`}
            >
              {s.label} {s.gap !== null ? formatGap(s.gap) : '—'}
            </span>
          ))}
          {worst && <span className="text-lmu-muted">most of it is in {worst.label}</span>}
        </div>
      )}
      {trend.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Gap after each session">
          <span className="text-lmu-muted mr-1">Gap after each session</span>
          {trend.map((point, i) => (
            <React.Fragment key={point.sessionId}>
              {i > 0 && <span className="text-lmu-muted">→</span>}
              <span
                title={`${point.sessionName}: ${formatTime(point.best)}`}
                className={`font-mono ${point.gap <= 0 ? 'text-emerald-400' : i === trend.length - 1 ? 'text-white font-bold' : 'text-slate-400'}`}
              >
                {point.gap <= 0 ? 'beaten' : point.gap.toFixed(2)}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
