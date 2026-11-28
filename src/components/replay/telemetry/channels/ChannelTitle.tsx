import { createContext, useContext, type ReactNode } from 'react';
import { toggleTraceChannel, useDockChannel, useTraceShown, useTraceViewOpen } from '../../map/telemetry/dockChannel.js';
import type { TelemetryChannelId } from '../presets/telemetryPresets.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

/** The chart a title names (`TelemetryChannelRenderer`): its title stands it as the 3D trace. */
export const ChannelTitleContext = createContext<TelemetryChannelId | null>(null);

const TITLE = 'font-black text-[10px] tracking-wider flex items-center gap-1';

/**
 * A chart's title. While a 3D view is open it is a button standing the chart's channel as the 3D trace, and turning it off when it is
 * the one shown (driver, 2026-11-28: pick the trace from the charts beside the 3D view, not only from a menu).
 */
export function ChannelTitle({ className, children }: { className: string; children: ReactNode }) {
  const channel = useContext(ChannelTitleContext), viewOpen = useTraceViewOpen(), traceShown = useTraceShown(), dockChannel = useDockChannel();
  const shown = traceShown && dockChannel === channel;
  if (!channel || !viewOpen) return <span className={`${className} ${TITLE}`}>{children}</span>;
  return (
    // The chart under it scrubs on a press: the title's press is its own.
    <button type="button" aria-pressed={shown} onClick={() => toggleTraceChannel(channel)} onPointerDown={event => event.stopPropagation()}
      title={shown ? 'Shown as the 3D trace: click for the racing line' : 'Show this trace in the 3D view'}
      className={`${className} ${TITLE} pointer-events-auto cursor-pointer rounded px-1 -mx-1 hover:bg-white/10 ${shown ? 'bg-white/10 ring-1 ring-white/20' : ''} ${FOCUS_RING}`}>
      {children}
    </button>
  );
}
