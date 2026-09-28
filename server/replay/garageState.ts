import { ReplayPitEvent, ReplayTrajectoryPoint } from '../core/types.js';

// Pit event codes that bound a stay in the garage. In practice and qualifying, 21 is the car sent
// back to its garage (it stops where it is and reappears in the stall) and 16 is the pit exit after
// driving out of it: LMU sends no event when the car leaves the stall. In a race, 21 comes when the
// car leaves its pit box after a long stop and 16 is sent in the pits; neither is a garage stay
// there, which is why a spell also ends once the car is back up to racing speed.
const GARAGE_RETURN_CODE = 21;
const GARAGE_PIT_EXIT_CODE = 16;
// Pit events that say nothing about where the car is: the pit request and type 49.
const PIT_REQUEST_CODE = 33;
const TYPE_49_CODE = 49;
// The car drives off once it reaches the first speed; the second is beyond any pit-lane limit.
const DRIVING_OFF_KMH = 5;
const RACING_KMH = 100;

/** From a garage return (or the session start) to the pit exit that follows it. */
export interface GarageSpell {
  start: number;
  end: number;
}

/**
 * When one driver may have been in the garage or on the way out of it, from their pit events. A
 * driver whose first pit event is a pit exit (16) started the session in the garage. Type 49
 * events (pit code 49) are not garage returns: they come with pit-lane entries and stall stops.
 */
export function garageSpells(driverPitEvents: ReplayPitEvent[]): GarageSpell[] {
  const events = [...driverPitEvents].sort((a, b) => a.timeSec - b.timeSec);
  const spells: GarageSpell[] = [];
  const first = events.find(e => e.code !== PIT_REQUEST_CODE && e.code !== TYPE_49_CODE);
  if (first?.code === GARAGE_PIT_EXIT_CODE && first.timeSec > 0) {
    spells.push({ start: 0, end: first.timeSec });
  }
  events.forEach((event, i) => {
    if (event.code !== GARAGE_RETURN_CODE) return;
    const exit = events.slice(i + 1).find(e => e.code === GARAGE_PIT_EXIT_CODE);
    spells.push({ start: event.timeSec, end: exit ? exit.timeSec : Infinity });
  });
  return spells;
}

/** One lap's samples, read by index so stored columns need not become point objects. */
export interface GarageStateSamples {
  length: number;
  timeSec(i: number): number | undefined;
  speedKmh(i: number): number | undefined;
  inPit(i: number): boolean;
}

export interface GarageState {
  inGarage: boolean[];
  /** Driving down the pit lane out of the garage (the pit-lane bit is not set there). */
  leavingGarage: boolean[];
}

/**
 * Splits each garage spell overlapping one lap into the time parked (in the garage) and the drive
 * out through the pit lane, which starts when the car first moves off; the spell is over once the
 * car reaches racing speed. The phase is picked up from the first sample of the lap in the spell,
 * so a lap that starts halfway down the pit lane is not taken for the garage. Without any spell, a
 * car stopped with the pit-lane bit set is in the garage.
 * Laps are stored one per row and this only looks at the lap itself: it gives the same answer
 * whether the lap was just decoded or read back from the cache.
 */
export function garageState(samples: GarageStateSamples, spells: GarageSpell[]): GarageState {
  const inGarage = new Array<boolean>(samples.length).fill(false);
  const leavingGarage = new Array<boolean>(samples.length).fill(false);
  if (spells.length === 0) {
    for (let i = 0; i < samples.length; i++) {
      inGarage[i] = samples.inPit(i) && (samples.speedKmh(i) ?? 0) < 1;
    }
    return { inGarage, leavingGarage };
  }
  for (const spell of spells) {
    let phase: 'parked' | 'leaving' | 'racing' | undefined;
    for (let i = 0; i < samples.length; i++) {
      const t = samples.timeSec(i);
      if (t === undefined || t < spell.start || t > spell.end) continue;
      const speed = samples.speedKmh(i) ?? 0;
      if (speed >= RACING_KMH) phase = 'racing';
      else if (phase === undefined) phase = speed < DRIVING_OFF_KMH ? 'parked' : 'leaving';
      else if (phase === 'parked' && speed >= DRIVING_OFF_KMH) phase = 'leaving';
      if (phase === 'parked') inGarage[i] = true;
      else if (phase === 'leaving') leavingGarage[i] = true;
    }
  }
  return { inGarage, leavingGarage };
}

/**
 * Sets inGarage on one lap's points from its driver's pit events, and marks the drive out of the
 * garage as in the pit lane. Replaces whatever inGarage the points held: laps stored before this
 * rule took type 49 events for garage returns and flagged the whole drive to the pit exit as garage.
 */
export function applyGarageState(points: ReplayTrajectoryPoint[], driverPitEvents: ReplayPitEvent[]): void {
  const state = garageState({
    length: points.length,
    timeSec: i => points[i].timeSec,
    speedKmh: i => points[i].speedKmh,
    inPit: i => points[i].inPit === true,
  }, garageSpells(driverPitEvents));
  points.forEach((point, i) => {
    point.inGarage = state.inGarage[i];
    if (state.leavingGarage[i]) point.inPit = true;
  });
}
