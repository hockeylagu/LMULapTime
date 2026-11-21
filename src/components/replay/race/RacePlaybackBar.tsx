import React, { useMemo, useSyncExternalStore } from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
import type { RaceReplayCar, RaceReplayEvent, RaceReplayLap } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/timing/timeFormat.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { RACE_SPEEDS, type RaceClock } from './raceClock.js';
import { RaceIncidentSelect } from './RaceIncidentSelect.js';

interface Props {
  clock: RaceClock;
  events: RaceReplayEvent[];
  cars: ReadonlyMap<number, RaceReplayCar>;
  followSlot: number | null;
  /** Every car's laps: the timeline marks where the followed car's laps start. */
  laps: RaceReplayLap[];
  /** The frame the followed car starts from after waiting on the grid: Skip to start jumps there while the clock is before it. */
  raceStartSec?: number | null;
}

/** A start under this many seconds after the replay's does not need skipping to. */
const MIN_GRID_WAIT_SEC = 2;

/** The range thumb's width: the track it travels is the bar less half a thumb at each end. */
const THUMB_PX = 16;
/** At most this many lap numbers under the timeline; every lap keeps its tick. */
const MAX_LAP_LABELS = 20;

/** Play/pause, speed and the session timeline of the race replay, with the followed car's incidents. */
export const RacePlaybackBar: React.FC<Props> = ({ clock, events, cars, followSlot, laps, raceStartSec = null }) => {
  const tenth = useSyncExternalStore(clock.subscribe, () => Math.round(clock.getState().timeSec * 10));
  const playing = useSyncExternalStore(clock.subscribe, () => clock.getState().playing);
  const speed = useSyncExternalStore(clock.subscribe, () => clock.getState().speed);
  const timeSec = tenth / 10;
  const span = Math.max(1, clock.endSec - clock.startSec);
  const followedLaps = useMemo(() => laps.filter(lap => lap.slot === followSlot).sort((a, b) => a.startSec - b.startSec), [laps, followSlot]);
  const labelEvery = Math.max(1, Math.ceil(followedLaps.length / MAX_LAP_LABELS));
  const skipToStart = raceStartSec !== null && raceStartSec - clock.startSec >= MIN_GRID_WAIT_SEC && timeSec < raceStartSec - 0.1;
  const along = (sec: number) => `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${Math.max(0, Math.min(1, (sec - clock.startSec) / span))})`;

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-t border-lmu-border bg-lmu-strip px-4" data-testid="race-playback">
      <button type="button" onClick={() => clock.setPlaying(!playing)} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        className={`grid h-8 w-8 place-items-center rounded-md bg-lmu-card text-lmu-text hover:bg-lmu-cardHover ${FOCUS_RING}`}>
        {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
      </button>
      {skipToStart && (
        <button type="button" onClick={() => clock.seek(raceStartSec)} title="Skip the wait on the grid to where the followed car starts moving"
          className={`flex h-8 items-center gap-1.5 rounded-md bg-lmu-card px-2.5 text-xs text-lmu-text hover:bg-lmu-cardHover ${FOCUS_RING}`}>
          <SkipForward aria-hidden="true" className="h-3.5 w-3.5" />
          Skip to start
        </button>
      )}
      <div role="group" aria-label="Playback speed" className="flex items-center gap-0.5">
        {RACE_SPEEDS.map(value => (
          <button key={value} type="button" aria-pressed={speed === value} onClick={() => clock.setSpeed(value)}
            className={`h-7 rounded px-1.5 font-mono text-xs ${speed === value ? 'bg-lmu-card text-lmu-text' : 'text-lmu-muted hover:text-lmu-text-soft'} ${FOCUS_RING}`}>
            {value}x
          </button>
        ))}
      </div>
      <span className="w-20 text-right font-mono text-xs text-lmu-text-soft" aria-label="Session time">{formatElapsedSeconds(timeSec - clock.startSec)}</span>
      <div className="relative min-w-0 flex-1">
        <input type="range" aria-label="Session time" min={0} max={span} step={0.1} value={timeSec - clock.startSec}
          onChange={event => clock.seek(clock.startSec + Number(event.currentTarget.value))}
          className={`relative z-10 w-full accent-lmu-accent ${FOCUS_RING}`} />
        {/* Where the followed car's laps start, numbered under the timeline; drawn over the bar, clicks pass through. */}
        <div aria-hidden="true" data-testid="race-lap-ticks" className="pointer-events-none absolute inset-0 z-20">
          {followedLaps.map((lap, i) => (
            <span key={lap.lapNumber} className="absolute top-1/2 -translate-x-1/2" style={{ left: along(lap.startSec) }}>
              <span className="absolute -top-2 left-0 h-4 w-px bg-lmu-text/70" />
              {i % labelEvery === 0 && <span className="absolute left-0 top-2.5 -translate-x-1/2 font-mono text-[10px] leading-none text-lmu-muted">{lap.lapNumber}</span>}
            </span>
          ))}
        </div>
      </div>
      <span className="w-20 font-mono text-xs text-lmu-muted">{formatElapsedSeconds(span)}</span>
      <RaceIncidentSelect events={events} cars={cars} followSlot={followSlot} startSec={clock.startSec} onSeek={clock.seek} />
    </div>
  );
};
