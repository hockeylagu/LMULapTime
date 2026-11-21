/**
 * Corner passes: each car's time through each turn segment (or turn sequence) of each lap, with the
 * cues of how it drove it. Built once per replay from its stored laps at full rate, at ingestion;
 * never a source of truth. Only replay laps have passes (a telemetry-only session has none), and a
 * replay whose passes are missing or of another version shows "not built": they are rebuilt offline,
 * never on open.
 */
import type { CornerPass } from '../../shared/types/corners/cornerPasses.js';

/** Bumped when the pass rule or the stored pass row changes: every replay's passes are rebuilt offline. */
export const CORNER_PASS_VERSION = 19;

/** Samples further apart than this are a gap in the recording: no crossing is read across it. */
const MAX_SAMPLE_GAP_SEC = 1.5;
/** A jump along the track larger than this between two samples is a teleport, not driving. */
const MAX_SAMPLE_JUMP_M = 200;
/**
 * A lap with no neighbour to borrow from (the first or last stored): its first or last sample this close to the
 * line counts as on it.
 */
const LINE_SNAP_M = 10;
/** The samples of the laps before and after borrowed for the turns on the line (metres before the lap's start, after its end). */
const LINE_BORROW_M = 200;
/** Brake pedal from which the car is braking (0-1). */
const BRAKE_ON = 0.1;
/** Brake releases shorter than this stay one braking (a driver's trail-brake stab). */
const BRAKE_MERGE_SEC = 0.25;
/** A braking that ended more than this before the slowest point belongs to an earlier corner. */
const BRAKE_TO_SLOWEST_MAX_SEC = 2;
/** Steering from which the car is turning in (share of full lock, one side: about 8-10Â° at the wheel). */
const TURN_IN_STEER = 0.04;
/** Throttle under this is a lift; back over it the car is accelerating again (0-1). */
const THROTTLE_ON = 0.5;
/** The throttle must come back within this after the slowest point to count. */
const THROTTLE_SEARCH_SEC = 5;
/** Throttle from which the car is at full throttle, and under which it is off the throttle (0-1): between is part throttle. */
const THROTTLE_FULL = 0.95;
const THROTTLE_OFF = 0.1;
/** Another car within this gap (seconds at this car's speed), ahead or behind, is recorded as traffic. */
export const TRAFFIC_RANGE_SEC = 2;
/**
 * Below this speed (m/s) a gap in time means nothing: the car is stopped or crawling. Such a car is no one's traffic either:
 * a parked safety car or retired car would otherwise be the car ahead of every pass driving by (pass version 17).
 */
const TRAFFIC_MIN_SPEED_MPS = 5;
/** How often the cars' order on the track is read for traffic. */
const TRAFFIC_HZ = 4;

/** One stored lap of one car at full rate, its samples already placed on the centre line. */
export interface PassLapSamples {
  lapNumber: number;
  times: number[];
  /** Distance from the start line along the centre line, 0 to the track length (metres). */
  stations: number[];
  speedKmh: Array<number | null>;
  throttle: Array<number | null>;
  brake: Array<number | null>;
  /** Steering, positive left, as a share of full lock (-1 to 1). */
  steer: Array<number | null>;
  /** Gear and the TC and ABS lamps; absent when not read (no gear, no TC or ABS time). */
  gear?: Array<number | null>;
  tcActive?: boolean[];
  absActive?: boolean[];
  /** False for samples that are not driving the track (pit lane, garage, teleport, far off it, unreadable). */
  usable: boolean[];
}

export interface CarLaps {
  slot: number;
  laps: PassLapSamples[];
  /** This car's own segments in place of the build's (a class's sequences); none: it is only traffic for the others. */
  segments?: PassSegment[];
}

/** A turn's segment of the centre line, from the start line (metres). */
export interface PassSegment {
  id: number;
  startM: number;
  endM: number;
}

/** A lap's driving samples, unwrapped into one distance from the start line. */
interface LapTrack {
  lapNumber: number;
  t: number[];
  d: number[];
  speed: Array<number | null>;
  throttle: Array<number | null>;
  brake: Array<number | null>;
  steer: Array<number | null>;
  gear: Array<number | null>;
  tc: boolean[];
  abs: boolean[];
  /** Whether sample i follows sample i - 1 without a gap. */
  joined: boolean[];
}

/** Whether a sample follows the one before it without a gap in the recording or a teleport. */
const follows = (previousT: number, previousD: number, t: number, d: number) =>
  t > previousT && t - previousT <= MAX_SAMPLE_GAP_SEC && Math.abs(d - previousD) <= MAX_SAMPLE_JUMP_M;

function lapTrack(lap: PassLapSamples, lengthM: number): LapTrack {
  const track: LapTrack = { lapNumber: lap.lapNumber, t: [], d: [], speed: [], throttle: [], brake: [], steer: [], gear: [], tc: [], abs: [], joined: [] };
  for (let i = 0; i < lap.times.length; i++) {
    const time = lap.times[i];
    const station = lap.stations[i];
    if (!lap.usable[i] || !Number.isFinite(time) || !Number.isFinite(station)) continue;
    const n = track.t.length;
    let distance = station;
    if (n > 0) {
      const previous = track.d[n - 1];
      while (distance < previous - lengthM / 2) distance += lengthM;
      while (distance > previous + lengthM / 2) distance -= lengthM;
    }
    const joined = n > 0 && follows(track.t[n - 1], track.d[n - 1], time, distance);
    if (n > 0 && time <= track.t[n - 1]) continue;
    track.t.push(time);
    track.d.push(distance);
    track.speed.push(lap.speedKmh[i]);
    track.throttle.push(lap.throttle[i]);
    track.brake.push(lap.brake[i]);
    track.steer.push(lap.steer[i]);
    track.gear.push(lap.gear?.[i] ?? null);
    track.tc.push(lap.tcActive?.[i] === true);
    track.abs.push(lap.absActive?.[i] === true);
    track.joined.push(joined);
  }
  placeOnLap(track, lengthM);
  return track;
}

/**
 * The stations are unwrapped from the lap's first sample, so the lap may sit whole track lengths off: one starting
 * just short of the line (cut before it, a grid behind it), one after stray samples left before a trip to the
 * garage, or a race's lap 1 holding the formation lap before the race lap. Of the track lengths the lap drives
 * (distance between samples that follow each other, not sample counts: a slow run has many), it is placed on the
 * last one with at least half the distance of the longest, the one the lap was timed on. An out-lap from a pit exit
 * late in the lap stays where it is.
 */
function placeOnLap(track: LapTrack, lengthM: number): void {
  const { d, joined } = track;
  if (d.length < 2 || lengthM <= 0) return;
  const distance = new Map<number, number>();
  for (let i = 1; i < d.length; i++) {
    if (!joined[i]) continue;
    const k = Math.floor(Math.min(d[i], d[i - 1]) / lengthM);
    if (Math.floor(Math.max(d[i], d[i - 1]) / lengthM) !== k) continue;
    distance.set(k, (distance.get(k) ?? 0) + Math.abs(d[i] - d[i - 1]));
  }
  const longest = Math.max(0, ...distance.values());
  if (longest === 0) return;
  const k = Math.max(...[...distance].filter(([, metres]) => metres >= longest / 2).map(([lap]) => lap));
  if (k !== 0) track.d = d.map(value => value - k * lengthM);
}

/**
 * The lap with the samples of the laps before and after it within `borrowM` of its ends. A stored lap is cut
 * where the game timed it, often metres past the centre line's start: the crossing of a turn starting on the line
 * is then in the previous lap's last samples, and of one ending on it in the next lap's first ones.
 */
function withNeighbours(track: LapTrack, previous: LapTrack | undefined, next: LapTrack | undefined, lengthM: number, borrowM: number): LapTrack {
  const n = track.t.length;
  if (n === 0) return track;
  const out: LapTrack = { lapNumber: track.lapNumber, t: [], d: [], speed: [], throttle: [], brake: [], steer: [], gear: [], tc: [], abs: [], joined: [] };
  const push = (from: LapTrack, i: number, shift: number, joined: boolean) => {
    out.t.push(from.t[i]);
    out.d.push(from.d[i] + shift);
    out.speed.push(from.speed[i]);
    out.throttle.push(from.throttle[i]);
    out.brake.push(from.brake[i]);
    out.steer.push(from.steer[i]);
    out.gear.push(from.gear[i]);
    out.tc.push(from.tc[i]);
    out.abs.push(from.abs[i]);
    out.joined.push(joined);
  };
  // Only the unbroken run that leads into the lap's first sample, and the one that carries on from its last: other
  // samples of a neighbour (a long lap's wait in the garage) are nowhere near this crossing.
  // Each lap is placed on its own, so the shift lining a neighbour up with this lap is the whole number of track
  // lengths between them where they meet (usually one, none when that lap sat a length back).
  const lineUp = (from: number, to: number) => Math.round((to - from) / lengthM) * lengthM;
  if (previous?.lapNumber === track.lapNumber - 1) {
    let end = previous.t.length - 1;
    while (end >= 0 && previous.t[end] >= track.t[0]) end--;
    const shift = end >= 0 ? lineUp(previous.d[end], track.d[0]) : 0;
    if (end >= 0 && follows(previous.t[end], previous.d[end] + shift, track.t[0], track.d[0])) {
      let start = end;
      while (start > 0 && previous.joined[start] && previous.d[start - 1] + shift >= track.d[0] - borrowM) start--;
      for (let i = start; i <= end; i++) push(previous, i, shift, i > start);
    }
  }
  for (let i = 0; i < n; i++) push(track, i, 0, i === 0 ? out.t.length > 0 : track.joined[i]);
  if (next?.lapNumber === track.lapNumber + 1) {
    let i = 0;
    while (i < next.t.length && next.t[i] <= track.t[n - 1]) i++;
    const shift = i < next.t.length ? lineUp(next.d[i], track.d[n - 1]) : 0;
    if (i < next.t.length && follows(track.t[n - 1], track.d[n - 1], next.t[i], next.d[i] + shift)) {
      for (let first = i; i < next.t.length && next.d[i] + shift <= track.d[n - 1] + borrowM && (i === first || next.joined[i]); i++) {
        push(next, i, shift, true);
      }
    }
  }
  return out;
}

const lerp = (a: number | null, b: number | null, f: number): number | null =>
  a === null || b === null ? null : a + (b - a) * f;

interface Crossing { index: number; sec: number; speedKmh: number | null }

/** Where the lap crosses `boundaryM`: the sample index reached, the interpolated time and speed, or null. */
function crossing(track: LapTrack, boundaryM: number, from: number): Crossing | null {
  const { t, d, joined, speed } = track;
  const n = t.length;
  if (n === 0) return null;
  // A lap starting just past the boundary crossed it there. Samples further past it have not crossed it: stray ones
  // left before a trip to the garage, ahead of where the car comes back. The crossing is the first step from short
  // of the boundary to past it, between two samples that follow each other: a jump over it (a teleport before the
  // start, a gap in the recording) is not where the car crossed it.
  if (from === 0 && d[0] >= boundaryM && d[0] - boundaryM <= LINE_SNAP_M) return { index: 0, sec: t[0], speedKmh: speed[0] };
  for (let i = Math.max(1, from); i < n; i++) {
    if (d[i] < boundaryM || d[i - 1] >= boundaryM || !joined[i]) continue;
    const f = (boundaryM - d[i - 1]) / (d[i] - d[i - 1]);
    return { index: i, sec: t[i - 1] + (t[i] - t[i - 1]) * f, speedKmh: lerp(speed[i - 1], speed[i], f) };
  }
  const short = boundaryM - d[n - 1];
  return short >= 0 && short <= LINE_SNAP_M ? { index: n - 1, sec: t[n - 1], speedKmh: speed[n - 1] } : null;
}

/** Braking runs of a lap as [first, last] sample indexes, short releases merged. */
function brakeRuns(track: LapTrack): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < track.t.length; i++) {
    if ((track.brake[i] ?? 0) < BRAKE_ON) continue;
    const last = runs[runs.length - 1];
    if (last && track.joined[i] && track.t[i] - track.t[last[1]] <= BRAKE_MERGE_SEC) last[1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/**
 * Where the steering into this corner began: the start of the steered run, in the slowest point's direction,
 * that holds the slowest point, after `first` (the sample after the previous corner's slowest point: a turn-in may
 * come just before the segment's start). Null when the car is not steering there (a kink taken straight) or is
 * still steering from the previous corner.
 */
function turnInIndex(track: LapTrack, slowest: number, first: number): number | null {
  const atSlowest = track.steer[slowest];
  if (atSlowest === null || Math.abs(atSlowest) < TURN_IN_STEER) return null;
  const side = Math.sign(atSlowest);
  for (let i = slowest; i > first; i--) {
    if (!track.joined[i]) return null;
    const steer = track.steer[i - 1];
    if (steer === null || steer * side < TURN_IN_STEER) return i;
  }
  return null;
}

/**
 * Where the car is back on the throttle after its lift for this corner: the end of the lift that holds the slowest
 * point or comes last before it, or the first one after it inside the pass (between `first`, after the previous
 * pass's slowest point and throttle point, and `end`); the throttle
 * may come back after the pass, within THROTTLE_SEARCH_SEC. Null when the car did not lift (taken flat). The slowest
 * point itself is not a cue: speed bottoms out as the throttle comes back, so the throttle is always there a sample
 * later.
 */
function throttleOnIndex(track: LapTrack, slowest: number, first: number, end: number): number | null {
  const on = (i: number) => (track.throttle[i] ?? 0) >= THROTTLE_ON;
  let lift = -1;
  for (let i = slowest; i >= first; i--) {
    if (!on(i)) { lift = i; break; }
    if (!track.joined[i]) break;
  }
  if (lift < 0) {
    // Not lifted by the slowest point: a lift after it inside the pass (a car slowest at turn-in) still counts.
    for (let i = slowest + 1; i < end; i++) {
      if (!track.joined[i]) return null;
      if (!on(i)) { lift = i; break; }
    }
    if (lift < 0) return null;
  }
  for (let i = lift + 1; i < track.t.length && track.t[i] - track.t[slowest] <= THROTTLE_SEARCH_SEC; i++) {
    if (!track.joined[i]) return null;
    if (on(i)) return i;
  }
  return null;
}

/** The time (s) from sample `from` to sample `to` spent where `holds(i)` is true of the sample starting each step. */
function timeWhere(track: LapTrack, from: number, to: number, holds: (i: number) => boolean): number {
  let sec = 0;
  for (let i = Math.max(0, from); i < to && i + 1 < track.t.length; i++) {
    if (track.joined[i + 1] && holds(i)) sec += track.t[i + 1] - track.t[i];
  }
  return sec;
}

/** Brake under this (0-1) is off the brake for coasting (the corner-map branch's 5 %). */
const BRAKE_OFF = 0.05;

/**
 * Coasting: off both pedals from the end of the braking (else the segment's start) to the throttle pick-up (else the
 * segment's end) (s). The corner-map branch's coasting; its other technique cues did not survive the blind validation
 * of 2026-11-20 (shared/domain/cornerAnalysis/analyzeCorners.ts).
 */
function coastSec(track: LapTrack, entry: number, exit: number, run: [number, number] | null, throttleOn: number | null): number {
  return timeWhere(track, run ? run[1] + 1 : entry, throttleOn ?? exit, i => (track.brake[i] ?? 0) < BRAKE_OFF && (track.throttle[i] ?? 0) < THROTTLE_OFF);
}
/** How the car drove a pass beyond its points: gear, braking, part throttle out of the slowest point and ABS. */
function driveCues(track: LapTrack, entry: number, exit: number, slowest: number, brakeStart: number | null) {
  const from = brakeStart ?? entry;
  let peakBrake: number | null = null;
  for (let i = from; i < exit; i++) {
    const brake = track.brake[i];
    if (brake !== null && (peakBrake === null || brake > peakBrake)) peakBrake = brake;
  }
  return {
    minSpeedGear: track.gear[slowest],
    peakBrake,
    brakeSec: timeWhere(track, from, exit, i => (track.brake[i] ?? 0) >= BRAKE_ON),
    partThrottleSec: timeWhere(track, slowest, exit, i => {
      const throttle = track.throttle[i] ?? 0;
      return throttle >= THROTTLE_OFF && throttle < THROTTLE_FULL && !track.tc[i];
    }),
    absSec: timeWhere(track, from, exit, i => track.abs[i]),
  };
}

const NO_DRIVE_CUES = { minSpeedGear: null, peakBrake: null, brakeSec: 0, partThrottleSec: null, absSec: 0 };

/** The first sample after `from` up to `to` that does not follow the one before it, or -1. */
function breakIn(track: LapTrack, from: number, to: number): number {
  for (let i = from + 1; i <= to; i++) if (!track.joined[i]) return i;
  return -1;
}

/**
 * A lap's passes. The lap may drive more than one track length (a race's lap 1 holding the formation lap, or the
 * start from a grid behind the line); every turn it drives is timed, and the last pass of each turn is the lap's.
 * A pass belongs to the lap when its midpoint falls inside the lap's own time (`ownFromSec`..`ownToSec`): the
 * neighbours' samples only complete the passes across the line.
 */
function lapPasses(slot: number, track: LapTrack, segments: PassSegment[], lengthM: number, ownFromSec: number, ownToSec: number): CornerPass[] {
  if (track.d.length === 0 || lengthM <= 0) return [];
  const last = new Map<number, CornerPass>();
  const runs = brakeRuns(track);
  let nextRun = 0;
  let cursor = 0;
  let previousSlowest = -1;
  let previousThrottleOn = -1;
  // Not Math.min(...d): a lap 1 holding a long wait on the grid has over 100k samples.
  const firstLap = Math.floor(track.d.reduce((a, b) => Math.min(a, b)) / lengthM);
  const lastLap = Math.floor(track.d.reduce((a, b) => Math.max(a, b)) / lengthM);
  // Each track length is searched from the lap's start: after a trip to the garage the car may rejoin a length back,
  // driving that one after the turns it drove before the stop.
  for (let lap = firstLap; lap <= lastLap; lap++, nextRun = 0, cursor = 0, previousSlowest = -1, previousThrottleOn = -1) for (const { id, startM, endM } of segments) {
    const offset = lap * lengthM;
    const segment = { id, startM: startM + offset, endM: endM + offset };
    // Look again further on after a pass broken inside (a trip to the garage, a gap in the recording) or one wholly
    // in the previous lap's borrowed samples: the car may drive the segment again in this lap.
    const again = (from: Crossing | null, to: Crossing | null) => {
      if (!from || !to) return -1;
      const broken = breakIn(track, from.index, to.index);
      if (broken >= 0) return broken;
      return (from.sec + to.sec) / 2 < ownFromSec ? to.index : -1;
    };
    let entry = crossing(track, segment.startM, cursor);
    let exit = entry && crossing(track, segment.endM, entry.index);
    for (let from = again(entry, exit); from >= 0; from = again(entry, exit)) {
      entry = crossing(track, segment.startM, from);
      exit = entry && crossing(track, segment.endM, entry.index);
    }
    if (!entry || !exit || exit.sec <= entry.sec) continue;
    cursor = exit.index;
    let slowest = -1;
    // The samples inside the segment; exit.index is the first one past its end.
    for (let i = entry.index; i < exit.index; i++) {
      const speed = track.speed[i];
      if (speed !== null && Number.isFinite(speed) && (slowest < 0 || speed < (track.speed[slowest] as number))) slowest = i;
    }
    // Still accelerating out of the previous corner at the entry, or already braking for the next one at the
    // exit: the segment is slowest at that end.
    let minSpeedKmh = slowest >= 0 ? track.speed[slowest] : null;
    let minSpeedM = slowest >= 0 ? track.d[slowest] : null;
    let minSpeedSec = slowest >= 0 ? track.t[slowest] : null;
    for (const [end, m] of [[entry, segment.startM], [exit, segment.endM]] as const) {
      if (end.speedKmh !== null && (minSpeedKmh === null || end.speedKmh < minSpeedKmh)) {
        minSpeedKmh = end.speedKmh;
        minSpeedM = m;
        minSpeedSec = end.sec;
      }
    }

    let brakeM: number | null = null;
    let turnInM: number | null = null;
    let throttleM: number | null = null;
    let brakeStart: number | null = null;
    let run: [number, number] | null = null;
    let throttleOn: number | null = null;
    if (slowest >= 0) {
      // The braking for this corner: the last one that starts after the previous corner's slowest point,
      // starts by this one's slowest point and is still on shortly before it.
      while (nextRun < runs.length && runs[nextRun][0] <= previousSlowest) nextRun++;
      let chosen = -1;
      for (let r = nextRun; r < runs.length && runs[r][0] <= slowest; r++) {
        if (track.t[slowest] - track.t[runs[r][1]] <= BRAKE_TO_SLOWEST_MAX_SEC) chosen = r;
      }
      if (chosen >= 0) {
        run = runs[chosen];
        brakeStart = run[0];
        brakeM = track.d[brakeStart];
        nextRun = chosen + 1;
      }
      // Never back into the previous corner: its slowest point, and the throttle point it already took.
      const turnIn = turnInIndex(track, slowest, previousSlowest + 1);
      if (turnIn !== null) turnInM = track.d[turnIn];
      throttleOn = throttleOnIndex(track, slowest, Math.max(previousSlowest, previousThrottleOn) + 1, exit.index);
      if (throttleOn !== null) {
        throttleM = track.d[throttleOn];
        previousThrottleOn = throttleOn;
      }
      previousSlowest = slowest;
    }
    // A segment running across the line (a sequence ending in the next lap) is the lap's it starts in.
    const ownSec = endM > lengthM ? entry.sec : (entry.sec + exit.sec) / 2;
    if (ownSec < ownFromSec || ownSec > ownToSec) continue;
    const onLap = (m: number | null) => (m === null ? null : m - offset);
    if ((last.get(id)?.entrySec ?? -Infinity) > entry.sec) continue;
    last.set(id, {
      slot, lapNumber: track.lapNumber, segment: id,
      entrySec: entry.sec, minSpeedSec, exitSec: exit.sec,
      entrySpeedKmh: entry.speedKmh, minSpeedKmh, exitSpeedKmh: exit.speedKmh,
      minSpeedM: onLap(minSpeedM), brakeM: onLap(brakeM), turnInM: onLap(turnInM), throttleM: onLap(throttleM),
      ...(slowest >= 0 ? driveCues(track, entry.index, exit.index, slowest, brakeStart) : NO_DRIVE_CUES),
      coastSec: slowest >= 0 ? coastSec(track, entry.index, exit.index, run, throttleOn) : 0,
      aheadSlot: null, aheadGapSec: null,
    });
  }
  return segments.flatMap(({ id }) => last.get(id) ?? []);
}

/** A car's on-track place and speed over time, for reading where it is at any moment. */
interface CarTrace { slot: number; t: number[]; station: number[]; speed: Array<number | null>; joined: boolean[] }

function carTrace(slot: number, tracks: LapTrack[], lengthM: number): CarTrace {
  const trace: CarTrace = { slot, t: [], station: [], speed: [], joined: [] };
  for (const track of tracks) {
    for (let i = 0; i < track.t.length; i++) {
      const n = trace.t.length;
      if (n > 0 && track.t[i] <= trace.t[n - 1]) continue;
      trace.joined.push(n > 0 && i > 0 && track.joined[i] && trace.t[n - 1] === track.t[i - 1]);
      trace.t.push(track.t[i]);
      trace.station.push(((track.d[i] % lengthM) + lengthM) % lengthM);
      trace.speed.push(track.speed[i]);
    }
  }
  return trace;
}

interface Present { slot: number; station: number; speedMps: number }

/** Fills each pass's closest car ahead and behind, reading every car's place TRAFFIC_HZ times a second. */
function addTraffic(passes: CornerPass[], traces: CarTrace[], lengthM: number): void {
  const bySlot = new Map<number, CornerPass[]>();
  for (const pass of passes) {
    const list = bySlot.get(pass.slot);
    if (list) list.push(pass); else bySlot.set(pass.slot, [pass]);
  }
  for (const list of bySlot.values()) list.sort((a, b) => a.entrySec - b.entrySec);
  const start = Math.min(...traces.flatMap(trace => trace.t.length ? [trace.t[0]] : []));
  const end = Math.max(...traces.flatMap(trace => trace.t.length ? [trace.t[trace.t.length - 1]] : []));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const cursors = traces.map(() => 0);
  const passCursor = new Map<number, number>();
  const step = 1 / TRAFFIC_HZ;
  const present: Present[] = [];
  const mps = (kmh: number | null) => kmh === null ? null : kmh / 3.6;
  const add = (slot: number, station: number, speedMps: number | null) => {
    if (speedMps !== null && speedMps >= TRAFFIC_MIN_SPEED_MPS) present.push({ slot, station, speedMps });
  };
  for (let tick = 0, time = start; time <= end; tick++, time = start + tick * step) {
    present.length = 0;
    traces.forEach((trace, c) => {
      let i = cursors[c];
      while (i < trace.t.length && trace.t[i] < time) i++;
      cursors[c] = i;
      if (i >= trace.t.length || i === 0 && trace.t[0] !== time) return;
      if (trace.t[i] === time) { add(trace.slot, trace.station[i], mps(trace.speed[i])); return; }
      if (!trace.joined[i]) return;
      let a = trace.station[i - 1];
      let b = trace.station[i];
      if (b < a - lengthM / 2) b += lengthM; else if (b > a + lengthM / 2) a += lengthM;
      const f = (time - trace.t[i - 1]) / (trace.t[i] - trace.t[i - 1]);
      add(trace.slot, ((a + (b - a) * f) % lengthM + lengthM) % lengthM, mps(lerp(trace.speed[i - 1], trace.speed[i], f)));
    });
    if (present.length < 2) continue;
    present.sort((a, b) => a.station - b.station);
    for (let k = 0; k < present.length; k++) {
      const own = present[k];
      const list = bySlot.get(own.slot);
      if (!list) continue;
      let p = passCursor.get(own.slot) ?? 0;
      while (p < list.length && list[p].exitSec < time) p++;
      passCursor.set(own.slot, p);
      const pass = list[p];
      if (!pass || pass.entrySec > time) continue;
      const ahead = present[(k + 1) % present.length];
      const aheadGapSec = ((ahead.station - own.station + lengthM) % lengthM) / own.speedMps;
      if (aheadGapSec <= TRAFFIC_RANGE_SEC && (pass.aheadGapSec === null || aheadGapSec < pass.aheadGapSec)) {
        pass.aheadGapSec = aheadGapSec;
        pass.aheadSlot = ahead.slot;
      }
    }
  }
}

/** The samples borrowed from the neighbouring laps for segments that run across the line (metres past each end). */
export function lineBorrowM(segments: readonly PassSegment[], lengthM: number): number {
  return Math.max(LINE_BORROW_M, ...segments.flatMap(({ startM, endM }) =>
    endM > lengthM ? [endM - lengthM + LINE_BORROW_M, lengthM - startM + LINE_BORROW_M] : []));
}

/**
 * Every car's passes through every segment (the build's, or the car's own) of every lap it drove through
 * completely. Traffic counts every car.
 */
export function buildCornerPasses(cars: CarLaps[], segments: PassSegment[], lengthM: number): CornerPass[] {
  const passes: CornerPass[] = [];
  const traces: CarTrace[] = [];
  for (const car of cars) {
    const tracks = [...car.laps].sort((a, b) => a.lapNumber - b.lapNumber).map(lap => lapTrack(lap, lengthM));
    tracks.forEach((track, k) => {
      if (track.t.length === 0) return;
      const own = car.segments ?? segments;
      if (own.length === 0) return;
      const joined = withNeighbours(track, tracks[k - 1], tracks[k + 1], lengthM, lineBorrowM(own, lengthM));
      passes.push(...lapPasses(car.slot, joined, own, lengthM, track.t[0], track.t[track.t.length - 1]));
    });
    traces.push(carTrace(car.slot, tracks, lengthM));
  }
  addTraffic(passes, traces, lengthM);
  return passes;
}
