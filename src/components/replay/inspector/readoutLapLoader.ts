import { useEffect } from 'react';
import type { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { fetchSessionTelemetry } from '../../../api/replayApi.js';
import { isAbortError } from '../../../api/apiClient.js';
import { trajectoryResolutionQuery } from '../telemetry/telemetryResolution.js';
import { buildReadoutLapExtras, readoutLapExtras, referenceLapNumber, setReadoutLapExtras } from '../view3d/car/readoutLapExtras.js';

/**
 * Loads the laps a wheel/dash readout compares the shown lap with (its reference, the best lap finished before it, and the previous
 * lap) at the standard resolution, and registers the readout extras for `trajectory`. A lap without a session locator, or one that
 * fails to load, leaves its part unknown; nothing is registered when aborted.
 */
export async function loadReadoutLapExtras(sessionId: string, trajectory: ReplayTrajectoryData, metadata: ReplayMetadata | null, source: 'duckdb' | 'vcr', signal: AbortSignal): Promise<void> {
  const current = trajectory.currentLap, driverOrdinal = trajectory.driverOrdinal;
  if (current === undefined || driverOrdinal === undefined) return;
  const driver = metadata?.drivers.find(entry => entry.sessionDriverOrdinal === driverOrdinal);
  const lap = async (lapNumber: number | null): Promise<ReplayTrajectoryData | null> => {
    const lapOrdinal = lapNumber === null ? undefined : driver?.sessionLapOrdinals?.[String(lapNumber)];
    if (lapOrdinal === undefined) return null;
    try {
      const loaded = await fetchSessionTelemetry(sessionId, {driverOrdinal, lapOrdinal, source, resolutionQuery: trajectoryResolutionQuery('standard')}, {signal});
      return loaded.points.length ? loaded : null;
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      return null;
    }
  };
  const referenceNumber = referenceLapNumber(trajectory), previousNumber = current > 1 ? current - 1 : null;
  try {
    const [reference, previous] = await Promise.all([lap(referenceNumber), referenceNumber === previousNumber ? null : lap(previousNumber)]);
    if (signal.aborted) return;
    setReadoutLapExtras(trajectory, buildReadoutLapExtras(trajectory, reference, referenceNumber === previousNumber ? reference : previous));
  } catch (error: unknown) {
    if (!isAbortError(error)) throw error;
  }
}

/** Loads the readout extras of the shown lap while the 3D view (`active`) shows it, once per lap. */
export function useReadoutLapExtras(active: boolean, sessionId: string | null | undefined, trajectory: ReplayTrajectoryData | null, metadata: ReplayMetadata | null,
  source: 'duckdb' | 'vcr'): void {
  useEffect(() => {
    if (!active || !sessionId || !trajectory || readoutLapExtras(trajectory)) return;
    const controller = new AbortController();
    loadReadoutLapExtras(sessionId, trajectory, metadata, source, controller.signal).catch(() => {
      // A readout without its extras keeps its delta and last-lap fields hidden.
    });
    return () => controller.abort();
  }, [active, sessionId, trajectory, metadata, source]);
}
