import { X } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export interface MarkerSpan {
  distanceM: number;
  timeSec: number;
  baselineTimeSec: number | null;
  deltaSec: number | null;
}

/** Distance, time and delta change between the marker and the cursor, in lap order. */
export function measureMarkerSpan(points: ReplayTrajectoryPoint[], cumDists: number[],
  comparisons: PointComparison[], markerIndex: number, cursorIndex: number): MarkerSpan {
  const from = Math.min(markerIndex, cursorIndex);
  const to = Math.max(markerIndex, cursorIndex);
  const timeSec = (points[to]?.timeSec ?? 0) - (points[from]?.timeSec ?? 0);
  const fromCmp = comparisons[from];
  const toCmp = comparisons[to];
  const deltaSec = fromCmp && toCmp ? toCmp.deltaTimeSec - fromCmp.deltaTimeSec : null;
  return {
    distanceM: (cumDists[to] ?? 0) - (cumDists[from] ?? 0),
    timeSec,
    baselineTimeSec: deltaSec === null ? null : timeSec - deltaSec,
    deltaSec,
  };
}

function signedSeconds(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded < 0) return `−${Math.abs(rounded).toFixed(3)}`;
  return rounded > 0 ? `+${rounded.toFixed(3)}` : '0.000';
}

export interface TelemetryDeltaMarkerProps {
  span: MarkerSpan;
  /** Marker position in the view, held at the edge while it is zoomed out of view. */
  markerPct: number;
  /** Side of the view the marker lies beyond, or null while it is visible. */
  offscreen: 'left' | 'right' | null;
  cursorPct: number;
  onClear: () => void;
}

export function TelemetryDeltaMarker({ span, markerPct, offscreen, cursorPct, onClear }: TelemetryDeltaMarkerProps) {
  const deltaTone = span.deltaSec === null || Math.abs(span.deltaSec) < 0.0005 ? 'text-lmu-muted'
    : span.deltaSec < 0 ? 'text-lmu-gain' : 'text-lmu-loss';
  const readout = (placement: string) => (
    <div data-testid="telemetry-delta-readout"
      className={`absolute ${placement} z-40 flex items-center gap-2 pl-2 pr-1 py-0.5 rounded border border-lmu-gold/40 bg-lmu-strip/95 text-[11px] font-mono text-lmu-text whitespace-nowrap pointer-events-auto`}>
      <span className="text-lmu-gold font-bold">{offscreen === 'left' ? '◂A' : offscreen === 'right' ? 'A▸' : 'A↔'}</span>
      <span>{Math.round(span.distanceM)} m</span>
      <span>{span.timeSec.toFixed(3)} s</span>
      {span.baselineTimeSec !== null && <span className="text-lmu-muted">ref {span.baselineTimeSec.toFixed(3)} s</span>}
      {span.deltaSec !== null && <span className={`font-bold ${deltaTone}`}>{signedSeconds(span.deltaSec)}</span>}
      <button type="button" onClick={onClear} aria-label="Clear marker" title="Clear marker (Esc or double-click)"
        className={`p-0.5 rounded text-lmu-muted hover:text-lmu-text ${FOCUS_RING}`}>
        <X className="w-3 h-3" />
      </button>
    </div>
  );
  // On the marker line, opening toward the wider side; pinned to the edge A lies beyond while zoomed past it.
  return (
    <>
      <div style={{ left: `${Math.min(markerPct, cursorPct)}%`, width: `${Math.abs(cursorPct - markerPct)}%` }}
        className="absolute top-3.5 bottom-0 bg-lmu-gold/10 pointer-events-none z-10" />
      {offscreen ? readout(offscreen === 'left' ? 'top-[18px] left-1' : 'top-[18px] right-1') : (
        <div data-testid="telemetry-delta-marker" style={{ left: `${markerPct}%` }}
          className="absolute top-3.5 bottom-0 w-px bg-lmu-gold pointer-events-none z-40">
          {readout(markerPct > 50 ? 'top-1 right-1' : 'top-1 left-1')}
        </div>
      )}
    </>
  );
}
