import React from 'react';
import type { Leaderboard, LeaderboardEntry, LeaderboardScope } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { getPaceCategoryFromPercentage } from '../../../../shared/domain/paceCategory.js';
import { formatGap } from './leaderboardFormat.js';

export interface StandingHeaderProps {
  board: Leaderboard;
  /** Whether the board is the whole class or the player's car. */
  scope?: LeaderboardScope;
}

/** Below this many drivers the rank reads as a count, not a top percentage. */
const SMALL_FIELD = 10;

/** The rank a lap time would take among the other drivers of the board. */
export function rankForTime(board: Leaderboard, time: number, player: LeaderboardEntry): number {
  return board.entries.filter((e) => e !== player && e.bestLap.lapTime < time).length + 1;
}

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; title?: string }> = ({ label, value, hint, title }) => (
  <div className="rounded-xl border border-lmu-border bg-lmu-bg/60 px-3 py-2 min-w-0" title={title}>
    <div className="text-[10px] uppercase tracking-wider text-lmu-muted">{label}</div>
    <div className="text-lg font-extrabold font-mono text-white leading-tight truncate">{value}</div>
    {hint && <div className="text-[11px] text-lmu-muted truncate">{hint}</div>}
  </div>
);

/** Where the player stands on the board: rank, gaps, pace band, and the rank within reach. */
export const StandingHeader: React.FC<StandingHeaderProps> = ({ board, scope = 'class' }) => {
  const player = board.player;
  if (!player) {
    return (
      <p className="px-4 py-3 rounded-xl border border-lmu-border bg-lmu-bg/60 text-sm text-lmu-muted">
        You have no clean dry lap here in this {scope === 'car' ? 'car' : 'class'} yet: drive a few and you will appear on the board.
      </p>
    );
  }

  const field = board.entries.length;
  const topPercent = Math.max(1, Math.ceil((player.rank / field) * 100));
  // A share of a handful of drivers says little: small fields show their size instead.
  const rankHint = field === 1 ? 'only you so far' : field < SMALL_FIELD ? `of ${field} drivers` : `top ${topPercent}%`;
  const alien = board.benchmark?.targets.alienSec;
  const percent = alien ? (player.bestLap.lapTime / alien) * 100 : null;
  const tbRank = player.theoreticalBest !== null && player.theoreticalBest < player.bestLap.lapTime
    ? rankForTime(board, player.theoreticalBest, player)
    : null;
  const sectors = [
    { label: 'S1', rank: player.s1Rank },
    { label: 'S2', rank: player.s2Rank },
    { label: 'S3', rank: player.s3Rank },
  ];
  const worstRank = sectors.reduce<number | null>((worst, s) => (s.rank !== null && (worst === null || s.rank > worst) ? s.rank : worst), null);
  // The sector to work on first; none when all three rank the same.
  const weakest = sectors.every((s) => s.rank === sectors[0].rank) ? null : worstRank;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Your rank" value={<>P{player.rank}<span className="text-xs text-lmu-muted">/{field}</span></>} hint={rankHint} />
        <Stat
          label="Gap to P1"
          value={field === 1 ? '—' : player.rank === 1 ? 'Leader' : formatGap(player.gapToLeader)}
          hint={`${formatTime(player.bestLap.lapTime)} · ${player.bestLap.carType}`}
        />
        <Stat
          label="Vs alien target"
          title="Your best lap as a share of the community alien time: 100% is alien pace"
          value={percent !== null ? `${percent.toFixed(1)}%` : '—'}
          hint={percent !== null ? getPaceCategoryFromPercentage(percent) : 'no benchmark for this class'}
        />
        <Stat
          label="Theoretical best"
          title="Your best S1, S2 and S3 from any clean laps, added up"
          value={formatTime(player.theoreticalBest)}
          hint={tbRank !== null && tbRank < player.rank ? `would be P${tbRank}` : 'your best sectors combined'}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-lmu-muted" title="Your best sector against every driver's best sector">Best sector ranks</span>
        {sectors.map((s) => (
          <span
            key={s.label}
            className={`px-2 py-0.5 rounded-lg border font-mono font-bold ${
              s.rank !== null && s.rank === weakest
                ?'border-lmu-loss-strong/40 bg-lmu-loss-strong/10 text-lmu-loss-soft'
                : 'border-lmu-border bg-lmu-bg/60 text-white'
            }`}
            title={s.rank !== null && s.rank === weakest ? 'Your weakest sector: the most time to find' : undefined}
          >
            {s.label} {s.rank !== null ? `P${s.rank}` : '—'}
          </span>
        ))}
        <span className="text-lmu-muted ml-2" title="Your best average of three clean laps in one session, ranked">Race pace</span>
        <span className="px-2 py-0.5 rounded-lg border border-lmu-border bg-lmu-bg/60 font-mono font-bold text-white">
          {player.top3AverageRank !== null ? `P${player.top3AverageRank}` : '—'}
        </span>
      </div>
    </div>
  );
};
