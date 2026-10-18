import { fetchJson } from './apiClient.js';
import type { LiveEvidenceResponse } from '../../shared/types/liveEvidence.js';

/** Uses the same session/driver/lap ordinal locator as native telemetry and replay requests. */
export function fetchLiveLapEvidence(sessionId: string, driverOrdinal: number, lapOrdinal: number, signal?: AbortSignal): Promise<LiveEvidenceResponse> {
  const query = new URLSearchParams({ driverOrdinal: String(driverOrdinal), lapOrdinal: String(lapOrdinal) });
  return fetchJson<LiveEvidenceResponse>(`/api/session/${encodeURIComponent(sessionId)}/live-evidence?${query}`, { signal });
}
