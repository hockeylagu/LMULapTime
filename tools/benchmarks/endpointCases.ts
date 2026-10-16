import type { SessionDatabase } from '../../server/core/db.js';
import { dataPlugin } from '../../server/plugins/dataPlugin.js';
import type { BenchmarkCase } from './endpointInventory.js';

export interface BenchmarkCohort {
  boards: Array<{ layout: string; carClass: string }>;
  sessions: string[];
  telemetry?: { sessionId: string; driverOrdinal: number; lapOrdinal: number; driverName: string };
  diffId?: number;
}

/** Stored once: later runs use the same boards, sessions and lap instead of drifting to the latest race. */
export function discoverCohort(store: SessionDatabase): BenchmarkCohort {
  const db = store.getDb();
  const boards = db.prepare(`SELECT s.layout_key layout,d.driver_class carClass,count(*) n
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id
    WHERE s.layout_key!='unknown' AND d.is_player=1 AND d.driver_class IS NOT NULL
    GROUP BY s.layout_key,d.driver_class ORDER BY n DESC,s.layout_key,d.driver_class LIMIT 2`).all() as BenchmarkCohort['boards'];
  const sessions = db.prepare(`SELECT s.id,count(l.lap_ordinal) n FROM sessions s
    JOIN session_laps l ON l.session_id=s.id GROUP BY s.id ORDER BY n DESC,s.id LIMIT 2`).all() as Array<{ id: string }>;
  const candidates = db.prepare(`SELECT s.id,s.recording_name,d.driver_ordinal,coalesce(n.name,'') driver_name
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id LEFT JOIN drivers n ON n.driver_id=d.driver_id
    WHERE d.is_player=1 AND s.recording_name IS NOT NULL
    ORDER BY (s.duckdb_filename IS NOT NULL) DESC,s.timestamp DESC,s.id LIMIT 100`).all() as Array<{
      id: string; recording_name: string; driver_ordinal: number; driver_name: string;
    }>;
  let telemetry: BenchmarkCohort['telemetry'];
  for (const candidate of candidates) {
    const metadata = store.getStoredReplayMetadata(candidate.recording_name);
    const driver = metadata?.drivers.find(item => item.name.trim().toLowerCase() === candidate.driver_name.trim().toLowerCase());
    if (driver?.slot === undefined) continue;
    const lap = db.prepare(`SELECT l.lap_ordinal FROM session_laps l
      JOIN replay_trajectories r ON r.filename=? AND r.driver_slot=? AND r.lap_key=l.lap_number
      WHERE l.session_id=? AND l.driver_ordinal=? AND l.is_valid=1 AND l.lap_time>0
        AND coalesce(l.is_pit_stop,0)=0 AND coalesce(l.is_out_lap,0)=0
      ORDER BY EXISTS(SELECT 1 FROM telemetry_lap_cache c JOIN telemetry_metadata t ON t.filename=c.filename
        WHERE t.matched_session_id=l.session_id AND c.lap_number=l.lap_number) DESC,l.lap_time,l.lap_ordinal LIMIT 1`)
      .get(candidate.recording_name, driver.slot, candidate.id, candidate.driver_ordinal) as { lap_ordinal: number } | undefined;
    if (lap) {
      telemetry = { sessionId: candidate.id, driverOrdinal: candidate.driver_ordinal, lapOrdinal: lap.lap_ordinal, driverName: candidate.driver_name };
      break;
    }
  }
  const diff = db.prepare('SELECT id FROM benchmark_diff_history ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined;
  return { boards: boards.map(({ layout, carClass }) => ({ layout, carClass })), sessions: sessions.map(row => row.id), telemetry, diffId: diff?.id };
}

export function benchmarkCases(cohort: BenchmarkCohort, store: SessionDatabase): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  const collections: Record<string, BenchmarkCase['requiredCollection']> = {
    '/api/leaderboard': 'entries', '/api/track/:trackName': 'sessions', '/api/compare/laps': 'laps',
  };
  const add = (id: string, route: string, url?: string, skip = 'No matching data in this cohort.') => cases.push({
    id, route, ...(url ? { url } : { skip }), ...(collections[route] ? { requiredCollection: collections[route] } : {}),
  });
  for (const [id, url] of Object.entries({
    status: '/api/status', scan: '/api/scan/status', 'ai-settings': '/api/ai/settings', 'ai-reports': '/api/ai/reports?limit=50',
    logos: '/api/data-plugin/vehicles/logos',
    references: '/api/reference-laptimes', 'reference-diffs': '/api/reference-laptimes/diffs',
    'sessions-page-1': '/api/sessions?page=1&pageSize=25&hideEmpty=true', 'sessions-page-2': '/api/sessions?page=2&pageSize=25&hideEmpty=true',
    dashboard: '/api/dashboard?page=1&pageSize=25&hideEmpty=true', tracks: '/api/tracks',
    'leaderboard-layouts': '/api/leaderboard/layouts',
    'replay-cache': '/api/replays/cache', 'replay-upgrade-status': '/api/replays/upgrade',
    'live-settings': '/api/live/settings',
  })) add(id, url.split('?')[0], url);
  add('live-stream', '/api/live/stream', undefined, 'Server-sent event stream: stays open, has no response time.');
  add('app-events', '/api/events', undefined, 'Server-sent event stream: stays open, has no response time.');
  add('reference-diff', '/api/reference-laptimes/diffs/:id', cohort.diffId ? `/api/reference-laptimes/diffs/${cohort.diffId}` : undefined);
  const geometry = cohort.boards.find(board => dataPlugin.trackGeometry(board.layout));
  add('track-geometry', '/api/data-plugin/tracks/:layoutKey', geometry ? `/api/data-plugin/tracks/${geometry.layout}` : undefined, 'No metric geometry for the fixed cohort.');
  for (const [index, board] of cohort.boards.entries()) {
    const query = new URLSearchParams(board).toString();
    const track = encodeURIComponent(board.layout);
    add(`board-${index}`, '/api/leaderboard', `/api/leaderboard?${query}`);
    add(`track-${index}`, '/api/track/:trackName', `/api/track/${track}?carClass=${encodeURIComponent(board.carClass)}&pageSize=25`);
    if (index === 0) {
      add('board-with-rival', '/api/leaderboard', `/api/leaderboard?${query}&includeRival=true`);
      for (const [id, suffix] of Object.entries({ 'compare-player': 'playerOnly=true', 'compare-all': 'playerOnly=false',
        'picker-player': 'playerOnly=true&telemetryOnly=true', 'picker-all': 'playerOnly=false&telemetryOnly=true' })) {
        add(id, '/api/compare/laps', `/api/compare/laps?track=${track}&carClass=${encodeURIComponent(board.carClass)}&pageSize=50&${suffix}`);
      }
    }
  }
  if (!cohort.boards.length) {
    for (const [id, route] of [['board', '/api/leaderboard'], ['track', '/api/track/:trackName'], ['compare', '/api/compare/laps']]) add(id, route);
  }
  for (const [index, id] of cohort.sessions.entries()) add(`session-${index}`, '/api/session/:id', `/api/session/${encodeURIComponent(id)}`);
  const sessionId = cohort.telemetry?.sessionId ?? cohort.sessions[0];
  const session = sessionId ? store.getSessionById(sessionId) : null;
  // Discovery saved the player's ordinal; preserve it even when raw XML flags omit isPlayer.
  const player = cohort.telemetry?.driverOrdinal ?? (session?.playerDriver
    ? session.drivers.indexOf(session.playerDriver) : session?.drivers.findIndex(driver => driver.isPlayer) ?? -1);
  add('personal-best-player', '/api/session/:id/personal-best/:driverOrdinal', session?.drivers[player] ? `/api/session/${encodeURIComponent(session.id)}/personal-best/${player}` : undefined);
  const opponent = session?.drivers.findIndex((_driver, index) => index !== player) ?? -1;
  if (session && opponent >= 0) add('personal-best-opponent', '/api/session/:id/personal-best/:driverOrdinal', `/api/session/${encodeURIComponent(session.id)}/personal-best/${opponent}`);
  if (!cohort.sessions.length) add('session', '/api/session/:id');
  const locator = cohort.telemetry;
  const base = locator ? `/api/session/${encodeURIComponent(locator.sessionId)}` : undefined;
  add('telemetry-metadata', '/api/session/:sessionId/telemetry/metadata', base ? `${base}/telemetry/metadata` : undefined);
  for (const source of ['auto', 'vcr']) {
    add(`telemetry-${source}`, '/api/session/:sessionId/telemetry', locator ? `${base}/telemetry?driverOrdinal=${locator.driverOrdinal}&lapOrdinal=${locator.lapOrdinal}&pointSpacingM=2${source === 'vcr' ? '&source=vcr' : ''}` : undefined);
  }
  add('traffic', '/api/session/:sessionId/traffic', locator ? `${base}/traffic?driverName=${encodeURIComponent(locator.driverName)}` : undefined);
  return cases;
}
