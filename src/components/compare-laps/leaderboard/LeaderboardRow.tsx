import React from 'react';
import { ArrowLeftRight, Activity, Crosshair } from 'lucide-react';
import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import type { LeaderboardRow as Row } from './leaderboardRows.js';
import { formatDrivenAgo, formatGap } from './leaderboardFormat.js';

export const LEADERBOARD_COLUMNS = 10;

export interface LeaderboardRowProps {
  row: Row;
  player: LeaderboardEntry | null;
  onShowAll: () => void;
  onCompare?: (entry: LeaderboardEntry) => void;
  onTelemetry?: (entry: LeaderboardEntry) => void;
  /** The player's current rival. */
  isRival?: boolean;
  onPin?: (driverName: string) => void;
}

const SectorCell: React.FC<{ time: number | null; rank: number | null }> = ({ time, rank }) => (
  <td className="px-2 py-1.5 font-mono text-right whitespace-nowrap">
    <span className={rank === 1 ? 'text-purple-300 font-bold' : 'text-slate-300'}>{time !== null ? time.toFixed(3) : '—'}</span>
    {rank !== null && <span className="ml-1 text-[10px] text-lmu-muted">P{rank}</span>}
  </td>
);

/** One row of the board: a driver, a benchmark band, or the drivers a compact board hides. */
export const LeaderboardRow: React.FC<LeaderboardRowProps> = ({ row, player, onShowAll, onCompare, onTelemetry, isRival, onPin }) => {
  if (row.kind === 'band') {
    return (
      <tr aria-label={`${row.label} pace, ${row.percent}%`}>
        <td colSpan={LEADERBOARD_COLUMNS} className="px-2 py-0.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-lmu-muted">
            <span className="flex-1 border-t border-dashed border-slate-600" />
            <span>{row.percent}% {row.label}</span>
            <span className="font-mono normal-case">{formatTime(row.time)}</span>
            <span className="flex-1 border-t border-dashed border-slate-600" />
          </div>
        </td>
      </tr>
    );
  }

  if (row.kind === 'hidden') {
    return (
      <tr>
        <td colSpan={LEADERBOARD_COLUMNS} className="px-2 py-1 text-center">
          <button type="button" onClick={onShowAll} className="text-[11px] text-lmu-muted hover:text-white cursor-pointer">
            ··· {row.count} more driver{row.count === 1 ? '' : 's'} ···
          </button>
        </td>
      </tr>
    );
  }

  const { entry } = row;
  const vsYou = player && !entry.isPlayer ? entry.bestLap.lapTime - player.bestLap.lapTime : null;
  const hasTelemetry = Boolean(entry.bestLap.replayName && player?.bestLap.replayName);
  const canPin = Boolean(onPin && !isRival && vsYou !== null && vsYou < 0);
  const rowClass = entry.isPlayer
    ? 'bg-amber-400/10 text-white'
    : isRival
      ? 'bg-amber-400/5 text-white shadow-[inset_3px_0_0_0_rgba(251,191,36,0.8)]'
      : 'hover:bg-white/[0.03] text-slate-200';
  return (
    <tr className={rowClass}>
      <td className="px-2 py-1.5 font-mono font-bold text-right w-10">{row.rank ?? '—'}</td>
      <td className="px-2 py-1.5 max-w-[14rem]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate ${entry.isPlayer ? 'font-extrabold text-amber-300' : 'font-semibold'}`}>{entry.driverName}</span>
          {entry.isPlayer && <span className="text-[9px] font-bold uppercase px-1 rounded bg-amber-400/20 text-amber-300">You</span>}
          {isRival && <span className="text-[9px] font-bold uppercase px-1 rounded border border-amber-400/50 text-amber-300">Rival</span>}
        </div>
        <div className="text-[10px] text-lmu-muted truncate">{entry.bestLap.carType} · {formatDrivenAgo(entry.bestLap.timestamp)}</div>
      </td>
      <td className="px-2 py-1.5 font-mono font-bold text-right">{formatTime(entry.bestLap.lapTime)}</td>
      <td className="px-2 py-1.5 font-mono text-right text-lmu-muted">{entry.rank === 1 ? '' : formatGap(entry.gapToLeader)}</td>
      <td className={`px-2 py-1.5 font-mono text-right ${vsYou === null ? '' : vsYou < 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
        {vsYou === null ? '' : formatGap(vsYou)}
      </td>
      <SectorCell time={entry.bestS1} rank={entry.s1Rank} />
      <SectorCell time={entry.bestS2} rank={entry.s2Rank} />
      <SectorCell time={entry.bestS3} rank={entry.s3Rank} />
      <td className="px-2 py-1.5 font-mono text-right text-slate-300">{formatTime(entry.top3Average)}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        {canPin && (
          <button
            type="button"
            onClick={() => onPin?.(entry.driverName)}
            title={`Make ${entry.driverName} your rival`}
            aria-label={`Make ${entry.driverName} your rival`}
            className="p-1 rounded-lg text-lmu-muted hover:text-amber-300 hover:bg-lmu-border cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        )}
        {!entry.isPlayer && onCompare && (
          <button
            type="button"
            onClick={() => onCompare(entry)}
            title={`Compare your best lap with ${entry.driverName}'s`}
            aria-label={`Compare with ${entry.driverName}`}
            className="p-1 rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-border cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
        )}
        {!entry.isPlayer && onTelemetry && (
          <button
            type="button"
            onClick={() => onTelemetry(entry)}
            disabled={!hasTelemetry}
            title={hasTelemetry ? `Open the telemetry of your best lap against ${entry.driverName}'s` : 'Telemetry needs the replay of both laps'}
            aria-label={`Telemetry against ${entry.driverName}`}
            className="p-1 rounded-lg text-lmu-muted enabled:hover:text-sky-300 enabled:hover:bg-lmu-border enabled:cursor-pointer disabled:opacity-30"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
};
