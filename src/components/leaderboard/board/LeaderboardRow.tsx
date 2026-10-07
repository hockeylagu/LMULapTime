import React from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeftRight, Activity, Crosshair, FileText, SquareCheck, SquarePlus } from 'lucide-react';
import type { ReferenceLaptimeEntry } from '../../../../shared/types/index.js';
import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { PaceBadge } from '../../common/PaceBadge.js';
import { CarLogo } from '../../vehicle/index.js';
import type { LeaderboardRow as Row } from './leaderboardRows.js';
import { benchmarkPace, formatDrivenAgo, formatGap } from './leaderboardFormat.js';
import { boardLapTelemetryRef } from './leaderboardLaps.js';
import { buildTelemetryComparePath } from '../../../utils/telemetryCompareLink.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { linkClickHandler } from '../../../utils/linkClick.js';

export const LEADERBOARD_COLUMNS = 11;

export interface LeaderboardRowProps {
  row: Row;
  player: LeaderboardEntry | null;
  /** The board's benchmark, to rate each best lap's pace. */
  benchmark: ReferenceLaptimeEntry | null;
  onShowAll: () => void;
  onCompare?: (entry: LeaderboardEntry) => void;
  onTelemetry?: (entry: LeaderboardEntry) => void;
  /** The player's current rival. */
  isRival?: boolean;
  onPin?: (driverName: string) => void;
  /** Whether this driver's best lap is in the comparison. */
  isCompared?: boolean;
  onPick?: (entry: LeaderboardEntry) => void;
  /** Opens the session of the player's best lap. */
  onOpenSession?: (sessionId: string) => void;
}

const ICON_BUTTON = `w-6 h-6 inline-flex items-center justify-center rounded-lg cursor-pointer hover:bg-lmu-border ${FOCUS_RING}`;
/** The row's secondary actions show on hover or keyboard focus, and always on touch screens. */
const REVEAL = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100';

/** The best-sector colour of each sector, as the session lap table marks them. */
const SECTOR_BEST_CLASS = ['text-lmu-gold', 'text-lmu-blue', 'text-lmu-green'] as const;

const SectorCell: React.FC<{ sector: 0 | 1 | 2; time: number | null; rank: number | null }> = ({ sector, time, rank }) => (
  <td className="px-3 py-2 text-right whitespace-nowrap">
    <span className={rank === 1 ? `${SECTOR_BEST_CLASS[sector]} font-bold` : 'text-lmu-text-soft'}>{time !== null ? formatTime(time) : '—'}</span>
    {rank !== null && <span className="ml-1 text-[11px] text-lmu-muted">P{rank}</span>}
  </td>
);

/** One row of the board: a driver, a benchmark band, or the drivers a compact board hides. */
export const LeaderboardRow: React.FC<LeaderboardRowProps> = ({
  row, player, benchmark, onShowAll, onCompare, onTelemetry, isRival, onPin, isCompared = false, onPick, onOpenSession,
}) => {
  if (row.kind === 'band') {
    return (
      <tr aria-label={`${row.label} pace, ${row.percent}%`}>
        <td colSpan={LEADERBOARD_COLUMNS} className="px-2 py-0.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-lmu-muted">
            <span className="flex-1 border-t border-dashed border-lmu-rule-strong" />
            <span>{row.percent}% {row.label}</span>
            <span className="font-mono normal-case">{formatTime(row.time)}</span>
            <span className="flex-1 border-t border-dashed border-lmu-rule-strong" />
          </div>
        </td>
      </tr>
    );
  }

  if (row.kind === 'hidden') {
    return (
      <tr>
        <td />
        <td colSpan={LEADERBOARD_COLUMNS - 1} className="px-3 py-0.5">
          <button
            type="button"
            onClick={onShowAll}
            className={`text-[11px] text-lmu-faint hover:text-white hover:underline underline-offset-2 rounded cursor-pointer ${FOCUS_RING}`}
          >
            {row.count} more driver{row.count === 1 ? '' : 's'}
          </button>
        </td>
      </tr>
    );
  }

  const { entry } = row;
  const vsYou = player && !entry.isPlayer ? entry.bestLap.lapTime - player.bestLap.lapTime : null;
  const hasTelemetry = Boolean(entry.bestLap.replayName && player?.bestLap.replayName);
  const canPin = Boolean(onPin && !isRival && vsYou !== null && vsYou < 0);
  const pace = benchmarkPace(entry.bestLap.lapTime, benchmark);
  const [searchParams] = useSearchParams();
  const telemetryPath = React.useMemo(() => {
    if (!hasTelemetry || !player) return null;
    const yours = boardLapTelemetryRef(player);
    if (!yours) return null;
    if (entry.isPlayer) {
      return buildTelemetryComparePath(searchParams, yours, null);
    }
    const theirs = boardLapTelemetryRef(entry);
    return theirs ? buildTelemetryComparePath(searchParams, yours, theirs) : null;
  }, [hasTelemetry, player, entry, searchParams]);

  // Your row is the one to find at a glance: the identity red; the rival is told by its tag alone.
  const rowClass = entry.isPlayer ? 'bg-lmu-accent/10 text-white' : 'hover:bg-white/[0.03] text-lmu-text';
  // Your own row has no Compare, so its few actions stay in view.
  const reveal = entry.isPlayer ? '' : REVEAL;
  return (
    <tr className={`group ${rowClass}`}>
      <td className={`px-3 py-2 font-bold w-10 ${entry.isPlayer ? 'text-lmu-accent-text' : 'text-white'}`}>{row.rank ?? '—'}</td>
      <td className="px-3 py-2 max-w-[14rem] font-sans">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`truncate ${entry.isPlayer ? 'font-extrabold text-white' : 'font-semibold'}`} title={entry.driverName}>{entry.driverName}</span>
          {entry.isPlayer && <span className="text-[11px] font-bold px-1.5 rounded bg-lmu-accent/20 text-lmu-accent-soft shrink-0">You</span>}
          {isRival && <span className="text-[10px] font-bold uppercase tracking-wider px-1 rounded border border-lmu-warn/50 text-lmu-warn-soft shrink-0">Rival</span>}
        </div>
        <div className="text-[11px] text-lmu-muted truncate flex items-center gap-1.5" title={entry.bestLap.carType}>
          <CarLogo carType={entry.bestLap.carType} size="xs" decorative />
          <span className="truncate">{entry.bestLap.carType}</span>
          <span>·</span>
          <span className="shrink-0">{formatDrivenAgo(entry.bestLap.timestamp)}</span>
        </div>
      </td>
      <td className="px-3 py-2 font-bold text-right text-white">{formatTime(entry.bestLap.lapTime)}</td>
      <td className="px-3 py-2 text-center font-sans">
        {pace ? <PaceBadge category={pace.category} percentage={pace.percentage} showPercentage size="xs" /> : <span className="text-lmu-muted">-</span>}
      </td>
      <td className="px-3 py-2 text-right text-lmu-muted">{entry.rank === 1 ? '' : formatGap(entry.gapToLeader)}</td>
      <td className={`px-3 py-2 text-right ${vsYou === null ? '' : vsYou < 0 ? 'text-lmu-warn-soft' : 'text-lmu-gain'}`}>
        {vsYou === null ? '' : formatGap(vsYou)}
      </td>
      <SectorCell sector={0} time={entry.bestS1} rank={entry.s1Rank} />
      <SectorCell sector={1} time={entry.bestS2} rank={entry.s2Rank} />
      <SectorCell sector={2} time={entry.bestS3} rank={entry.s3Rank} />
      <td className="px-3 py-2 text-right text-lmu-text-soft">{formatTime(entry.top3Average)}</td>
      <td className="px-2 py-2 text-right whitespace-nowrap font-sans">
        <div className="inline-flex items-center justify-end gap-0.5">
          {onPick && (
            <button
              type="button"
              onClick={() => onPick(entry)}
              aria-pressed={isCompared}
              title={isCompared ? `Take ${entry.driverName}'s lap out of the comparison` : `Add ${entry.driverName}'s best lap to the comparison`}
              aria-label={`Pick ${entry.driverName}'s lap to compare`}
              className={`${ICON_BUTTON} ${isCompared ? 'text-lmu-accent-text' : `text-lmu-muted hover:text-white ${reveal}`}`}
            >
              {isCompared ? <SquareCheck className="w-3.5 h-3.5" /> : <SquarePlus className="w-3.5 h-3.5" />}
            </button>
          )}
          {canPin && (
            <button
              type="button"
              onClick={() => onPin?.(entry.driverName)}
              title={`Make ${entry.driverName} your rival`}
              aria-label={`Make ${entry.driverName} your rival`}
              className={`${ICON_BUTTON} text-lmu-muted hover:text-lmu-warn-soft ${reveal}`}
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          )}
          {entry.isPlayer && (
            <Link
              to={`/session/${encodeURIComponent(entry.bestLap.sessionId)}`}
              onClick={linkClickHandler(onOpenSession ? () => onOpenSession(entry.bestLap.sessionId) : undefined)}
              title={`Open the session of your best lap (${entry.bestLap.sessionName})`}
              aria-label="Open the session of your best lap"
              className={`${ICON_BUTTON} text-lmu-muted hover:text-white`}
            >
              <FileText className="w-3.5 h-3.5" />
            </Link>
          )}
          {onTelemetry && (
            telemetryPath ? (
              <Link
                to={telemetryPath}
                onClick={linkClickHandler(() => onTelemetry(entry))}
                title={entry.isPlayer ? 'Open the telemetry of your best lap' : `Open the telemetry of your best lap against ${entry.driverName}'s`}
                aria-label={entry.isPlayer ? 'Telemetry of your best lap' : `Telemetry against ${entry.driverName}`}
                className={`${ICON_BUTTON} text-lmu-muted hover:text-lmu-info-soft ${reveal}`}
              >
                <Activity className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onTelemetry(entry)}
                disabled={!hasTelemetry}
                title={
                  !hasTelemetry
                    ? entry.isPlayer ? 'Telemetry needs the replay of your lap' : 'Telemetry needs the replay of both laps'
                    : entry.isPlayer ? 'Open the telemetry of your best lap' : `Open the telemetry of your best lap against ${entry.driverName}'s`
                }
                aria-label={entry.isPlayer ? 'Telemetry of your best lap' : `Telemetry against ${entry.driverName}`}
                className={`${ICON_BUTTON} text-lmu-muted enabled:hover:text-lmu-info-soft disabled:text-lmu-faint disabled:cursor-default ${reveal}`}
              >
                <Activity className="w-3.5 h-3.5" />
              </button>
            )
          )}
          {!entry.isPlayer && onCompare && (
            <button
              type="button"
              onClick={() => onCompare(entry)}
              title={`Compare your best lap with ${entry.driverName}'s`}
              aria-label={`Compare with ${entry.driverName}`}
              className={`ml-1 h-6 px-2 inline-flex items-center gap-1 rounded-md border border-lmu-border text-[11px] font-semibold text-lmu-text-soft hover:text-white hover:border-lmu-rule-strong cursor-pointer ${FOCUS_RING}`}
            >
              <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
              Compare
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
