/** A lap as the telemetry view opens it: session plus stable source-order driver/lap locators. */
export interface TelemetryLapRef {
  sessionId: string;
  driverOrdinal: number;
  lapOrdinal: number;
  driverName?: string;
  lapNum?: number;
}

const BASELINE_PARAMS = ['baselineSessionId', 'baselineDriverOrdinal', 'baselineLapOrdinal', 'compareDriver'];

/**
 * The /telemetry path that shows `target`, against `baseline` when there is one. Other parameters
 * of the current page (track, class) are kept so the way back finds the same selection.
 */
export function buildTelemetryComparePath(
  current: URLSearchParams,
  target: TelemetryLapRef,
  baseline: TelemetryLapRef | null,
  /** Opens the view on this corner (T number). */
  corner?: number
): string {
  const params = new URLSearchParams(current);
  params.set('sessionId', target.sessionId);
  params.set('driverOrdinal', String(target.driverOrdinal));
  params.set('lapOrdinal', String(target.lapOrdinal));
  BASELINE_PARAMS.forEach((key) => params.delete(key));
  if (baseline) {
    params.set('baselineSessionId', baseline.sessionId);
    params.set('baselineDriverOrdinal', String(baseline.driverOrdinal));
    params.set('baselineLapOrdinal', String(baseline.lapOrdinal));
    if (baseline.driverName) params.set('compareDriver', baseline.driverName);
  }
  if (corner !== undefined) params.set('corner', String(corner));
  else params.delete('corner');
  return `/telemetry?${params.toString()}`;
}
