import type { LiveLapRecord, LiveSessionBest, LiveTiming } from '../../types/live.js';
import type { LiveScoringReading, LiveVehicleReading } from './liveLifecycle.js';

type Sectors = [number | null, number | null, number | null];
interface TracePoint { dist: number; time: number }

/** How many completed laps `recentLaps` keeps. */
export const LIVE_RECENT_LAP_COUNT = 3;
/** A lap trace is a usable reference only when its first sample is this close to the line (meters). */
const MAX_START_DIST = 100;
/** A bigger jump between two samples (meters) means samples were lost; the trace is no reference. */
const MAX_GAP = 400;
/** Going back more than this (meters) within a lap means a reset or a tow; the trace is no reference. */
const REVERSE_TOLERANCE = 20;
/** The session clock going back by more than this (seconds) means the session restarted. */
const CLOCK_REGRESSION = 1;

interface CurrentLap {
  /** Laps completed when the lap started. */
  completedLaps: number;
  startSeconds: number | null;
  /** A new counter must receive a newer anchor before its timing can be used. */
  previousStartSeconds: number | null;
  departureSeconds: number | null;
  departureDistance: number;
  startedInPits: boolean;
  lastInPits: boolean;
  /** The lap was seen from (about) the line, so its trace is whole. False when the app joined mid-lap. */
  fromStart: boolean;
  trace: TracePoint[];
}

const positive = (value: number): number | null => (Number.isFinite(value) && value > 0 ? value : null);
const ms = (value: number): number => Math.round(value * 1000) / 1000;
const difference = (later: number | null, earlier: number | null): number | null =>
  later !== null && earlier !== null && later > earlier ? ms(later - earlier) : null;

/** Split sector times from the game's cumulative fields (sector 2 = S1 + S2) and the lap time. */
function splitSectors(sector1: number, cumulative2: number, lap: number | null): Sectors {
  const s1 = positive(sector1);
  const c2 = positive(cumulative2);
  return [s1, difference(c2, s1), difference(lap, c2)];
}

/** Reference time at `dist` by linear interpolation; null outside the trace. */
function timeAt(trace: readonly TracePoint[], dist: number): number | null {
  if (trace.length < 2 || dist < trace[0].dist || dist > trace[trace.length - 1].dist) return null;
  let low = 0;
  let high = trace.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (trace[mid].dist <= dist) low = mid; else high = mid;
  }
  const a = trace[low];
  const b = trace[high];
  return a.time + (b.time - a.time) * ((dist - a.dist) / (b.dist - a.dist));
}

/**
 * The player's lap timing for one session, fed the scoring readings (about 5 Hz). Deterministic, no clock of its own.
 *
 * - A lap completes when `totalLaps` rises; the game's last-lap fields on that reading time it. Sector times
 *   are split from the game's cumulative fields. A clean flying lap is `valid` when the game publishes a positive
 *   completed time and it did not start or end in the pits. Current-lap flags and trace coverage do not veto it.
 * - The session best is the fastest valid lap. Its distance->time trace is the reference for the live delta.
 *   Joining mid-session seeds the best lap time and sectors from the game's own best-lap fields, without a trace.
 * - `deltaSeconds` = session elapsed time minus the lap-start anchor, minus the reference time at the same lap distance (linear interpolation).
 *   It is null without a reference, in the pit lane and on a lap that started in the pits (an out lap is not
 *   comparable). A lap that lost its time still shows a delta: the driver keeps driving it.
 * - `sectorDeltas` = the completed split sectors of the current lap minus those of the session-best lap.
 * - A new session (session code or track change, clock regression, fewer laps, no player) clears everything.
 */
export class LiveLapTiming {
  private sessionKey: string | null = null;
  private lastEt = 0;
  private current: CurrentLap | null = null;
  private latest: LiveVehicleReading | null = null;
  private elapsedSeconds: number | null = null;
  private records: LiveLapRecord[] = [];
  private best: LiveSessionBest | null = null;
  private reference: TracePoint[] | null = null;

  public get recentLaps(): LiveLapRecord[] { return this.records.slice(-LIVE_RECENT_LAP_COUNT); }
  public get sessionBest(): LiveSessionBest | null { return this.best; }

  public reset(): void {
    this.sessionKey = null;
    this.current = null;
    this.latest = null;
    this.elapsedSeconds = null;
    this.records = [];
    this.best = null;
    this.reference = null;
  }

  public update(reading: LiveScoringReading | null): void {
    const player = reading?.player;
    if (!reading || !player) { this.reset(); return; }
    const key = `${reading.sessionCode}|${reading.trackName}`;
    const restarted = this.current !== null &&
      (reading.currentEt < this.lastEt - CLOCK_REGRESSION || player.totalLaps < this.current.completedLaps);
    if (key !== this.sessionKey || restarted) {
      this.reset();
      this.sessionKey = key;
    }
    this.lastEt = reading.currentEt;
    if (!this.current) this.startSession(player);
    else if (player.totalLaps > this.current.completedLaps) this.completeLap(player, reading.trackLength, reading.currentEt);
    if (this.current && this.addSample(this.current, player, reading)) this.latest = player;
  }

  /** Current-lap progress for the page; null before a player reading. */
  public timing(): LiveTiming | null {
    const player = this.latest;
    const lap = this.current;
    if (!player || !lap) return null;
    const delta = this.delta(player, lap);
    const sector = player.sector === 0 ? 3 : player.sector === 2 ? 2 : 1;
    // Gate by progress: the game's current-sector fields can still hold the previous lap's splits at the line.
    const done = lap.startedInPits ? [null, null, null] as Sectors : splitSectors(
      sector > 1 ? player.curSector1 : -1, sector > 2 ? player.curSector2 : -1, null,
    );
    const best = this.best?.lapSectors;
    const sectorDeltas = done.map((time, i) => (time !== null && best?.[i] != null ? ms(time - best[i]) : null)) as Sectors;
    const completed = sectorDeltas.slice(0, sector - 1);
    const splitDelta = !player.inPits && !lap.startedInPits && this.best?.lapSeconds != null
      && completed.length > 0 && completed.every(value => value !== null)
      ? ms(completed.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
    const estimateDelta = delta ?? splitDelta;
    const referenceSeconds = this.best?.lapSeconds;
    const lapEstimate: LiveTiming['lapEstimate'] = referenceSeconds != null && estimateDelta !== null
      && Number.isFinite(estimateDelta) && referenceSeconds + estimateDelta > 0
      ? { seconds: ms(referenceSeconds + estimateDelta), referenceSeconds, deltaSeconds: estimateDelta,
        source: delta !== null ? 'distance' : 'sector' } : null;
    return {
      lapNumber: player.totalLaps + 1,
      isOutLap: lap.startedInPits,
      sector,
      lapElapsedSeconds: this.elapsedSeconds === null ? null : ms(this.elapsedSeconds),
      sectors: done,
      deltaSeconds: delta,
      lapEstimate,
      sectorDeltas,
    };
  }

  private delta(player: LiveVehicleReading, lap: CurrentLap): number | null {
    if (!this.reference || lap.startedInPits || player.inPits || this.elapsedSeconds === null || player.lapDist < 0) return null;
    const reference = timeAt(this.reference, player.lapDist);
    return reference === null ? null : ms(this.elapsedSeconds - reference);
  }

  private startSession(player: LiveVehicleReading): void {
    this.current = this.newLap(player, player.totalLaps > 0);
    const bestLap = positive(player.bestLapTime);
    if (player.totalLaps > 0 && bestLap !== null) {
      this.best = {
        lapSeconds: bestLap,
        lapSectors: splitSectors(player.bestLapSector1, player.bestLapSector2, bestLap),
        bestSectors: [null, null, null],
        bestPossibleSeconds: null,
      };
    }
  }

  private newLap(player: LiveVehicleReading, joinedMidLap: boolean, previousStartSeconds: number | null = null): CurrentLap {
    return {
      completedLaps: player.totalLaps,
      startSeconds: null,
      previousStartSeconds,
      departureSeconds: null,
      departureDistance: player.lapDist,
      startedInPits: player.inPits,
      lastInPits: player.inPits,
      fromStart: !joinedMidLap,
      trace: [],
    };
  }

  private addSample(lap: CurrentLap, player: LiveVehicleReading, reading: LiveScoringReading): boolean {
    const last = lap.trace[lap.trace.length - 1];
    // Position can cross the line a scoring frame before the lap counter. Keep the old trace and clock.
    if (last && reading.trackLength > 0 && !player.inPits && last.dist > reading.trackLength - MAX_GAP
      && player.lapDist >= 0 && player.lapDist < MAX_START_DIST) return false;
    if (reading.gamePhase === 9) return true;
    const now = reading.currentEt;
    const anchor = player.lapStartEt;
    const validAnchor = Number.isFinite(now) && Number.isFinite(anchor) && anchor >= 0 && anchor <= now
      && !(lap.startedInPits && anchor === 0)
      && (lap.previousStartSeconds === null || anchor > lap.previousStartSeconds);
    if (validAnchor && anchor !== lap.startSeconds) {
      // A late-settling lap anchor shifts every trace point onto the same clock.
      if (lap.startSeconds !== null) {
        const shift = lap.startSeconds - anchor;
        for (const point of lap.trace) point.time += shift;
        if (lap.trace.some(point => point.time < 0)) lap.fromStart = false;
      }
      lap.startSeconds = anchor;
    }
    if (!reading.inRealtime) {
      lap.departureSeconds = null;
      lap.departureDistance = player.lapDist;
      if (player.inPits) { lap.startedInPits = true; lap.fromStart = false; lap.trace = []; }
    } else if (lap.startedInPits && lap.departureSeconds === null
      && Math.abs(player.lapDist - lap.departureDistance) > 0.5) {
      // Initial out-lap has no timing-line anchor: start at the observed departure, in game seconds.
      lap.departureSeconds = now;
    }
    const start = lap.startedInPits ? lap.departureSeconds : lap.startSeconds;
    this.elapsedSeconds = start !== null && Number.isFinite(now) && now >= start && player.lapDist >= 0 ? now - start : null;
    lap.lastInPits = player.inPits;
    if (this.elapsedSeconds === null || player.lapDist < 0) return true;
    if (!last) {
      if (player.lapDist > MAX_START_DIST) lap.fromStart = false;
    } else if (player.lapDist < last.dist - REVERSE_TOLERANCE || player.lapDist - last.dist > MAX_GAP
      || this.elapsedSeconds < last.time) {
      lap.fromStart = false;
    }
    if (!last || player.lapDist > last.dist) lap.trace.push({ dist: player.lapDist, time: this.elapsedSeconds });
    return true;
  }

  private completeLap(player: LiveVehicleReading, trackLength: number, currentEt: number): void {
    const lap = this.current;
    if (!lap) return;
    const gameSeconds = positive(player.lastLapTime);
    const computed = player.totalLaps === lap.completedLaps + 1 && lap.startSeconds !== null
      ? difference(Number.isFinite(player.lapStartEt) && player.lapStartEt <= currentEt ? player.lapStartEt : null, lap.startSeconds) : null;
    const seconds = gameSeconds ?? computed;
    const record: LiveLapRecord = {
      lapNumber: player.totalLaps,
      lapSeconds: seconds,
      ...(gameSeconds === null && computed !== null ? { timeSource: 'lap-start' as const } : {}),
      sectors: splitSectors(player.lastSector1, player.lastSector2, seconds),
      valid: gameSeconds !== null && !lap.startedInPits && !lap.lastInPits,
    };
    this.records.push(record);
    if (this.records.length > LIVE_RECENT_LAP_COUNT) this.records.shift();
    if (record.valid && seconds !== null) this.acceptValidLap(record, seconds, lap, trackLength);
    this.current = this.newLap(player, false, lap.startSeconds);
  }

  private acceptValidLap(record: LiveLapRecord, seconds: number, lap: CurrentLap, trackLength: number): void {
    const previous = this.best;
    const bestSectors: Sectors = [...(previous?.bestSectors ?? [null, null, null])] as Sectors;
    record.sectors.forEach((time, i) => {
      if (time !== null && (bestSectors[i] === null || time < bestSectors[i])) bestSectors[i] = time;
    });
    const faster = previous?.lapSeconds == null || seconds < previous.lapSeconds;
    const replaceReference = faster || (this.reference === null && seconds === previous?.lapSeconds);
    const [b1, b2, b3] = bestSectors;
    this.best = {
      lapSeconds: faster ? seconds : previous.lapSeconds,
      lapSectors: replaceReference ? record.sectors : previous.lapSectors,
      bestSectors,
      bestPossibleSeconds: b1 !== null && b2 !== null && b3 !== null ? ms(b1 + b2 + b3) : null,
    };
    if (replaceReference) this.reference = this.finishedTrace(lap, seconds, trackLength);
  }

  /** The lap's samples closed at both ends (the line at 0 and the finish at the circuit length); null for a trace that is not whole. */
  private finishedTrace(lap: CurrentLap, seconds: number, trackLength: number): TracePoint[] | null {
    if (!lap.fromStart || lap.trace.length < 2) return null;
    const trace = lap.trace[0].dist > 0 ? [{ dist: 0, time: 0 }, ...lap.trace] : [...lap.trace];
    const last = trace[trace.length - 1];
    if (trackLength > last.dist && trackLength - last.dist <= MAX_GAP) trace.push({ dist: trackLength, time: seconds });
    return trace;
  }
}
