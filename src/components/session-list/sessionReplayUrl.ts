import type { SessionListItem } from './sessionListTypes.js';

/** Telemetry URL a session's replay indicator opens at the player's best lap. */
export function sessionReplayUrl(s: SessionListItem): string | undefined {
  const driverOrdinal = s.playerDriver?.driverOrdinal;
  const lapOrdinal = s.playerDriver?.bestLapOrdinal;
  if (!s.matchingReplayFile || !Number.isInteger(driverOrdinal) || !Number.isInteger(lapOrdinal)) return undefined;
  const params = new URLSearchParams({ sessionId: s.id, driverOrdinal: String(driverOrdinal), lapOrdinal: String(lapOrdinal) });
  return `/telemetry?${params.toString()}`;
}
