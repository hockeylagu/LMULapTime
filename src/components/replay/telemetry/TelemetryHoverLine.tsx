import { findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { useTrackHover } from '../map/telemetry/trackHover.js';
import { TelemetryScrubCursor } from './TelemetryScrubCursor.js';

interface Props {
  /** The chart's lap distance per sample. */
  cumDists: number[];
  viewStart: number;
  viewEnd: number;
  pctForIndex: (index: number) => number;
}

/** A dim line on the chart where the pointer is on the track (`trackHover.ts`); the cursor stays where the car is. */
export function TelemetryHoverLine({cumDists, viewStart, viewEnd, pctForIndex}: Props) {
  const distanceM = useTrackHover();
  if (distanceM === null || !cumDists.length) return null;
  const index = findIndexAtDistance(cumDists, distanceM);
  if (index < viewStart || index > viewEnd) return null;
  return <TelemetryScrubCursor cursorPct={pctForIndex(index)} className="opacity-40" testId="telemetry-hover-line" />;
}
