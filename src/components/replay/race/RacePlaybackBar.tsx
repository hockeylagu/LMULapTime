import React, { useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import type { RaceReplayCar, RaceReplayEvent } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/formatters.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { RACE_SPEEDS, type RaceClock } from './raceClock.js';
import { RaceIncidentSelect } from './RaceIncidentSelect.js';

interface Props {
  clock: RaceClock;
  events: RaceReplayEvent[];
  cars: ReadonlyMap<number, RaceReplayCar>;
  followSlot: number | null;
}

/** Play/pause, speed and the session timeline of the race replay, with the followed car's incidents. */
export const RacePlaybackBar: React.FC<Props> = ({ clock, events, cars, followSlot }) => {
  const tenth = useSyncExternalStore(clock.subscribe, () => Math.round(clock.getState().timeSec * 10));
  const playing = useSyncExternalStore(clock.subscribe, () => clock.getState().playing);
  const speed = useSyncExternalStore(clock.subscribe, () => clock.getState().speed);
  const timeSec = tenth / 10;
  const span = Math.max(1, clock.endSec - clock.startSec);

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-t border-lmu-border bg-lmu-strip px-4" data-testid="race-playback">
      <button type="button" onClick={() => clock.setPlaying(!playing)} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        className={`grid h-8 w-8 place-items-center rounded-md bg-lmu-card text-lmu-text hover:bg-lmu-cardHover ${FOCUS_RING}`}>
        {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
      </button>
      <div role="group" aria-label="Playback speed" className="flex items-center gap-0.5">
        {RACE_SPEEDS.map(value => (
          <button key={value} type="button" aria-pressed={speed === value} onClick={() => clock.setSpeed(value)}
            className={`h-7 rounded px-1.5 font-mono text-xs ${speed === value ? 'bg-lmu-card text-lmu-text' : 'text-lmu-muted hover:text-lmu-text-soft'} ${FOCUS_RING}`}>
            {value}x
          </button>
        ))}
      </div>
      <span className="w-20 text-right font-mono text-xs text-lmu-text-soft" aria-label="Session time">{formatElapsedSeconds(timeSec - clock.startSec)}</span>
      <div className="min-w-0 flex-1">
        <input type="range" aria-label="Session time" min={0} max={span} step={0.1} value={timeSec - clock.startSec}
          onChange={event => clock.seek(clock.startSec + Number(event.currentTarget.value))}
          className={`w-full accent-lmu-accent ${FOCUS_RING}`} />
      </div>
      <span className="w-20 font-mono text-xs text-lmu-muted">{formatElapsedSeconds(span)}</span>
      <RaceIncidentSelect events={events} cars={cars} followSlot={followSlot} startSec={clock.startSec} onSeek={clock.seek} />
    </div>
  );
};
