import type { ReplayMetadata, ReplayTrajectoryData } from '../../shared/types/index.js';
import { fetchJson } from './apiClient.js';

export type TelemetrySource = 'duckdb' | 'vcr';

export interface TrajectoryRequest {
  /** The `/trajectory` density query, e.g. from trajectoryResolutionQuery. */
  resolutionQuery?: string;
  lap?: number | null;
  driverSlot?: number | null;
  driverName?: string | null;
  source?: TelemetrySource;
}

function replayPath(replayName: string): string {
  return `/api/replays/${encodeURIComponent(replayName)}`;
}

export function replayTrajectoryPath(replayName: string, request: TrajectoryRequest = {}): string {
  const params: string[] = request.resolutionQuery ? [request.resolutionQuery] : [];
  const add = (name: string, value: string | number) => params.push(`${name}=${encodeURIComponent(value)}`);
  if (typeof request.lap === 'number' && request.lap > 0) add('lap', request.lap);
  if (typeof request.driverSlot === 'number') add('driverSlot', request.driverSlot);
  if (request.driverName) add('driverName', request.driverName);
  if (request.source) add('source', request.source);
  return `${replayPath(replayName)}/trajectory${params.length ? `?${params.join('&')}` : ''}`;
}

export function fetchReplayMetadata(replayName: string, init?: RequestInit): Promise<ReplayMetadata> {
  return fetchJson<ReplayMetadata>(`${replayPath(replayName)}/metadata`, init);
}

export function fetchReplayTrajectory(replayName: string, request: TrajectoryRequest, init?: RequestInit): Promise<ReplayTrajectoryData> {
  return fetchJson<ReplayTrajectoryData>(replayTrajectoryPath(replayName, request), init);
}
