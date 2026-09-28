/** A lap as the telemetry view opens it: the replay that recorded it, the driver and the lap number. */
export interface TelemetryLapRef {
  replayName: string;
  driverName?: string;
  lapNum?: number;
  sessionId?: string;
}

const BASELINE_PARAMS = ['baselineReplay', 'compareSessionId', 'compareDriver', 'compareLapNum'];

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
  params.set('replayName', target.replayName);
  params.set('lap', String(target.lapNum ?? 1));
  if (target.driverName) params.set('driverName', target.driverName);
  BASELINE_PARAMS.forEach((key) => params.delete(key));
  if (baseline) {
    params.set('baselineReplay', baseline.replayName);
    if (baseline.sessionId) params.set('compareSessionId', baseline.sessionId);
    if (baseline.driverName) params.set('compareDriver', baseline.driverName);
    if (baseline.lapNum !== undefined) params.set('compareLapNum', String(baseline.lapNum));
  }
  if (corner !== undefined) params.set('corner', String(corner));
  else params.delete('corner');
  return `/telemetry?${params.toString()}`;
}
