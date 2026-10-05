import { getBestLapNumber } from '../../../shared/domain/formatters.js';
import type { SessionListItem } from './sessionListTypes.js';

/** Telemetry URL a session's replay indicator opens: the same replay and best lap as the in-app handler. */
export function sessionReplayUrl(s: SessionListItem): string | undefined {
  if (!s.matchingReplayFile) return undefined;
  const params = new URLSearchParams({ replayName: s.matchingReplayFile.name, session: s.id, lap: String(getBestLapNumber(s.playerDriver)) });
  return `/telemetry?${params.toString()}`;
}
