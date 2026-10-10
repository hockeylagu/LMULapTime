import type { Database as DatabaseType } from 'better-sqlite3';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import type { Row } from '../sessionRows/fields.js';
import { DRIVER_WITH_DICTIONARIES, SESSION_SCALAR_COLUMNS, driverScalars, recordingLink, sessionScalars } from '../sessionRows/reader.js';

type CardPlayer = NonNullable<SessionCard['playerDriver']>;

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(',');
const CHUNK = 200;

/** Rows by session id, for the rows of a keyed table fetched in one statement. */
function bySession(rows: Row[]): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const id = String(row.session_id);
    const list = grouped.get(id);
    if (list) list.push(row); else grouped.set(id, [row]);
  }
  return grouped;
}

/** The player's figures the card adds to the driver: clean laps, driving time, pit stops, top speed. */
function playerExtras(summary: Row | undefined): Pick<CardPlayer, 'driverOrdinal' | 'bestLapOrdinal' | 'completedLapsCount' | 'cleanLapsCount'
  | 'drivingTimeSeconds' | 'pitStopsCount' | 'maxTopSpeed' | 'consistencyScore' | 'topThreeAverage'> {
  return {
    driverOrdinal: summary?.driver_ordinal as number | undefined,
    bestLapOrdinal: (summary?.best_lap_ordinal as number | null | undefined) ?? null,
    completedLapsCount: (summary?.completed_laps_count as number | null | undefined) ?? 0,
    cleanLapsCount: (summary?.clean_laps_count as number | null | undefined) ?? 0,
    drivingTimeSeconds: (summary?.driving_time_sum as number | null | undefined) ?? 0,
    pitStopsCount: (summary?.pit_count as number | null | undefined) ?? 0,
    maxTopSpeed: (summary?.max_speed as number | null | undefined) ?? null,
    consistencyScore: (summary?.consistency_score as number | null | undefined) ?? null,
    topThreeAverage: (summary?.top_three_average as number | null | undefined) ?? null,
  };
}

function cardOf(session: Row, recording: Row | undefined, drivers: Row[]): SessionCard {
  const card = sessionScalars(session);
  if (recording) card.matchingReplayFile = recordingLink(recording, session);
  card.isEmpty = session.is_empty === 1;
  const playerOrdinal = session.player_driver_ordinal;
  const base = typeof playerOrdinal === 'number' && session.projection_error === null
    ? drivers.find(driver => driver.driver_ordinal === playerOrdinal) : undefined;
  if (base) {
    // The projection's summary row is the marked player, else the primary driver.
    const summary = drivers.filter(driver => driver.is_player_driver === 1).sort((a, b) => (a.driver_ordinal as number) - (b.driver_ordinal as number))[0]
      ?? drivers.find(driver => driver.driver_ordinal === session.primary_driver_ordinal);
    card.playerDriver = { ...driverScalars(base), ...playerExtras(summary) } as unknown as CardPlayer;
  }
  return card as unknown as SessionCard;
}

/**
 * The cards of sessions, assembled from columns alone: the session row, its replay link, and the
 * player's driver rows with the dictionaries. Cards come back in the order of `ids`; a missing id is skipped.
 */
export function readSessionCards(db: DatabaseType, ids: readonly string[]): SessionCard[] {
  const cards = new Map<string, SessionCard>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk = ids.slice(start, start + CHUNK);
    const marks = placeholders(chunk.length);
    const sessions = db.prepare(`SELECT ${SESSION_SCALAR_COLUMNS}, is_empty, projection_error, primary_driver_ordinal
      FROM sessions WHERE id IN (${marks})`).all(...chunk) as Row[];
    const recordings = bySession(db.prepare(`SELECT * FROM session_recordings WHERE session_id IN (${marks})`).all(...chunk) as Row[]);
    const drivers = bySession(db.prepare(`${DRIVER_WITH_DICTIONARIES} WHERE d.session_id IN (${marks})
      AND (d.is_player_driver = 1 OR d.driver_ordinal = (SELECT player_driver_ordinal FROM sessions WHERE id = d.session_id)
        OR d.driver_ordinal = (SELECT primary_driver_ordinal FROM sessions WHERE id = d.session_id))`).all(...chunk) as Row[]);
    for (const session of sessions) {
      const id = session.id as string;
      cards.set(id, cardOf(session, recordings.get(id)?.[0], drivers.get(id) ?? []));
    }
  }
  return ids.flatMap(id => {
    const card = cards.get(id);
    return card ? [card] : [];
  });
}
