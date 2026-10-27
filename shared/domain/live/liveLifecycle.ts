import type { LiveLifecycle, LiveSessionInfo, LiveSessionKind } from '../../types/live.js';
import type { LivePitState } from '../../types/liveStrategy.js';

/** The scoring fields the live page is derived from (the rF2 scoring buffer, decoded by the server). */
export interface LiveScoringReading {
  trackName: string;
  /** rF2 `mSession`. */
  sessionCode: number;
  currentEt: number;
  endEt: number;
  numVehicles: number;
  inRealtime: boolean;
  gamePhase: number;
  /** Circuit length in meters (`mLapDist` of the scoring info); 0 when unknown. */
  trackLength: number;
  /** Track surface temperature, degrees Celsius. */
  trackTempC: number;
  /** Rain now, 0..1. */
  raining: number;
  /** Average path wetness, 0..1. */
  avgPathWetness: number;
  maxPathWetness?: number;
  minPathWetness?: number;
  /**
   * LMU `mTrackGripLevel`, raw. Undocumented: logged in diagnostics to map against the MFD's track label
   * ("Low Grip", damp, wet...); not interpreted until that mapping is known (HUD labels in order: Green, Low, Medium, High, Saturated, likely 0-4; 2 = "Medium" and 3 = "High" confirmed dry, 2026-10-27).
   */
  trackGripLevel?: number;
  /** The scoring entry flagged as the player; null when none is. */
  player: LiveVehicleReading | null;
  /** The overall leader (place 1); null when none is listed. */
  leader: LiveVehicleReading | null;
  /** Best-placed car in the player's class, independently of the overall leader. */
  classLeader?: LiveVehicleReading | null;
  playerClassPlace?: number | null;
  /** Every scoring entry has a terminal finish status; null when the full field was not copied. */
  allDriversFinished?: boolean | null;
}

/**
 * One scoring entry as the game reports it. Times are seconds with the game's sentinels kept
 * (-1 or 0 for "not available"); `lastSector2`, `curSector2`, `bestSector2` and `bestLapSector2` are
 * cumulative (sector 1 + sector 2), as the game timed them.
 */
export interface LiveVehicleReading {
  id: number;
  /** Exact source identity; vehicle slots are not persistent driver identities. */
  driverName?: string;
  /** Opaque 16-byte player configuration; capture stores raw hex without interpreting option bits. */
  upgradePackHex?: string;
  place: number;
  /** Laps completed (rF2 `mTotalLaps`). */
  totalLaps: number;
  vehicleName: string;
  vehicleClass: string;
  /** Distance along the lap in meters (negative just before the line on a grid). */
  lapDist: number;
  /** rF2 `mSector` as reported: 1 and 2 are sectors 1 and 2, 0 is sector 3. */
  sector: number;
  lastLapTime: number;
  bestLapTime: number;
  lastSector1: number;
  lastSector2: number;
  bestSector1: number;
  bestSector2: number;
  curSector1: number;
  curSector2: number;
  bestLapSector1: number;
  bestLapSector2: number;
  lapStartEt: number;
  /** Engine estimate based on progress, NOT elapsed lap seconds. Never use as a clock or trace timestamp. */
  timeIntoLap: number;
  estimatedLapTime: number;
  inPits: boolean;
  /** rF2 `mCountLapFlag`: 0 neither, 1 lap only, 2 lap and time. */
  countLapFlag: number;
  lapsBehindLeader: number;
  /** rF2 `mFinishStatus`: 0 none, 1 finished, 2 DNF, 3 DQ. */
  finishStatus: number;
  pitStops?: number;
  /** LMU `mPitState`, read as LMU's REST names the same moments (`pitState` in `rf2Decode.ts`). */
  pitState?: LivePitState;
  /** rF2 `mNumPenalties`: outstanding penalties. */
  penalties?: number;
}

export interface LiveState {
  lifecycle: LiveLifecycle;
  session: LiveSessionInfo | null;
}

/** LMU sessions are timed: a plausible end time (an unset one reads huge). The lap limit is never used (LMU reports 2^32 - 1). */
const MAX_PLAUSIBLE_END_SECONDS = 1_000_000;
const PAUSED_PHASE = 9;

export function liveSessionKind(sessionCode: number): LiveSessionKind {
  if (sessionCode >= 0 && sessionCode <= 4) return 'practice';
  if (sessionCode >= 5 && sessionCode <= 8) return 'qualifying';
  if (sessionCode === 9) return 'warmup';
  if (sessionCode >= 10 && sessionCode <= 13) return 'race';
  return 'unknown';
}

/** What LMU's `navigation/state` says beside the buffer (`navigationState`, loading, and `settingMode` for a replay). */
export type LiveGameScreen = 'menu' | 'loading' | 'session';

/**
 * Lifecycle from navigation first (loading/menu), then scoring: no reading -> offline;
 * LMU on its main menu (or playing a replay) -> menu; an initializing empty session stays loading;
 * not in realtime -> garage; game phase
 * 0-4 -> starting, 5-7 -> driving, 8 -> finished once the player has taken the flag (or is out), still driving on
 * the last lap until then (the session is over from the leader's flag, a lap or more before a slower car's); phase 9
 * (paused) keeps the previous lifecycle. `screen` comes
 * from LMU's `navigation/state`: the buffer keeps the last session (vehicles included) after the driver leaves
 * it for the menu (seen live 2026-10-16).
 */
export function deriveLiveState(reading: LiveScoringReading | null, previous: LiveLifecycle, screen: LiveGameScreen = 'session'): LiveState {
  if (screen === 'loading') return { lifecycle: 'loading', session: null };
  if (screen === 'menu') return { lifecycle: 'menu', session: null };
  if (!reading) return { lifecycle: 'offline', session: null };
  const state = (lifecycle: LiveLifecycle): LiveState => ({
    lifecycle,
    session: lifecycle === 'menu' ? null : sessionInfo(reading),
  });
  // Navigation still says session: an empty buffer during initialization is not proof of the main menu.
  if (reading.numVehicles <= 0) return { lifecycle: 'loading', session: null };
  if (!reading.inRealtime) return state('garage');
  const phase = reading.gamePhase;
  if (phase >= 0 && phase <= 4) return state('starting');
  if (phase >= 5 && phase <= 7) return state('driving');
  if (phase === 8) return state(reading.player && reading.player.finishStatus === 0 ? 'driving' : 'finished');
  // Paused (offline LMU never reports it; seen only in a race garage): the lifecycle stays.
  if (phase === PAUSED_PHASE) return state(previous === 'offline' || previous === 'menu' || previous === 'loading' ? 'driving' : previous);
  return state(previous);
}

function sessionInfo(reading: LiveScoringReading): LiveSessionInfo {
  const timed = Number.isFinite(reading.endEt) && reading.endEt > 0 && reading.endEt < MAX_PLAUSIBLE_END_SECONDS;
  return {
    kind: liveSessionKind(reading.sessionCode),
    sessionCode: reading.sessionCode,
    gamePhase: reading.gamePhase,
    inRealtime: reading.inRealtime,
    trackName: reading.trackName,
    vehicleName: reading.player?.vehicleName ?? '',
    vehicleClass: reading.player?.vehicleClass ?? '',
    elapsedSeconds: reading.currentEt,
    endSeconds: timed ? reading.endEt : null,
    playerLapsCompleted: reading.player?.totalLaps ?? null,
    playerPlace: reading.player?.place ?? null,
    playerClassPlace: reading.playerClassPlace ?? null,
    finishStatus: reading.player?.finishStatus ?? 0,
  };
}

/** Lifecycles in which a session is loaded in the game (the app must not read the game's files). */
export function isLiveSessionLoaded(lifecycle: LiveLifecycle): boolean {
  return lifecycle === 'loading' || lifecycle === 'garage' || lifecycle === 'starting' || lifecycle === 'driving' || lifecycle === 'finished';
}

/** Lifecycles in which the driver is on track and pedal samples are streamed. */
export function isLiveOnTrack(lifecycle: LiveLifecycle): boolean {
  return lifecycle === 'starting' || lifecycle === 'driving' || lifecycle === 'finished';
}
