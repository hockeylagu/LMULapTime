/**
 * Live dashboard contracts: the server's live service (`server/live/`) streams these to the
 * `#/live` page. Source: the rF2 shared memory plugin read in a worker thread
 * (docs/plans/LIVE_RACE_DASHBOARD.md). Unknown values are null, never zero-filled.
 */

/**
 * What the game is doing, as the page shows it.
 * - `offline`: no shared memory (game closed, or the plugin is not enabled).
 * - `menu`: the game runs but no session is loaded.
 * - `garage`: a session is loaded and the driver is in the monitor (not in realtime).
 * - `starting`: on track before the green flag (grid, formation, countdown).
 * - `driving`: on track, session running (green, full course yellow, stopped).
 * - `finished`: the session is over (checkered) and the driver is still on track.
 */
export type LiveLifecycle = 'offline' | 'menu' | 'garage' | 'starting' | 'driving' | 'finished';

/** Session family from the rF2 session code (0 test day, 1-4 practice, 5-8 qualifying, 9 warmup, 10-13 race). */
export type LiveSessionKind = 'practice' | 'qualifying' | 'warmup' | 'race' | 'unknown';

export interface LiveSessionInfo {
  kind: LiveSessionKind;
  /** Raw rF2 session code (`mSession`). */
  sessionCode: number;
  /** rF2 game phase (`mGamePhase`): 0 before, 3 formation, 4 countdown, 5 green, 6 FCY, 7 stopped, 8 over, 9 paused. */
  gamePhase: number;
  inRealtime: boolean;
  /** Track name as the game reports it; resolve layouts through `getCircuitSpecification`, never by this text alone. */
  trackName: string;
  /** Player car as the game reports it. */
  vehicleName: string;
  /** Player class as the game reports it; resolve through the canonical vehicle definitions. */
  vehicleClass: string;
  /** Session clock, seconds. */
  elapsedSeconds: number;
  /** Session end time in seconds for a timed session; null when lap-limited or unknown. */
  endSeconds: number | null;
  /** Lap limit for a lap-count session; null when timed or unknown. */
  maxLaps: number | null;
  playerLapsCompleted: number | null;
  playerPlace: number | null;
}

export interface LiveSnapshot {
  /** Increases with every snapshot the server sends; resets when the server restarts. */
  sequence: number;
  /** Server receipt time, ms since the epoch. */
  receivedAt: number;
  lifecycle: LiveLifecycle;
  /** The game is paused (game phase 9); the lifecycle keeps its last value. */
  paused: boolean;
  /** Null while offline or in the menu. */
  session: LiveSessionInfo | null;
}

/** One pedal sample: driver inputs (unfiltered), 0..1, at the session clock time `t` in seconds. */
export interface LivePedalSample {
  t: number;
  throttle: number;
  brake: number;
}

export interface LivePedalBatch {
  samples: LivePedalSample[];
}

export interface LiveSettings {
  /** Open the dashboard window when LMU starts. On by default. */
  autoOpen: boolean;
}

/** Server-sent event names on `GET /api/live/stream`. The data of each is JSON. */
export const LIVE_STREAM_EVENTS = {
  /** `LiveSnapshot`: sent on connect and on every change of lifecycle, pause or session fields. */
  snapshot: 'snapshot',
  /** `LivePedalBatch`: sent 20-30 times a second, only while on track. */
  pedals: 'pedals',
  /** `{ at: number }`: sent every ~15 s so the page can tell a dead connection. */
  heartbeat: 'heartbeat',
} as const;

/** App-wide server-sent events on `GET /api/events`, separate from the live stream. */
export const APP_EVENTS = {
  /** `{ at: number }`: a file scan started (the server can start one by itself after a session). */
  scanStarted: 'scan-started',
  /** `{ at: number }`: every scan step finished; the app reloads its data. */
  scanFinished: 'scan-finished',
  /** `{ at: number }`. */
  heartbeat: 'heartbeat',
} as const;

/** Heartbeat period for both streams, ms. A page that hears nothing for 2.5x this shows disconnected. */
export const LIVE_HEARTBEAT_MS = 15_000;
