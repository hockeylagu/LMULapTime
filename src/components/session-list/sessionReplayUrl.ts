import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import type { DetailedSession } from '../../../shared/types/session.js';

/** Telemetry URL a session's replay indicator opens at the player's best lap. */
export function sessionReplayUrl(s: SessionCard | DetailedSession): string | undefined {
  const driverOrdinal = s.playerDriver?.driverOrdinal;
  const lapOrdinal = s.playerDriver && 'bestLapOrdinal' in s.playerDriver ? s.playerDriver.bestLapOrdinal : undefined;
  if (!s.matchingReplayFile || !Number.isInteger(driverOrdinal) || !Number.isInteger(lapOrdinal)) return undefined;
  const params = new URLSearchParams({ sessionId: s.id, driverOrdinal: String(driverOrdinal), lapOrdinal: String(lapOrdinal), view: '2d' });
  return `/telemetry?${params.toString()}`;
}
