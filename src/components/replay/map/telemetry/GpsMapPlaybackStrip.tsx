import { useContext } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { formatTime } from '../../../../../shared/domain/formatters.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { ReplayFullscreenControlsContext } from '../../inspector/replayFullscreenControls.js';
import { Select } from '../../../common/dropdown/Select.js';

interface Props {
  /** Default: the lap view's playback (the controls context). */
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  /** Lap clock at the cursor, from the lap's first sample. */
  elapsedSec: number;
  distanceM: number;
  /** Previous / next recorded sample. */
  onStep?: (delta: -1 | 1) => void;
  atStart?: boolean;
  atEnd?: boolean;
  /** The telemetry column's 24px toolbar; the fullscreen trace's row is 28px. */
  compact?: boolean;
}

/** The lap view's playback, in the telemetry toolbar and the fullscreen trace alike: step, play, speed and the cursor's lap time and distance. */
export function GpsMapPlaybackStrip({ isPlaying, onTogglePlay, elapsedSec, distanceM, onStep, atStart = false, atEnd = false, compact = false }: Props) {
  const playback = useContext(ReplayFullscreenControlsContext)?.playback;
  const playing = isPlaying ?? playback?.isPlaying ?? false;
  const togglePlay = onTogglePlay ?? playback?.onTogglePlay;
  const box = compact ? 'h-6 w-6' : 'h-7 w-7';
  const step = `inline-flex ${box} items-center justify-center rounded-lg text-lmu-muted hover:bg-lmu-raised hover:text-lmu-text disabled:text-lmu-faint disabled:hover:bg-transparent ${FOCUS_RING}`;
  const value = compact ? 'text-[11px]' : 'text-xs';
  return <div role="group" aria-label="Playback" className="flex items-center gap-1">
    {onStep && <button type="button" onClick={() => onStep(-1)} disabled={atStart} className={step}
      title="Previous sample (Left Arrow, Shift for 0.5 s)" aria-label="Step backward"><ChevronLeft size={14} /></button>}
    {togglePlay && <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}
      className={`inline-flex ${box} items-center justify-center rounded-lg bg-lmu-raised text-lmu-text hover:bg-lmu-raised/80 ${FOCUS_RING}`}>
      {playing ? <Pause size={13} /> : <Play size={13} />}
    </button>}
    {onStep && <button type="button" onClick={() => onStep(1)} disabled={atEnd} className={step}
      title="Next sample (Right Arrow, Shift for 0.5 s)" aria-label="Step forward"><ChevronRight size={14} /></button>}
    {playback && <Select<number> aria-label="Playback speed" title="Playback speed: , slower, . faster" value={playback.speed} onChange={playback.onChangeSpeed} mono
      size={compact ? 'compact' : 'default'} className="ml-1" options={playback.speeds.map(speed => ({ value: speed, label: `${speed}×` }))} />}
    <span className={`ml-2 inline-block w-[9ch] whitespace-nowrap text-right font-mono ${value} tabular-nums text-lmu-text`} title="Lap time at the cursor">
      {elapsedSec > 0 ? formatTime(elapsedSec) : '0:00.000'}
    </span>
    <span className={`inline-block w-[9ch] whitespace-nowrap text-right font-mono ${value} tabular-nums text-lmu-muted`} title="Distance from the start line at the cursor">
      {Math.max(0, Math.round(distanceM)).toLocaleString('en-US')} m
    </span>
  </div>;
}
