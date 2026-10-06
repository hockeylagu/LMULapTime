import React from 'react';
import type { ComparableLap } from '../../../../shared/types/index.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { SessionTypeChip } from '../../session-list/SessionRowParts.js';
import { formatGap } from '../board/leaderboardFormat.js';
import type { LapCondition, LapPickerSession } from './lapPickerModel.js';

/** Conditions as quiet text, with a hue only when the track was not dry (as on the session header). */
export const CONDITION_TEXT: Record<LapCondition, string> = {
  Dry: 'text-lmu-text-soft',
  Wet: 'text-lmu-azure',
  'Dynamic Weather': 'text-lmu-aqua',
};

/** Session, its best lap, then every lap: the columns of the picker's timing table. */
export const PICKER_ROW_GRID = 'grid grid-cols-[176px_168px_minmax(0,1fr)] gap-x-4';

interface CompareLapPickerSessionProps {
  session: LapPickerSession;
  comparedIds: readonly string[];
  /** The player's personal best on the layout: gold, ahead of the session best's sky. */
  personalBestId?: string | null;
  /** The lap time staying in the comparison; the session best shows its gap to it. */
  anchorLapTime?: number | null;
  onPick: (lap: ComparableLap) => void;
}

function lapStatus(lap: ComparableLap, clean: boolean): string | null {
  if (lap.isPitStop) return 'Pit stop';
  if (lap.isOutLap) return 'Out lap';
  if (!lap.isValid) return 'Invalid';
  if (lap.nonRepresentativeReason) return 'Not representative';
  return clean ? null : 'Start lap';
}

/** A lap's time text: gold for the personal best, sky for the session best, white when clean, grey otherwise. */
function timeTone(personalBest: boolean, sessionBest: boolean, clean: boolean): string {
  if (personalBest) return 'text-lmu-personal-best';
  if (sessionBest) return 'text-lmu-session-best';
  return clean ? 'text-lmu-text' : 'text-lmu-muted';
}

const gapTone = (gap: number) => (gap < -0.0005 ? 'text-lmu-gain' : gap > 0.0005 ? 'text-lmu-loss' : 'text-lmu-muted');

/** One session of the lap picker as a row: what and when, the best lap and its gap, then every lap to pick. */
export const CompareLapPickerSession: React.FC<CompareLapPickerSessionProps> = ({
  session,
  comparedIds,
  personalBestId = null,
  anchorLapTime = null,
  onPick,
}) => {
  const best = session.laps.find((l) => l.id === session.bestLapId) ?? null;
  const bestCompared = best ? comparedIds.includes(best.id) : false;
  const bestGap = best?.lapTime && anchorLapTime ? best.lapTime - anchorLapTime : null;
  const describe = (lap: ComparableLap, clean: boolean) => {
    const status = lapStatus(lap, clean);
    const gap = lap.lapTime && anchorLapTime ? ` · ${formatGap(lap.lapTime - anchorLapTime)} to the lap kept` : '';
    return `S1 ${formatTime(lap.s1)} · S2 ${formatTime(lap.s2)} · S3 ${formatTime(lap.s3)}${gap}${status ? ` · ${status}` : ''}`;
  };

  return (
    <li className={`${PICKER_ROW_GRID} items-start py-2.5`}>
      <div className="flex items-center gap-2 min-w-0 h-8">
        <SessionTypeChip session={{ sessionType: session.sessionType ?? '', sessionName: session.sessionName }} />
        <div className="min-w-0 leading-tight">
          <p className="font-mono text-xs text-lmu-text-soft truncate">{session.dateString?.slice(0, 16) ?? '—'}</p>
          {session.condition !== 'Dry' && <p className={`text-[11px] ${CONDITION_TEXT[session.condition]}`}>{session.condition}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 h-8">
        {best ? (
          <button
            type="button"
            disabled={bestCompared}
            onClick={() => onPick(best)}
            title={bestCompared ? 'Already in the comparison' : `Pick lap ${best.lapNum ?? '-'}, the session's best · ${describe(best, true)}`}
            aria-label={`Best lap ${best.lapNum ?? '-'} ${best.lapTimeString}${bestGap !== null ? `, ${formatGap(bestGap)} to the lap kept` : ''}${bestCompared ? ', compared' : ''}`}
            className={`-ml-2 inline-flex items-center gap-2 h-8 px-2 rounded-md border transition-colors ${FOCUS_RING} ${
              bestCompared
                ? 'border-dashed border-lmu-rule cursor-default'
                : 'border-transparent hover:bg-lmu-card hover:border-lmu-rule-strong cursor-pointer'
            }`}
          >
            <span className={`font-mono text-sm font-bold ${bestCompared ? 'text-lmu-muted' : best.id === personalBestId ? 'text-lmu-personal-best' : 'text-lmu-text'}`}>{best.lapTimeString}</span>
            {bestGap !== null && <span className={`font-mono text-[11px] font-bold ${gapTone(bestGap)}`}>{formatGap(bestGap)}</span>}
          </button>
        ) : (
          <span className="text-[11px] text-lmu-faint">No clean lap</span>
        )}
      </div>

      <ul aria-label={`Laps of ${session.sessionName || 'session'} ${session.dateString || ''}`.trim()} className="flex flex-wrap gap-1.5">
        {session.laps.map((lap) => {
          const compared = comparedIds.includes(lap.id);
          const personalBest = lap.id === personalBestId;
          const sessionBest = lap.id === session.bestLapId;
          const clean = session.cleanLapIds.has(lap.id);
          const status = lapStatus(lap, clean);
          const mark = personalBest ? ', personal best' : sessionBest ? ', session best' : '';
          return (
            <li key={lap.id}>
              <button
                type="button"
                disabled={compared}
                onClick={() => onPick(lap)}
                title={compared ? 'Already in the comparison' : describe(lap, clean)}
                aria-label={`Lap ${lap.lapNum ?? '-'} ${lap.lapTimeString}${mark}${status ? `, ${status.toLowerCase()}` : ''}${compared ? ', compared' : ''}`}
                className={`inline-flex items-center gap-2 h-8 w-[112px] px-2 rounded-md border font-mono transition-colors ${FOCUS_RING} ${
                  compared
                    ? 'border-dashed border-lmu-rule bg-transparent cursor-default'
                    : 'border-lmu-border bg-lmu-card hover:bg-lmu-card-hover hover:border-lmu-rule-strong cursor-pointer'
                }`}
              >
                <span className="w-6 text-right text-[11px] text-lmu-muted shrink-0">L{lap.lapNum ?? '-'}</span>
                <span className={`text-xs font-bold ${compared ? 'text-lmu-muted' : timeTone(personalBest, sessionBest, clean)}`}>{lap.lapTimeString}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
};
