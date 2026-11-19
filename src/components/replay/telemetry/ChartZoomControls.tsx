import { Expand, ZoomIn } from 'lucide-react';
import { FOCUS_RING } from '../../common/buttonStyles.js';

interface Props {
  interactionMode: 'scrub' | 'zoom';
  onChangeInteractionMode: (mode: 'scrub' | 'zoom') => void;
  isZoomed: boolean;
  onResetZoom: () => void;
  /** The telemetry column's 24px toolbar; the fullscreen trace's row is 28px. */
  compact?: boolean;
}

/** A toolbar text button: the telemetry column's compact one or the fullscreen trace's. */
export const toolbarButton = (compact: boolean) => `inline-flex items-center gap-1.5 rounded-lg font-semibold text-lmu-muted hover:bg-lmu-raised hover:text-lmu-text transition-colors ${
  compact ? 'h-6 px-2 text-[11px]' : 'h-7 px-2 text-xs'} ${FOCUS_RING}`;

/** Zoom range (a toggle: the next drag selects a range) and Full lap while zoomed; the telemetry column and the fullscreen trace share it. */
export function ChartZoomControls({ interactionMode, onChangeInteractionMode, isZoomed, onResetZoom, compact = false }: Props) {
  const zooming = interactionMode === 'zoom';
  const button = toolbarButton(compact);
  return <>
    <button type="button" aria-pressed={zooming} className={`${button} ${zooming ? 'bg-lmu-raised text-lmu-text' : ''}`}
      title="Drag across the chart to zoom into a range (Shift + drag works too). Double-click shows the full lap."
      onClick={event => { event.stopPropagation(); onChangeInteractionMode(zooming ? 'scrub' : 'zoom'); }}>
      <ZoomIn aria-hidden="true" className="h-3 w-3" />Zoom range
    </button>
    {isZoomed && <button type="button" className={button} title="Show the full lap (0, or double-click the chart)"
      onClick={event => { event.stopPropagation(); onResetZoom(); }}>
      <Expand aria-hidden="true" className="h-3 w-3" />Full lap
    </button>}
  </>;
}
