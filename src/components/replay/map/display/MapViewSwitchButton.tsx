import React from 'react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

export interface MapViewSwitchButtonProps {
  view: '2d' | '3d';
  onToggleView: () => void;
}

/**
 * Button in the map controls overlay to switch between 2D and 3D views.
 * Shows the target view mode label ("3D" when in 2D, "2D" when in 3D).
 */
export const MapViewSwitchButton: React.FC<MapViewSwitchButtonProps> = ({ view, onToggleView }) => {
  const targetView = view === '2d' ? '3d' : '2d';
  const label = targetView === '3d' ? 'Switch to 3D view' : 'Switch to 2D view';
  const text = targetView === '3d' ? '3D' : '2D';

  return (
    <button
      type="button"
      onClick={onToggleView}
      aria-label={label}
      title={label}
      data-testid="map-view-switch-btn"
      className={`w-7 h-7 flex items-center justify-center rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text text-[11px] font-bold font-mono transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
    >
      {text}
    </button>
  );
};
