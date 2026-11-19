import { describe, expect, it } from 'vitest';
import { buildCornerPasses, TRAFFIC_RANGE_SEC, type PassLapSamples } from '../../../server/corners/cornerPasses.js';

const LENGTH = 1000;
const SEGMENTS = [{ id: 0, startM: 0, endM: 500 }, { id: 1, startM: 500, endM: LENGTH }];

/**
 * A lap at 10 Hz: 50 m/s, slowing to 20 m/s at 300 m (braking from 200 m, steering left from 230 m to
 * 380 m, on the throttle again from 320 m), then back to 50 m/s. `offsetSec` shifts its clock; `startM`
 * where it starts.
 */
function lap(lapNumber: number, offsetSec = 0, startM = 0): PassLapSamples {
  const samples: PassLapSamples = { lapNumber, times: [], stations: [], speedKmh: [], throttle: [], brake: [], steer: [], usable: [] };
  let distance = startM;
  let time = offsetSec;
  while (distance <= startM + LENGTH) {
    const local = distance - startM;
    const speed = local < 200 ? 50 : local < 300 ? 50 - 30 * (local - 200) / 100 : local < 400 ? 20 + 30 * (local - 300) / 100 : 50;
    samples.times.push(time);
    samples.stations.push(((distance % LENGTH) + LENGTH) % LENGTH);
    samples.speedKmh.push(speed * 3.6);
    samples.brake.push(local >= 200 && local < 300 ? 0.8 : 0);
    samples.throttle.push(local >= 320 ? 1 : local < 200 ? 1 : 0);
    // A little straight-line correction under the threshold, then the corner.
    samples.steer.push(local >= 230 && local < 380 ? 0.15 : 0.01);
    samples.usable.push(true);
    distance += speed * 0.1;
    time += 0.1;
  }
  return samples;
}

describe('buildCornerPasses', () => {
  it('times each segment of a lap and finds its cues', () => {
    const passes = buildCornerPasses([{ slot: 1, laps: [lap(1)] }], SEGMENTS, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([0, 1]);
    const [first, second] = passes;
    expect(first.entrySec).toBe(0);
    expect(first.exitSec).toBeCloseTo(second.entrySec, 6);
    expect(second.exitSec).toBeGreaterThan(second.entrySec);
    expect(first.entrySpeedKmh).toBeCloseTo(180, 0);
    expect(first.exitSpeedKmh).toBeCloseTo(180, 0);
    expect(first.minSpeedKmh).toBeCloseTo(72, 0);
    expect(first.minSpeedM).toBeCloseTo(300, -1);
    // 200 m at 50 m/s, then 100 m slowing evenly from 50 to 20 m/s.
    expect(first.minSpeedSec).toBeCloseTo(4 + 100 / 35, 0);
    expect(first.brakeM).toBeCloseTo(200, -1);
    expect(first.turnInM).toBeCloseTo(230, -1);
    expect(first.throttleM).toBeCloseTo(320, -1);
    // A flat-out straight segment has no braking, no turn-in and no lift to come back from.
    expect(second.brakeM).toBeNull();
    expect(second.turnInM).toBeNull();
    expect(second.throttleM).toBeNull();
    expect(first.aheadSlot).toBeNull();
  });

  it('reads a sample just short of the line at the lap start as before it', () => {
    const samples = lap(2, 0, -5);
    const passes = buildCornerPasses([{ slot: 1, laps: [samples] }], SEGMENTS, LENGTH);
    expect(passes[0].entrySec).toBeCloseTo(0.1, 1);
  });

  it('times the turns after a pit exit late in the lap on an out-lap', () => {
    // The car joins at 600 m (past half the lap) and drives to the line.
    const samples = lap(1, 0, 0);
    const keep = samples.stations.flatMap((s, i) => (s >= 600 || i === samples.stations.length - 1 ? [i] : []));
    const pick = <T,>(values: T[]) => keep.map(i => values[i]);
    const outLap: PassLapSamples = { lapNumber: 1, times: pick(samples.times), stations: pick(samples.stations), speedKmh: pick(samples.speedKmh),
      throttle: pick(samples.throttle), brake: pick(samples.brake), steer: pick(samples.steer), usable: pick(samples.usable) };
    const segments = [{ id: 0, startM: 0, endM: 650 }, { id: 1, startM: 650, endM: LENGTH }];
    const passes = buildCornerPasses([{ slot: 1, laps: [outLap] }], segments, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([1]);
  });

  it('times every turn of a lap that starts with a stray sample before a trip to the garage', () => {
    // The stray sample sits at 300 m; 10 s later the car leaves the garage just short of the line.
    const samples = lap(1, 10, -5);
    const stray = (values: unknown[], value: unknown) => values.unshift(value);
    stray(samples.times, 0);
    stray(samples.stations, 300);
    for (const values of [samples.speedKmh, samples.throttle, samples.brake, samples.steer]) stray(values, 0);
    stray(samples.usable, true);
    const passes = buildCornerPasses([{ slot: 1, laps: [samples] }], SEGMENTS, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([0, 1]);
  });

  it('places a lap by its samples, not by a stray first one', () => {
    // Stray samples at 20 m, then the car reappears at 600 m and drives to the line.
    const samples = lap(1, 10, 0);
    const keep = samples.stations.flatMap((s, i) => (s >= 600 || i === samples.stations.length - 1 ? [i] : []));
    const pick = <T,>(values: T[], stray: T) => [stray, stray, stray, ...keep.map(i => values[i])];
    const strayLap: PassLapSamples = { lapNumber: 1, times: [0, 0.02, 0.04, ...keep.map(i => samples.times[i])], stations: pick(samples.stations, 20),
      speedKmh: pick(samples.speedKmh, 0), throttle: pick(samples.throttle, 0), brake: pick(samples.brake, 0),
      steer: pick(samples.steer, 0), usable: pick(samples.usable, true) };
    const segments = [{ id: 0, startM: 0, endM: 650 }, { id: 1, startM: 650, endM: LENGTH }];
    expect(buildCornerPasses([{ slot: 1, laps: [strayLap] }], segments, LENGTH).map(p => p.segment)).toEqual([1]);
  });

  it('times the race lap of a lap 1 that starts with a slow run from the grid', () => {
    // From the grid at 600 m to the line at 5 m/s (many samples), then the whole race lap.
    const grid: PassLapSamples = { lapNumber: 1, times: [], stations: [], speedKmh: [], throttle: [], brake: [], steer: [], usable: [] };
    for (let m = 600, t = 0; m < LENGTH; m += 0.5, t += 0.1) {
      grid.times.push(t); grid.stations.push(m); grid.speedKmh.push(18); grid.throttle.push(0.2); grid.brake.push(0); grid.steer.push(0); grid.usable.push(true);
    }
    const race = lap(1, grid.times[grid.times.length - 1] + 0.1, 0);
    const lap1: PassLapSamples = { lapNumber: 1, times: [...grid.times, ...race.times], stations: [...grid.stations, ...race.stations],
      speedKmh: [...grid.speedKmh, ...race.speedKmh], throttle: [...grid.throttle, ...race.throttle], brake: [...grid.brake, ...race.brake],
      steer: [...grid.steer, ...race.steer], usable: [...grid.usable, ...race.usable] };
    const passes = buildCornerPasses([{ slot: 1, laps: [lap1] }], SEGMENTS, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([0, 1]);
    expect(passes[0].entrySec).toBeCloseTo(race.times[0], 1);
  });

  it('times the race lap, not the formation lap, of a lap 1 holding both', () => {
    // From the grid at 600 m: a slow formation lap back to the grid, then the start and the race lap to the line.
    const formation = lap(1, 0, 600);
    formation.speedKmh = formation.speedKmh.map(() => 60);
    const start = formation.times[formation.times.length - 1] + 0.1;
    const grid = lap(1, start, 600);
    const toLine = grid.stations.findIndex((s, i) => i > 0 && s < grid.stations[i - 1]);
    const race = lap(1, grid.times[toLine], 0);
    const join = <T,>(pick: (p: PassLapSamples) => T[]) => [...pick(formation), ...pick(grid).slice(0, toLine), ...pick(race)];
    const lap1: PassLapSamples = { lapNumber: 1, times: join(p => p.times), stations: join(p => p.stations), speedKmh: join(p => p.speedKmh),
      throttle: join(p => p.throttle), brake: join(p => p.brake), steer: join(p => p.steer), usable: join(p => p.usable) };
    const passes = buildCornerPasses([{ slot: 1, laps: [lap1] }], SEGMENTS, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([0, 1]);
    expect(passes[0].entrySec).toBeCloseTo(race.times[0], 1);
  });

  it('times the turns both sides of the line on a lap 1 from a grid behind it', () => {
    // From the grid at 300 m, through the last turn (400 m to the line) and the first (0-200 m); the car then stops
    // at 300 m, its race over.
    const segments = [{ id: 0, startM: 0, endM: 200 }, { id: 1, startM: 400, endM: LENGTH }];
    const passes = buildCornerPasses([{ slot: 1, laps: [lap(1, 0, -700)] }], segments, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([0, 1]);
    expect(passes[1].exitSec).toBeLessThan(passes[0].entrySec + 0.01);
  });

  it('crosses the line in a previous lap that is only its last metres before the line', () => {
    // Lap 1: parked at 300 m, then the car comes back 70 m short of the line and drives past it to 60 m;
    // lap 2 carries on from there, so its T1 starts in lap 1.
    const drive = lap(2, 20, -70);
    const cut = drive.stations.findIndex((s, i) => i > 0 && s >= 60 && s < 500);
    const pick = <T,>(values: T[], from: number, to: number) => values.slice(from, to);
    const parked = { times: [0, 0.1, 0.2], stations: [300, 300, 300] };
    const lap1: PassLapSamples = { lapNumber: 1, times: [...parked.times, ...pick(drive.times, 0, cut)], stations: [...parked.stations, ...pick(drive.stations, 0, cut)],
      speedKmh: [0, 0, 0, ...pick(drive.speedKmh, 0, cut)], throttle: [0, 0, 0, ...pick(drive.throttle, 0, cut)], brake: [0, 0, 0, ...pick(drive.brake, 0, cut)],
      steer: [0, 0, 0, ...pick(drive.steer, 0, cut)], usable: [true, true, true, ...pick(drive.usable, 0, cut)] };
    const end = drive.times.length;
    const lap2: PassLapSamples = { lapNumber: 2, times: pick(drive.times, cut, end), stations: pick(drive.stations, cut, end), speedKmh: pick(drive.speedKmh, cut, end),
      throttle: pick(drive.throttle, cut, end), brake: pick(drive.brake, cut, end), steer: pick(drive.steer, cut, end), usable: pick(drive.usable, cut, end) };
    const passes = buildCornerPasses([{ slot: 1, laps: [lap1, lap2] }], SEGMENTS, LENGTH);
    // Lap 2 stops at 930 m, short of T2's end.
    expect(passes.filter(p => p.lapNumber === 2).map(p => p.segment)).toEqual([0]);
  });

  it('crosses the line in the previous lap when the stored lap is cut past it', () => {
    // One drive over two laps at 10 Hz and 50 m/s on the straight, cut as the game times it: 15 m past the line.
    const drive = lap(1, 0, 0);
    const second = lap(2, drive.times[drive.times.length - 1] + 0.1, LENGTH);
    const all = { times: [...drive.times, ...second.times], stations: [...drive.stations, ...second.stations],
      speedKmh: [...drive.speedKmh, ...second.speedKmh], throttle: [...drive.throttle, ...second.throttle],
      brake: [...drive.brake, ...second.brake], steer: [...drive.steer, ...second.steer], usable: [...drive.usable, ...second.usable] };
    let travelled = 0;
    const along = all.times.map((_, i) => (i === 0 ? 0 : (travelled += (all.speedKmh[i - 1] as number) / 3.6 * 0.1)));
    const cut = (lapNumber: number, fromM: number, toM: number): PassLapSamples => {
      const keep = along.flatMap((m, i) => (m >= fromM && m <= toM ? [i] : []));
      const pick = <T,>(values: T[]) => keep.map(i => values[i]);
      return { lapNumber, times: pick(all.times), stations: pick(all.stations), speedKmh: pick(all.speedKmh), throttle: pick(all.throttle),
        brake: pick(all.brake), steer: pick(all.steer), usable: pick(all.usable) };
    };
    const laps = [cut(1, 15, LENGTH + 15), cut(2, LENGTH + 15, 2 * LENGTH)];
    const passes = buildCornerPasses([{ slot: 1, laps }], SEGMENTS, LENGTH);

    // Lap 1 has no lap before it to cross the line in; lap 2 enters T1 where the drive passed 1000 m, in lap 1.
    expect(passes.filter(p => p.lapNumber === 1).map(p => p.segment)).toEqual([1]);
    const t1 = passes.find(p => p.lapNumber === 2 && p.segment === 0)!;
    const lineIndex = along.findIndex(m => m >= LENGTH);
    expect(t1.entrySec).toBeGreaterThan(all.times[lineIndex - 1]);
    expect(t1.entrySec).toBeLessThanOrEqual(all.times[lineIndex]);
    expect(t1.entrySec).toBeLessThan(laps[1].times[0]);
    expect(t1.brakeM).toBeCloseTo(200, -1);
    // Each lap's T2 ends on the line once: the borrowed samples add no second pass.
    expect(passes.filter(p => p.segment === 1).map(p => p.lapNumber)).toEqual([1, 2]);
  });

  it('leaves out a segment the recording breaks in', () => {
    const samples = lap(1);
    const index = samples.stations.findIndex(s => s > 700);
    samples.usable.fill(false, index, index + 30);
    const passes = buildCornerPasses([{ slot: 1, laps: [samples] }], SEGMENTS, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([0]);
  });

  it('times a turn the car drives again after a break inside it', () => {
    // Into T1 to 300 m, 30 s in the garage, back on track at 100 m and on round the lap.
    const first = lap(1, 0, 0);
    const upTo = first.stations.findIndex(s => s > 300);
    const again = lap(1, 40, 0);
    const from = again.stations.findIndex(s => s >= 100);
    const join = <T,>(pick: (p: PassLapSamples) => T[]) => [...pick(first).slice(0, upTo), ...pick(again).slice(from)];
    const samples: PassLapSamples = { lapNumber: 1, times: join(p => p.times), stations: join(p => p.stations), speedKmh: join(p => p.speedKmh),
      throttle: join(p => p.throttle), brake: join(p => p.brake), steer: join(p => p.steer), usable: join(p => p.usable) };
    const segments = [{ id: 0, startM: 50, endM: 500 }, { id: 1, startM: 500, endM: LENGTH }];
    const passes = buildCornerPasses([{ slot: 1, laps: [samples] }], segments, LENGTH);
    expect(passes.map(p => p.segment)).toEqual([1]);
    const later = [{ id: 0, startM: 150, endM: 500 }, { id: 1, startM: 500, endM: LENGTH }];
    const retimed = buildCornerPasses([{ slot: 1, laps: [samples] }], later, LENGTH);
    expect(retimed.map(p => p.segment)).toEqual([0, 1]);
    expect(retimed[0].entrySec).toBeGreaterThan(40);
  });

  it('times a turn again in the lap when the previous lap drove it just before the lap starts', () => {
    // Lap 1 ends at 700 m; lap 2 starts with a stray sample there, goes to the garage, and rejoins at 100 m.
    const drive = lap(1, 0, 0);
    const end = drive.stations.findIndex(s => s > 700);
    const cut = <T,>(values: T[], from: number, to: number) => values.slice(from, to);
    const lap1: PassLapSamples = { lapNumber: 1, times: cut(drive.times, 0, end), stations: cut(drive.stations, 0, end), speedKmh: cut(drive.speedKmh, 0, end),
      throttle: cut(drive.throttle, 0, end), brake: cut(drive.brake, 0, end), steer: cut(drive.steer, 0, end), usable: cut(drive.usable, 0, end) };
    const again = lap(2, 60, 0);
    const from = again.stations.findIndex(s => s >= 100);
    const stray = <T,>(first: T, values: T[]) => [first, ...values.slice(from)];
    const lap2: PassLapSamples = { lapNumber: 2, times: stray(drive.times[end - 1] + 0.02, again.times), stations: stray(drive.stations[end - 1], again.stations),
      speedKmh: stray(0, again.speedKmh), throttle: stray(0, again.throttle), brake: stray(0, again.brake), steer: stray(0, again.steer), usable: stray(true, again.usable) };
    const segments = [{ id: 0, startM: 550, endM: 650 }, { id: 1, startM: 650, endM: LENGTH }];
    const passes = buildCornerPasses([{ slot: 1, laps: [lap1, lap2] }], segments, LENGTH);
    const t1 = passes.find(p => p.lapNumber === 2 && p.segment === 0);
    expect(t1?.entrySec).toBeGreaterThan(60);
  });

  it('times the turns before a garage stop and after rejoining a track length back', () => {
    // Out to 200 m (T1), to the garage, back on track at 750 m and on to the line (T2 from 800 m).
    const before = lap(1, 0, 0);
    const upTo = before.stations.findIndex(s => s > 200);
    const after = lap(1, 60, 0);
    const from = after.stations.findIndex(s => s >= 750);
    const join = <T,>(pick: (p: PassLapSamples) => T[]) => [...pick(before).slice(0, upTo), ...pick(after).slice(from)];
    const samples: PassLapSamples = { lapNumber: 1, times: join(p => p.times), stations: join(p => p.stations), speedKmh: join(p => p.speedKmh),
      throttle: join(p => p.throttle), brake: join(p => p.brake), steer: join(p => p.steer), usable: join(p => p.usable) };
    const segments = [{ id: 0, startM: 0, endM: 150 }, { id: 1, startM: 800, endM: LENGTH }];
    expect(buildCornerPasses([{ slot: 1, laps: [samples] }], segments, LENGTH).map(p => p.segment)).toEqual([0, 1]);
  });

  it('records the closest car ahead and behind, by slot, as a gap in seconds', () => {
    // Car 2 runs the same lap 1 s later; car 3 runs it 3 s after car 2, too far back to count.
    const cars = [{ slot: 1, laps: [lap(1)] }, { slot: 2, laps: [lap(1, 1)] }, { slot: 3, laps: [lap(1, 4)] }];
    const passes = buildCornerPasses(cars, SEGMENTS, LENGTH);
    const leader = passes.find(p => p.slot === 1 && p.segment === 1)!;
    const follower = passes.find(p => p.slot === 2 && p.segment === 1)!;
    expect(leader.behindSlot).toBe(2);
    expect(leader.behindGapSec).toBeCloseTo(1, 1);
    expect(follower.aheadSlot).toBe(1);
    expect(follower.aheadGapSec).toBeCloseTo(1, 1);
    expect(leader.aheadSlot).toBeNull();
    expect(3).toBeGreaterThan(TRAFFIC_RANGE_SEC);
    const last = passes.find(p => p.slot === 3 && p.segment === 1)!;
    expect(last.aheadSlot).toBeNull();
  });

  it('is no one\'s traffic while stopped: a parked car beside the track', () => {
    // Car 9 sits at 600 m for the whole lap (a parked safety car); car 1 drives past it in segment 1.
    const parked: PassLapSamples = { lapNumber: 1, times: [], stations: [], speedKmh: [], throttle: [], brake: [], steer: [], usable: [] };
    for (let time = 0; time <= 30; time += 0.1) {
      parked.times.push(time); parked.stations.push(600); parked.speedKmh.push(0);
      parked.throttle.push(0); parked.brake.push(0); parked.steer.push(0); parked.usable.push(true);
    }
    const passes = buildCornerPasses([{ slot: 1, laps: [lap(1)] }, { slot: 9, laps: [parked] }], SEGMENTS, LENGTH);
    expect(passes.filter(p => p.slot === 1).map(p => [p.aheadSlot, p.behindSlot])).toEqual([[null, null], [null, null]]);
  });
});
