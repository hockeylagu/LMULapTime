import React from 'react';
import { Box, Map as MapIcon } from 'lucide-react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

export interface MapViewSwitchButtonProps {
  view: '2d' | '3d';
  onToggleView: () => void;
}

/**
 * Button in the map controls overlay to switch between 2D and 3D views.
 * Shows the target view mode label ("3D" when in 2D, "2D" when in 3D). A view of its own, not a camera move: an accent tint and
 * an icon set it apart from the other controls without filling it.
 */
export const MapViewSwitchButton: React.FC<MapViewSwitchButtonProps> = ({ view, onToggleView }) => {
  const targetView = view === '2d' ? '3d' : '2d';
  const label = targetView === '3d' ? 'Switch to 3D view' : 'Switch to 2D view';
  const title = `${label} (E)`;
  const text = targetView === '3d' ? '3D' : '2D', Icon = targetView === '3d' ? Box : MapIcon;

  return (
    <button
      type="button"
      onClick={onToggleView}
      aria-label={label}
      title={title}
      aria-keyshortcuts="E"
      data-testid="map-view-switch-btn"
      className={`h-7 px-2 flex items-center justify-center gap-1 rounded-lg border border-lmu-accent/30 bg-lmu-accent/10 hover:bg-lmu-accent/20 hover:border-lmu-accent/50 text-lmu-accent-text text-[11px] font-bold font-mono transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {text}
    </button>
  );
};
