import type { LiveCarReading } from '../../../shared/domain/live/liveCarCondition.js';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import type { DiagnosticEvent } from './diagnostics.js';

// Exploration records for the voice calls (docs/plans/proposed/LIVE_VOICE_CALLS.md): raw game values, analysed after an
// online event. `field` rows are positional (see FIELD_COLUMNS) to keep a 1 Hz line for ~60 cars small; `field-entries`
// and `flags` carry no clock, so the sidecar writes them only when they change (plus its checkpoints).

/** Seconds between `field` lines. Replays already hold every car at 5 Hz; this is for what replays lack. */
export const FIELD_DIAGNOSTIC_SECONDS = 1;
/**
 * Around an incident every scoring update (~5 Hz) is written, to place the cars for the yellow calls: from a flag
 * change, a slow car or a car off track until this long after the last one.
 */
export const FIELD_BURST_SECONDS = 20;
/**
 * Slower than this share of the field's median speed at the same lap distance is a possible incident. A fixed speed
 * fired in hairpins (Portimão online, 2026-10-29: field median 18 m/s there).
 */
export const INCIDENT_SPEED_SHARE = 0.5;
/** Beyond the track edge by more than this is off track; kerbs and the full width read up to ~2 m beyond it. */
export const OFF_TRACK_MARGIN_METERS = 3;
const SPEED_BIN_METERS = 25;
const SPEED_BIN_SAMPLES = 50;
const SPEED_BIN_MIN_SAMPLES = 10;

export const FIELD_COLUMNS = ['id', 'place', 'totalLaps', 'lapDist', 'x', 'z', 'speed', 'pathLateral', 'trackEdge',
  'timeBehindNext', 'lapsBehindNext', 'inPits', 'pitState', 'control', 'finishStatus'] as const;

const tenth = (value: number): number | null => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
const hundredth = (value: number): number | null => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

/** Every car at this moment, plus the player's LMU gap fields; null without a field. */
export function fieldRecord(reading: LiveScoringReading, car: LiveCarReading | null, burst = false): Record<string, unknown> | null {
  if (!reading.field?.length) return null;
  const gaps = car?.timeGaps;
  return {
    elapsedSeconds: hundredth(reading.currentEt),
    burst,
    columns: FIELD_COLUMNS,
    cars: reading.field.map(entry => [entry.id, entry.place, entry.totalLaps, tenth(entry.lapDist), tenth(entry.x), tenth(entry.z),
      tenth(entry.speed), tenth(entry.pathLateral), tenth(entry.trackEdge), hundredth(entry.timeBehindNext), entry.lapsBehindNext,
      entry.inPits ? 1 : 0, entry.pitState, entry.control, entry.finishStatus]),
    playerGaps: gaps ? { carAhead: hundredth(gaps.carAhead), carBehind: hundredth(gaps.carBehind),
      placeAhead: hundredth(gaps.placeAhead), placeBehind: hundredth(gaps.placeBehind) } : null,
  };
}

/** Who each id is: written when the entry list changes. */
export function fieldEntriesRecord(reading: LiveScoringReading): Record<string, unknown> | null {
  if (!reading.field?.length) return null;
  return { cars: reading.field.map(entry => [entry.id, entry.driverName, entry.vehicleName, entry.vehicleFile, entry.vehicleClass]) };
}

/** Session flags: written when they change. */
export function flagsRecord(reading: LiveScoringReading): Record<string, unknown> {
  return { gamePhase: reading.gamePhase, yellowFlagState: reading.yellowFlagState ?? null, sectorFlags: reading.sectorFlags ?? null };
}

/** Recent on-track speeds by lap distance, so "slow" means slow for that spot of the track. */
class FieldSpeedProfile {
  private trackName: string | null = null;
  private lastEt: number | null = null;
  private incidentAtLastEt = false;
  private readonly bins = new Map<number, number[]>();

  /**
   * True when a car on track is crawling or stopped, or off track, while the session is green; then adds the speeds.
   * A re-applied reading (same clock) returns the same answer without adding them again.
   */
  public incident(reading: LiveScoringReading): boolean {
    if (reading.currentEt === this.lastEt) return this.incidentAtLastEt;
    this.lastEt = reading.currentEt;
    if (reading.trackName !== this.trackName) {
      this.trackName = reading.trackName;
      this.bins.clear();
    }
    let incident = false;
    for (const entry of reading.field ?? []) {
      if (entry.inPits || entry.finishStatus !== 0 || entry.control < 0) continue;
      const bin = Math.floor(entry.lapDist / SPEED_BIN_METERS);
      const speeds = this.bins.get(bin) ?? [];
      if (reading.gamePhase === 5 && speeds.length >= SPEED_BIN_MIN_SAMPLES) {
        const median = [...speeds].sort((a, b) => a - b)[speeds.length >> 1];
        if (entry.speed < INCIDENT_SPEED_SHARE * median
          || Math.abs(entry.pathLateral) > Math.abs(entry.trackEdge) + OFF_TRACK_MARGIN_METERS) incident = true;
      }
      speeds.push(entry.speed);
      if (speeds.length > SPEED_BIN_SAMPLES) speeds.shift();
      this.bins.set(bin, speeds);
    }
    this.incidentAtLastEt = incident;
    return incident;
  }
}

/** Writes the field exploration lines: flags and entries on change, every car once a second, every update around incidents. */
export class FieldDiagnosticsLog {
  private lastFieldAt = -Infinity;
  /** The service re-applies the last scoring with each car update: one line per scoring update only. */
  private lastFieldEt: number | null = null;
  private burstUntil = -Infinity;
  private lastFlags: string | null = null;
  private readonly speeds = new FieldSpeedProfile();

  public update(reading: LiveScoringReading, car: LiveCarReading | null, at: number, record: (event: DiagnosticEvent) => void): void {
    const flags = flagsRecord(reading);
    const flagsKey = JSON.stringify(flags);
    if (this.lastFlags !== null && flagsKey !== this.lastFlags) this.burstUntil = at + FIELD_BURST_SECONDS * 1000;
    this.lastFlags = flagsKey;
    if (this.speeds.incident(reading)) this.burstUntil = at + FIELD_BURST_SECONDS * 1000;
    record({ kind: 'flags', at, data: flags });
    const entries = fieldEntriesRecord(reading);
    if (entries) record({ kind: 'field-entries', at, data: entries });
    const burst = at < this.burstUntil;
    if (reading.currentEt === this.lastFieldEt || (!burst && at - this.lastFieldAt < FIELD_DIAGNOSTIC_SECONDS * 1000)) return;
    const field = fieldRecord(reading, car, burst);
    if (!field) return;
    this.lastFieldAt = at;
    this.lastFieldEt = reading.currentEt;
    record({ kind: 'field', at, data: field });
  }
}
