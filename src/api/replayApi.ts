import type { ReplayMetadata, ReplayTrafficResponse, ReplayTrajectoryData } from '../../shared/types/index.js';
import { apiErrorMessage, fetchJson, isAbortError } from './apiClient.js';
import { fetchLiveLapEvidence } from './liveEvidenceApi.js';
import { fuseLiveTelemetry } from '../../shared/domain/live/liveTelemetryFusion.js';

export type TelemetrySource = 'duckdb' | 'vcr';

export interface SessionTelemetryRequest {
  driverOrdinal: number;
  lapOrdinal: number;
  resolutionQuery?: string;
  source?: TelemetrySource;
}

export function sessionTelemetryPath(sessionId: string, request: SessionTelemetryRequest): string {
  const params = new URLSearchParams();
  params.set('driverOrdinal', String(request.driverOrdinal));
  params.set('lapOrdinal', String(request.lapOrdinal));
  if (request.resolutionQuery) {
    new URLSearchParams(request.resolutionQuery).forEach((value, key) => params.set(key, value));
  }
  if (request.source) params.set('source', request.source);
  return `/api/session/${encodeURIComponent(sessionId)}/telemetry?${params.toString()}`;
}

export function fetchSessionTelemetryMetadata(sessionId: string, init?: RequestInit): Promise<ReplayMetadata> {
  return fetchJson<ReplayMetadata>(`/api/session/${encodeURIComponent(sessionId)}/telemetry/metadata`, init);
}

export async function fetchSessionTelemetry(sessionId: string, request: SessionTelemetryRequest, init?: RequestInit): Promise<ReplayTrajectoryData> {
  const trajectory = await fetchJson<ReplayTrajectoryData>(sessionTelemetryPath(sessionId, request), init);
  if (!trajectory.hasLiveCapture) return trajectory;
  try {
    const evidence = await fetchLiveLapEvidence(sessionId, request.driverOrdinal, request.lapOrdinal, init?.signal ?? undefined);
    return fuseLiveTelemetry(trajectory, evidence);
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    return { ...trajectory, liveCaptureOverlay: { state: 'unavailable', message: apiErrorMessage(error, 'Live capture could not be read') } };
  }
}

export function fetchSessionTraffic(sessionId: string, driverName: string, init?: RequestInit): Promise<ReplayTrafficResponse> {
  return fetchJson<ReplayTrafficResponse>(`/api/session/${encodeURIComponent(sessionId)}/traffic?driverName=${encodeURIComponent(driverName)}`, init);
}
