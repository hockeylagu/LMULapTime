import type { ReplayMetadata, ReplayTrafficResponse, ReplayTrajectoryData } from '../../shared/types/index.js';
import { fetchJson } from './apiClient.js';

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

export function fetchSessionTelemetry(sessionId: string, request: SessionTelemetryRequest, init?: RequestInit): Promise<ReplayTrajectoryData> {
  return fetchJson<ReplayTrajectoryData>(sessionTelemetryPath(sessionId, request), init);
}

export function fetchSessionTraffic(sessionId: string, driverName: string, init?: RequestInit): Promise<ReplayTrafficResponse> {
  return fetchJson<ReplayTrafficResponse>(`/api/session/${encodeURIComponent(sessionId)}/traffic?driverName=${encodeURIComponent(driverName)}`, init);
}
