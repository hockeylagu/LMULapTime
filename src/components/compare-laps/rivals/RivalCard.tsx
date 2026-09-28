import React from 'react';
import { Activity, ArrowLeftRight, Ghost, SkipForward, Target } from 'lucide-react';
import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import type { RivalState } from './useRival.js';
import { RivalInsights } from './RivalInsights.js';
import { RivalLadder } from './RivalLadder.js';
import { RivalDebriefPanel } from './RivalDebriefPanel.js';

export interface RivalCardProps {
  rival: RivalState;
  player: LeaderboardEntry | null;
  onCompare?: (entry: LeaderboardEntry) => void;
  onTelemetry?: (entry: LeaderboardEntry) => void;
}

const action = 'px-2.5 py-1 rounded-lg border border-lmu-border text-xs font-bold text-lmu-muted hover:text-white hover:border-lmu-accent/50 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-default';

/**
 * The next small step: a rival about 0.3% ahead (or a ghost time), the time still to find, how
 * much of it is closed, and one click to see where it is.
 */
export const RivalCard: React.FC<RivalCardProps> = ({ rival, player, onCompare, onTelemetry }) => {
  const { status, error } = rival;
  if (error) {
    return <p role="alert" className="px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">{error}</p>;
  }
  if (!status?.rival || !player || status.gap === null) return null;

  const { rival: target, rivalEntry, gap, progress } = status;
  const percent = (gap / target.targetTime) * 100;
  const telemetryReady = Boolean(rivalEntry?.bestLap.replayName && player.bestLap.replayName);

  return (
    <section aria-label="Your rival" className="bg-gradient-to-br from-amber-500/10 via-lmu-card/80 to-lmu-card/75 backdrop-blur-md border border-amber-400/20 p-6 rounded-2xl space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
            {target.kind === 'ghost' ? <Ghost className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}
            {target.kind === 'ghost' ? 'Ghost target' : target.pinned ? 'Your chosen rival' : 'Your rival'}
          </div>
          {target.kind === 'driver' && rivalEntry ? (
            <h3 className="text-xl font-extrabold text-white truncate">
              <span className="font-mono text-lmu-muted mr-2">P{rivalEntry.rank}</span>
              {rivalEntry.driverName}
            </h3>
          ) : (
            <h3 className="text-xl font-extrabold text-white">Your best, 0.2% faster</h3>
          )}
          <p className="text-xs text-lmu-muted">
            {target.kind === 'ghost'
              ? 'Nobody within 0.6% ahead: beat this time and the next driver comes into reach.'
              : `${rivalEntry?.bestLap.carType ?? ''} · ${formatTime(target.targetTime)}`}
          </p>
        </div>
        <div className="text-left md:text-right shrink-0">
          <div className="text-3xl font-extrabold font-mono text-amber-300 leading-none">
            {gap > 0 ? gap.toFixed(3) : 'Beaten'}
            {gap > 0 && <span className="text-sm text-lmu-muted ml-1">s</span>}
          </div>
          <div className="text-xs text-lmu-muted mt-1">
            {gap > 0 ? `to find · ${percent.toFixed(2)}% · you ${formatTime(player.bestLap.lapTime)}` : 'a new rival is on the way'}
          </div>
        </div>
      </div>

      {progress !== null && (
        <div>
          <div className="h-2 rounded-full bg-lmu-bg border border-lmu-border overflow-hidden" role="progressbar"
            aria-label="Gap closed since this rival was set" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-400" style={{ width: `${Math.max(2, progress * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-lmu-muted mt-1 font-mono">
            <span>set at {formatTime(target.startTime)}</span>
            <span>{Math.round(progress * 100)}% closed</span>
            <span>target {formatTime(target.targetTime)}</span>
          </div>
        </div>
      )}

      <RivalInsights status={status} player={player} />

      <div className="flex flex-wrap items-center gap-2">
        {rivalEntry && onCompare && (
          <button type="button" className={action} onClick={() => onCompare(rivalEntry)}>
            <ArrowLeftRight className="w-3.5 h-3.5" /> Compare laps
          </button>
        )}
        {rivalEntry && onTelemetry && (
          <button type="button" className={action} disabled={!telemetryReady} onClick={() => onTelemetry(rivalEntry)}
            title={telemetryReady ? 'Where the time is, corner by corner' : 'Telemetry needs the replay of both laps'}>
            <Activity className="w-3.5 h-3.5" /> Telemetry
          </button>
        )}
        <button type="button" className={action} onClick={rival.skip} title="Pick the next driver in reach instead">
          <SkipForward className="w-3.5 h-3.5" /> Another rival
        </button>
      </div>

      {rivalEntry && gap > 0 && telemetryReady && <RivalDebriefPanel player={player} rival={rivalEntry} />}

      <RivalLadder beaten={status.beaten} nextUp={status.nextUp} onPin={rival.pin} />
    </section>
  );
};
