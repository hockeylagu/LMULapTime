import React, { useContext } from 'react';
import { Repeat, Snail, Scan, X } from 'lucide-react';
import type { CornerSegmentComparison } from '../../../../utils/cornerAnalysis/types.js';
import { cornerName } from '../../../../utils/cornerAnalysis/helpers.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { formatTimeDelta, timeDeltaClass } from '../../analysis/CornerTableFormatters.js';
import { ReplayFullscreenControlsContext } from '../../inspector/replayFullscreenControls.js';

/** The playback rate the slow-motion toggle plays a corner at. */
export const CORNER_SLOW_SPEED = 0.5;

interface Props {
  corner: CornerSegmentComparison;
  /** Whether a comparison lap shows: the corner's time against it is shown. */
  compared: boolean;
  looping: boolean;
  onToggleLoop: () => void;
  onFrame: () => void;
  onClose: () => void;
}

const BUTTON = `flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${FOCUS_RING}`;
const toggleClass = (on: boolean) => `${BUTTON} ${on ? 'bg-lmu-raised text-lmu-text' : 'text-lmu-muted hover:text-lmu-text hover:bg-lmu-raised/50'}`;

/** The corner in focus over the 3D view: its loop, slow motion, the corner view, and the way out. It stands above the bottom row
 * (line legend, streaming card), which a narrow map panel fills. */
export const CornerFocusBar: React.FC<Props> = ({ corner, compared, looping, onToggleLoop, onFrame, onClose }) => {
  const playback = useContext(ReplayFullscreenControlsContext)?.playback;
  const slow = playback !== undefined && playback.speed < 1;
  return (
    <div data-testid="corner-focus-bar" onPointerDown={event => event.stopPropagation()}
      className="absolute bottom-12 left-1/2 z-20 flex w-max -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-lg border border-lmu-border bg-lmu-card px-1.5 py-1 shadow-lg">
      <span className="px-1.5 font-mono text-xs font-bold text-lmu-text" title={corner.title}>{cornerName(corner)}</span>
      {compared && <span className={`pr-1 font-mono text-xs ${timeDeltaClass(corner.timeDeltaSec)}`}>{formatTimeDelta(corner.timeDeltaSec)}</span>}
      <button type="button" aria-pressed={looping} onClick={onToggleLoop} className={toggleClass(looping)}
        title={looping ? 'Play the lap on from the corner' : 'Repeat the corner from entry to exit'}>
        <Repeat size={13} aria-hidden="true" />Loop
      </button>
      {playback && <button type="button" aria-pressed={slow} className={toggleClass(slow)}
        onClick={() => playback.onChangeSpeed(slow ? 1 : CORNER_SLOW_SPEED)}
        title={slow ? 'Play at full speed' : `Play at ${CORNER_SLOW_SPEED}x`}>
        <Snail size={13} aria-hidden="true" />Slow
      </button>}
      <button type="button" onClick={onFrame} className={toggleClass(false)} title="View the whole corner from outside the turn (orbit camera)">
        <Scan size={13} aria-hidden="true" />Corner view
      </button>
      <button type="button" onClick={onClose} aria-label="Leave corner focus" title="Leave corner focus" className={`${BUTTON} text-lmu-muted hover:text-lmu-text`}>
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
};
