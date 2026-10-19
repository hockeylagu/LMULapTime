/**
 * Live dashboard contracts: the server's live service (`server/live/`) streams these to the
 * `#/live` page. Source: the rF2 shared memory plugin read in a worker thread
 * (docs/plans/LIVE_RACE_DASHBOARD.md). Unknown values are null, never zero-filled.
 */

/**
 * What the game is doing, as the page shows it.
 * - `offline`: no shared memory (game closed, or the plugin is not enabled).
 * - `menu`: the game runs but no session is loaded (a replay playing counts as menu: it is not live driving).
 * - `loading`: LMU is loading a session (`navigation/state` says so; progress in `loadingProgress`).
 * - `garage`: a session is loaded and the driver is in the monitor (not in realtime).
 * - `starting`: on track before the green flag (grid, formation, countdown).
 * - `driving`: on track, session running (green, full course yellow, stopped).
 * - `finished`: the session is over (checkered) and the driver is still on track.
 */
export type LiveLifecycle = 'offline' | 'menu' | 'loading' | 'garage' | 'starting' | 'driving' | 'finished';

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
  /** Session end time in seconds; null when unknown. LMU sessions, races included, are always timed. */
  endSeconds: number | null;
  playerLapsCompleted: number | null;
  playerPlace: number | null;
  playerClassPlace?: number | null;
  finishStatus?: number;
}

import type { LiveStrategy } from './liveStrategy.js';
import type { LiveSessionResult } from './liveInsights.js';

/** Who and where, resolved once per session through the app's canonical definitions. */
export interface LiveIdentity {
  /** Canonical layout key from `getCircuitSpecification` (LMU `sceneDesc` first); null when unresolved. */
  layoutKey: string | null;
  /** Display name of the layout, or the game's track name when unresolved. */
  layoutName: string;
  /** Canonical class from `mapVehicleIdToClass`; null when unknown. */
  carClass: string | null;
  /**
   * The player's personal record on this layout and class from the app's history (the gold
   * personal-best meaning: fastest valid lap, any car, any condition); null when none or unresolved.
   */
  personalBestSeconds: number | null;
}

/** Race laps left, counting the lap in progress. */
export interface LiveLapsLeft {
  laps: number;
  /** Overall leader determines the flag time; own-class pace projects remaining laps. False after the overall flag (exactly 1). */
  estimated: boolean;
}

export interface LiveWeather {
  /** Whole degrees Celsius. */
  trackTempC: number;
  /** Against about five minutes earlier. */
  trackTempTrend: 'rising' | 'falling' | 'steady';
  /** Rain now, 0..1 as the game reports it (scale unverified in the wet). */
  raining: number;
  /** Average path wetness, 0..1. */
  avgPathWetness: number;
  /** Path wetness against about five minutes earlier: rising is getting wetter, falling is drying. */
  wetnessTrend: 'rising' | 'falling' | 'steady';
}

/** A completed lap of the player in this session, as the game timed it. Sector times are split (not cumulative). */
export interface LiveLapRecord {
  lapNumber: number;
  lapSeconds: number | null;
  /** A retained invalid-lap duration may be recovered from consecutive game lap-start timestamps. */
  timeSource?: 'game' | 'lap-start';
  sectors: [number | null, number | null, number | null];
  /** Positive completed time from the game on a flying lap; trace completeness is independent. */
  valid: boolean;
}

export interface LiveSessionBest {
  /** The player's best valid lap of this session. */
  lapSeconds: number | null;
  /** Split sectors of that lap: the reference for current-lap and sector deltas. */
  lapSectors: [number | null, number | null, number | null];
  /** Best individual split sectors over the session's valid laps. */
  bestSectors: [number | null, number | null, number | null];
  /** Sum of `bestSectors` when all three are known. */
  bestPossibleSeconds: number | null;
}

/** Current-lap progress, sent about 5 times a second while on track (`timing` event). */
export interface LiveTiming {
  /** The current lap started in the pits, as classified by the live lap tracker. */
  isOutLap?: boolean;
  /** Lap in progress (completed laps + 1). */
  lapNumber: number;
  sector: 1 | 2 | 3;
  /** Elapsed game seconds since LapStartET, or observed departure on an out-lap; null without an anchor/before the grid line. */
  lapElapsedSeconds: number | null;
  /** Completed split sectors of the current lap; null until crossed (S3 moves into recentLaps at the finish). */
  sectors: [number | null, number | null, number | null];
  /** Time into the current lap minus the session-best lap at the same distance; null without a reference. */
  deltaSeconds: number | null;
  /** Coherent estimate/reference/delta from this timing event; never rebuilt from a separate snapshot. */
  lapEstimate?: { seconds: number; referenceSeconds: number; deltaSeconds: number; source: 'distance' | 'sector' } | null;
  /** Completed sectors of the current lap minus the session-best lap's sectors; null for sectors not yet done. */
  sectorDeltas: [number | null, number | null, number | null];
  /**
   * Mean tyre surface temperature over the four wheels, degrees Celsius (the qualifying push-lap figure);
   * null when the game reports none. Read from the telemetry buffer, so it can differ in age from the rest.
   */
  tyreSurfaceAvgC?: number | null;
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
  /** Null until resolved for the loaded session. */
  identity: LiveIdentity | null;
  /** Races only; null otherwise or when unknown. */
  lapsLeft: LiveLapsLeft | null;
  weather: LiveWeather | null;
  /** The player's last three completed laps of this session, oldest first. */
  recentLaps: LiveLapRecord[];
  sessionBest: LiveSessionBest | null;
  /** Session load progress 0..1 while `loading`; null otherwise or when LMU does not say. */
  loadingProgress: number | null;
  /** VE or fuel, the next stop, damage, tyres, forecast and the garage plan; null while no session is loaded. */
  strategy: LiveStrategy | null;
  result?: LiveSessionResult | null;
  qualifyingResult?: LiveSessionResult | null;
  audit?: { runId: string; status: 'recording' | 'unavailable' } | null;
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
  /** Switch an open app page to the dashboard when LMU starts. On by default. */
  autoOpen: boolean;
  /** VE or fuel kept at the pit entry or the finish, in laps. Half a lap by default. */
  reserveLaps: number;
  /** Seconds of throttle/brake history shown on the live dashboard and demo. */
  pedalTraceSeconds: number;
  /** Write a diagnostic JSONL file beside each recording, from the next session. Off by default. */
  diagnostics: boolean;
}

export const PEDAL_TRACE_SECONDS_CHOICES = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120] as const;
export const RESERVE_LAP_CHOICES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2] as const;
export const DEFAULT_LIVE_SETTINGS: LiveSettings = { autoOpen: true, reserveLaps: 0.5, pedalTraceSeconds: 30, diagnostics: false };

/** Server-sent event names on `GET /api/live/stream`. The data of each is JSON. */
export const LIVE_STREAM_EVENTS = {
  /** `LiveSnapshot`: sent on connect and on every change of lifecycle, pause or session fields. */
  snapshot: 'snapshot',
  /** `LivePedalBatch`: sent 20-30 times a second, only while on track. */
  pedals: 'pedals',
  /** `LiveTiming`: about 5 times a second, only while on track. */
  timing: 'timing',
  /** `{ at: number }`: sent every ~15 s so the page can tell a dead connection. */
  heartbeat: 'heartbeat',
} as const;

/** App-wide server-sent events on `GET /api/events`, separate from the live stream. */
export const APP_EVENTS = {
  /** `{ at: number }`: a file scan started (the server can start one by itself after a session). */
  scanStarted: 'scan-started',
  /** `{ at: number }`: every scan step finished; the app reloads its data. */
  scanFinished: 'scan-finished',
  /** `{ at: number }`: LMU started, and the auto-open setting is on with no dashboard page connected: the page goes to `#/live`. */
  gameStarted: 'game-started',
  /** `{ running: boolean }`: whether LMU is running, sent on connect and whenever it starts or closes. */
  gameRunning: 'game-running',
  /** `{ at: number }`. */
  heartbeat: 'heartbeat',
} as const;

/** Heartbeat period for both streams, ms. A page that hears nothing for 2.5x this shows disconnected. */
export const LIVE_HEARTBEAT_MS = 15_000;
