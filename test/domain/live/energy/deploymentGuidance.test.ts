import { describe, expect, it } from 'vitest';
import { DeploymentGuidance } from '../../../../shared/domain/live/energy/deploymentGuidance.js';

const SETTINGS = [0, 20, 40, 60, 80, 100];
const LAP = 100;
const METERS = 5000;
const STEP = 0.2;

interface Drive {
  /** Lap-average charge at the start, percent. */
  level: number;
  current: number;
  /** Net percentage points per lap on a setting. */
  rate: (setting: number) => number;
  laps: number;
  /** In-lap swing amplitude, percentage points. */
  swing?: number;
  /** The driver moves to every new target at once. */
  follow?: boolean;
  settings?: readonly number[];
}

/** 5 Hz readings along laps of 100 s and 5 km; returns the guidance and every change the driver made. */
function drive(options: Drive) {
  const guidance = new DeploymentGuidance(options.settings ?? SETTINGS);
  let level = options.level;
  let current = options.current;
  const changes: { time: number; level: number }[] = [];
  for (let time = 0; time <= options.laps * LAP; time += STEP) {
    const charge = level + (options.swing ?? 0) * Math.sin((2 * Math.PI * time) / LAP);
    guidance.observe({ time, distance: (time / LAP) * METERS, lapLength: METERS, charge, current });
    const target = guidance.advice.target;
    if (options.follow && target !== null && target !== current) { changes.push({ time, level }); current = target; }
    level += (options.rate(current) / LAP) * STEP;
  }
  return { guidance, changes };
}

describe('deployment guidance', () => {
  it('chooses adjacent values from non-uniform car maps, not a fixed kW increment', () => {
    const settings = [0, 5, 10, 20, 35, 50];
    expect(drive({ settings, level: 30, current: 35, rate: () => -10, laps: 2 }).guidance.advice.target).toBe(20);
    expect(drive({ settings, level: 70, current: 35, rate: () => 10, laps: 2 }).guidance.advice.target).toBe(50);
  });

  it('does not invent settings for unknown or malformed car maps', () => {
    for (const settings of [[], [20], [0, 20, 20], [0, 40, 20], [0, NaN], [-5, 0]]) {
      expect(drive({ settings, level: 30, current: 20, rate: () => -10, laps: 2 }).guidance.advice.target).toBeNull();
    }
  });

  it('respects minimum and maximum settings', () => {
    expect(drive({ settings: [0, 5, 10], level: 75, current: 10, rate: () => 10, laps: 2 }).guidance.advice.target).toBe(10);
    expect(drive({ settings: [0, 5, 10], level: 25, current: 0, rate: () => -10, laps: 2 }).guidance.advice.target).toBe(0);
  });

  it('measures a full lap of track first, then reads through the in-lap swing', () => {
    const half = drive({ level: 50, current: 60, rate: () => 0, swing: 40, laps: 0.9 }).guidance;
    expect(half.advice.target).toBeNull();
    expect(half.changePerLap).toBeNull();
    // ±40 points inside every lap with no net change: hold, nothing to do.
    const { guidance } = drive({ level: 50, current: 60, rate: () => 0, swing: 40, laps: 4 });
    expect(guidance.advice).toMatchObject({ current: 60, target: 60 });
    expect(Math.abs(guidance.changePerLap!)).toBeLessThan(0.1);
  });

  it('advises the moment the lap average is a lap from the edge, anywhere on the lap', () => {
    const { guidance } = drive({ level: 60, current: 60, rate: () => -12, swing: 25, laps: 3.3 });
    expect(guidance.advice.target).toBe(40);
    expect(guidance.edge).toBe(20);
    // 60 → 20 at 12 points a lap: the lap average is a lap from the edge 2.3 laps in, so this advice came mid-lap.
    expect(guidance.edgeSeconds).toBeGreaterThan(0);
    expect(guidance.edgeSeconds).toBeLessThan(LAP);
    expect(guidance.changePerLap).toBeCloseTo(-12, 0);
  });

  it('settles a full lap on a new setting before advising again', () => {
    const guidance = new DeploymentGuidance(SETTINGS);
    for (let time = 0; time <= 150; time += STEP) {
      const current = time < 120 ? 60 : 40;
      guidance.observe({ time, distance: (time / LAP) * METERS, lapLength: METERS, charge: 30, current });
    }
    expect(guidance.advice).toMatchObject({ current: 40, target: 40, settlingLaps: 1 });
    expect(guidance.changePerLap).toBeNull();
    for (let time = 150; time <= 221; time += STEP) {
      guidance.observe({ time, distance: (time / LAP) * METERS, lapLength: METERS, charge: 30, current: 40 });
    }
    expect(guidance.advice).toMatchObject({ current: 40, target: 40, settlingLaps: 0 });
  });

  it('withdraws ignored advice only once the lap average is back well inside the range', () => {
    const guidance = new DeploymentGuidance(SETTINGS);
    let level = 50;
    let time = 0;
    const run = (rate: number, laps: number) => {
      for (const end = time + laps * LAP; time <= end; time += STEP) {
        guidance.observe({ time, distance: (time / LAP) * METERS, lapLength: METERS, charge: level, current: 60 });
        level += (rate / LAP) * STEP;
      }
    };
    run(15, 2.5);
    expect(guidance.advice.target).toBe(80);
    run(-5, 2);
    expect(guidance.advice.target).toBe(80);
    run(-5, 3);
    expect(guidance.advice.target).toBe(60);
  });

  it('cycles edge to edge with long holds instead of hunting around the middle', () => {
    // The driver follows every change at once; 60 kW depletes, 40 kW charges, under a large in-lap swing.
    for (const [drain, gain] of [[-3, 2.5], [-6, 5], [-1.5, 1]]) {
      const { changes } = drive({ level: 70, current: 60, rate: setting => setting === 60 ? drain : gain, swing: 15, laps: 60, follow: true });
      expect(changes.length).toBeGreaterThan(0);
      for (const [index, { time, level }] of changes.entries()) {
        expect(level < 20 + Math.abs(drain) + 1 || level > 80 - gain - 1).toBe(true);
        if (index > 0) expect(time - changes[index - 1].time).toBeGreaterThanOrEqual(8 * LAP);
      }
    }
  });

  it('names the next setting only in the last laps before its change', () => {
    const near = drive({ level: 62, current: 40, rate: () => 5, laps: 2 }).guidance;
    expect(near).toMatchObject({ next: 60, edge: 80 });
    // The change is advised a lap (100 s) before the lap average reaches the edge.
    expect(near.changeSeconds).toBeCloseTo(near.edgeSeconds! - LAP, 0);
    expect(near.advice.target).toBe(40);
    const early = drive({ level: 40, current: 40, rate: () => 5, laps: 2 }).guidance;
    expect(early.next).toBeNull();
    expect(early.changeSeconds).toBeNull();
    expect(drive({ level: 55, current: 60, rate: () => 0, laps: 2 }).guidance.next).toBeNull();
  });

  it('skips readings that do not move forward, and starts again after a jump or unusable data', () => {
    const { guidance } = drive({ level: 30, current: 60, rate: () => -10, laps: 2 });
    expect(guidance.advice.target).toBe(40);
    // Lap distance dips below zero just after the line: skipped, nothing lost.
    guidance.observe({ time: 200.1, distance: 9_960, lapLength: METERS, charge: 10, current: 60 });
    expect(guidance.advice.target).toBe(40);
    guidance.observe({ time: 260, distance: 13_000, lapLength: METERS, charge: 10, current: 60 });
    expect(guidance.advice.target).toBeNull();
    guidance.observe({ time: 261, distance: 13_050, lapLength: METERS, charge: 10, current: 63 });
    expect(guidance.advice.current).toBeNull();
    guidance.observe({ time: 262, distance: 13_100, lapLength: METERS, charge: Number.NaN, current: 60 });
    expect(guidance.advice.current).toBeNull();
  });
});
