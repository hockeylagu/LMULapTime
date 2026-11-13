import React, { useMemo, useSyncExternalStore } from 'react';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import type { RaceClock } from './raceClock.js';
import { raceStandingsAt, type RaceGap, type RaceStandingsIndex } from './raceStandings.js';
import { raceClassTone } from './raceClassTone.js';

/** The tower refreshes twice a second of replay time, not every frame. */
const STEPS_PER_SEC = 2;

export function formatRaceGap(gap: RaceGap | null, isRace: boolean): string {
  if (!gap) return '';
  if (gap.kind === 'leader') return isRace ? 'Leader' : '';
  if (gap.kind === 'laps') return `+${gap.laps} ${gap.laps === 1 ? 'lap' : 'laps'}`;
  if (gap.sec < 60) return `+${gap.sec.toFixed(3)}`;
  const tenths = Math.round(gap.sec * 10);
  const seconds = (tenths % 600) / 10;
  return `+${Math.floor(tenths / 600)}:${seconds.toFixed(1).padStart(4, '0')}`;
}

interface Props {
  index: RaceStandingsIndex;
  clock: RaceClock;
  followSlot: number | null;
  onFollow: (slot: number) => void;
  /** The row under the pointer or focus; the map shows that car's tooltip. */
  onHover: (slot: number | null) => void;
  className?: string;
}

/** The timing screen at the session clock: running order, class places, laps and gaps; a row follows its car. */
export const RaceStandingsTower: React.FC<Props> = ({ index, clock, followSlot, onFollow, onHover, className = '' }) => {
  const step = useSyncExternalStore(clock.subscribe, () => Math.floor(clock.getState().timeSec * STEPS_PER_SEC));
  const rows = useMemo(() => raceStandingsAt(index, step / STEPS_PER_SEC), [index, step]);

  return (
    <section aria-label="Standings" className={`flex min-h-0 flex-col border-l border-lmu-border bg-lmu-strip ${className}`}>
      <div className="grid grid-cols-[2.25rem_1fr_2.5rem_5.5rem] gap-2 border-b border-lmu-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-lmu-muted">
        <span>Pos</span><span>Driver</span><span className="text-right">Laps</span>
        <span className="text-right">{index.isRace ? 'Gap' : 'Best'}</span>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto" data-testid="race-standings">
        {rows.map(row => {
          const tone = raceClassTone(row.car.carClass);
          const followed = row.car.slot === followSlot;
          return (
            <li key={row.car.slot}>
              <button type="button" onClick={() => onFollow(row.car.slot)} aria-pressed={followed}
                onPointerEnter={() => onHover(row.car.slot)} onPointerLeave={() => onHover(null)}
                onFocus={() => onHover(row.car.slot)} onBlur={() => onHover(null)}
                className={`grid w-full grid-cols-[2.25rem_1fr_2.5rem_5.5rem] items-center gap-2 px-3 py-1 text-left text-xs hover:bg-lmu-card ${followed ? 'bg-lmu-card text-lmu-text' : 'text-lmu-text-soft'} ${FOCUS_RING}`}>
                <span className="flex items-center gap-1.5 font-mono">
                  <span aria-hidden="true" className={`h-3.5 w-1 rounded-sm ${tone.bar}`} />{row.position}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {row.car.carNumber && <span className={`shrink-0 font-mono ${tone.text}`}>#{row.car.carNumber}</span>}
                  <span className="truncate">{row.car.name}{row.car.isPlayer ? ' (You)' : ''}</span>
                </span>
                <span className="text-right font-mono">{row.lapsDone}</span>
                <span className="text-right font-mono">
                  {index.isRace ? formatRaceGap(row.gap, true) : row.bestLapSec !== null ? formatTime(row.bestLapSec) : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
