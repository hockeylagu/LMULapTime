import { useContext } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatTime } from '../../../../../shared/domain/formatters.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { ReplayFullscreenControlsContext } from '../../inspector/replayFullscreenControls.js';
import { Select } from '../../../common/dropdown/Select.js';

interface Props {
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  /** Lap clock at the cursor, from the lap's first sample. */
  elapsedSec: number;
  distanceM: number;
}

/** Play, speed and the cursor's lap time and distance, so fullscreen never needs the inspector header. */
export function GpsMapPlaybackStrip({ isPlaying = false, onTogglePlay, elapsedSec, distanceM }: Props) {
  const playback = useContext(ReplayFullscreenControlsContext)?.playback;
  return <div className="flex items-center gap-2">
    {onTogglePlay && <button type="button" onClick={onTogglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      className={`inline-flex h-7 w-7 items-center justify-center rounded bg-lmu-raised text-lmu-text hover:bg-lmu-raised/80 ${FOCUS_RING}`}>
      {isPlaying ? <Pause size={13} /> : <Play size={13} />}
    </button>}
    {playback && <Select<number> aria-label="Playback speed" value={playback.speed} onChange={playback.onChangeSpeed} mono
      options={playback.speeds.map(speed => ({ value: speed, label: `${speed}×` }))} />}
    <span className="font-mono text-[13px] tabular-nums text-lmu-text" title="Lap time at the cursor">
      {elapsedSec > 0 ? formatTime(elapsedSec) : '0:00.000'}
    </span>
    <span className="font-mono text-xs tabular-nums text-lmu-muted" title="Distance from the start line at the cursor">
      {Math.max(0, Math.round(distanceM)).toLocaleString('en-US')} m
    </span>
  </div>;
}
