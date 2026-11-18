import type { RaceReplayOverview, RaceReplayProgress, ReplayMetadata, ReplayTrafficResponse, ReplayTrajectoryData } from '../../shared/types/index.js';
import { apiErrorMessage, fetchBinary, fetchJson, isAbortError } from './apiClient.js';
import { decodeRacePoseWindow, type RacePoseWindow } from '../../shared/domain/raceReplay/poseWindow.js';
import { fetchLiveLapEvidence } from './liveEvidenceApi.js';
import { fuseLiveTelemetry } from '../../shared/domain/live/liveTelemetryFusion.js';
import { withReplayWheelSlip } from '../../shared/domain/live/replayWheelSlip.js';

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

// The race replay opens with the lap view's header already filled.
let lastMetadata: { sessionId: string; value: ReplayMetadata } | null = null;

export async function fetchSessionTelemetryMetadata(sessionId: string, init?: RequestInit): Promise<ReplayMetadata> {
  const value = await fetchJson<ReplayMetadata>(`/api/session/${encodeURIComponent(sessionId)}/telemetry/metadata`, init);
  lastMetadata = { sessionId, value };
  return value;
}

/** The metadata last fetched for this session, if any. */
export function lastSessionTelemetryMetadata(sessionId: string): ReplayMetadata | null {
  return lastMetadata?.sessionId === sessionId ? lastMetadata.value : null;
}

/** Every car's distance along the track once a second (race sessions with a track centreline), for live gaps. */
export function fetchRaceProgress(sessionId: string, init?: RequestInit): Promise<RaceReplayProgress> {
  return fetchJson<RaceReplayProgress>(`/api/session/${encodeURIComponent(sessionId)}/race/progress`, init);
}

/** The last session's overview: the lap view asks for it ahead, so the race opens on it without a loading page. */
let lastOverview: {sessionId: string; request: Promise<RaceReplayOverview>; value: RaceReplayOverview | null} | null = null;

/**
 * Every car of the session replay on the replay clock: cars, laps and running order (poses come in windows). Asked once per
 * session (the last one): callers share the request, and a failed one is asked again.
 */
export function fetchRaceOverview(sessionId: string): Promise<RaceReplayOverview> {
  if (lastOverview?.sessionId === sessionId) return lastOverview.request;
  const entry: NonNullable<typeof lastOverview> = {sessionId, request: fetchJson<RaceReplayOverview>(`/api/session/${encodeURIComponent(sessionId)}/race`), value: null};
  lastOverview = entry;
  entry.request.then(value => { entry.value = value; }, () => { if (lastOverview === entry) lastOverview = null; });
  return entry.request;
}

/** The session's overview if it has arrived (`fetchRaceOverview`), else null. */
export function lastRaceOverview(sessionId: string): RaceReplayOverview | null {
  return lastOverview?.sessionId === sessionId ? lastOverview.value : null;
}

/** Pose window `index` (from index × windowSec seconds) of every car of the session replay. */
export async function fetchRacePoseWindow(sessionId: string, index: number, init?: RequestInit): Promise<RacePoseWindow> {
  return decodeRacePoseWindow(await fetchBinary(`/api/session/${encodeURIComponent(sessionId)}/race/poses?window=${index}`, init));
}

/** The lap with its live capture fused in when it has one; wheel slip from the replay's wheel speeds otherwise. */
export async function fetchSessionTelemetry(sessionId: string, request: SessionTelemetryRequest, init?: RequestInit): Promise<ReplayTrajectoryData> {
  const trajectory = await fetchLiveFusedTelemetry(sessionId, request, init);
  return { ...trajectory, points: withReplayWheelSlip(trajectory.points) };
}

async function fetchLiveFusedTelemetry(sessionId: string, request: SessionTelemetryRequest, init?: RequestInit): Promise<ReplayTrajectoryData> {
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
