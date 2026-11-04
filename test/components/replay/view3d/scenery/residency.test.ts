import { describe, expect, it } from 'vitest';
import { HYSTERESIS_M, planResidency } from '../../../../../src/components/replay/view3d/scenery/residency.js';
import { testLayout } from './layoutFixture.js';

const layout = testLayout();
const plan = (lapDistanceM: number, hysteresis = HYSTERESIS_M) => planResidency(layout, { kind: 'lap', lapDistanceM }, hysteresis);
const free = (x: number, z: number) => planResidency(layout, { kind: 'free', x, z });

describe('lap residency', () => {
  it('loads the sector under the car first, then ahead nearest first, then behind', () => {
    // Window [2200, 4000] from lap 2500: s2 holds the car; s3, then s0 and the pit chunk (starting exactly 1500 m ahead) follow; s1 ended 500 m behind.
    const ahead = plan(2500);
    expect(ahead.under).toEqual(['s2']); expect(ahead.wanted).toEqual(['s2', 's3', 's0', 'p0']);
    // Window [700, 2500] from lap 1000.5: s1 holds the car, s2 is ahead, s0 is the 300 m behind.
    const p = plan(1000.5);
    expect(p.under).toEqual(['s1']); expect(p.wanted).toEqual(['s1', 's2', 's0']);
  });

  it('wraps the window around the start/finish line', () => {
    // Window [-200, 1600] from lap 100: s0 and the pit chunk (sharing its lap range) under the car, s1 ahead, s3 behind (wrapped).
    const near = plan(100);
    expect(near.under).toEqual(['s0', 'p0']); expect(near.wanted).toEqual(['s0', 'p0', 's1', 's3']);
    expect(plan(3900).wanted).toEqual(['s3', 's0', 'p0', 's1']);
    expect(plan(-100).wanted).toEqual(plan(3900).wanted);
    expect(plan(4100).wanted).toEqual(near.wanted);
  });

  it('applies the resident window exactly at its edges', () => {
    expect(plan(400).wanted).toContain('s1'); // 400 + 1500 reaches s1, which starts at 1000
    expect(plan(1300).wanted).toContain('s0'); // s0 ends at 1000 = 1300 - 300
    expect(plan(1300.1).wanted).not.toContain('s0');
    expect(plan(2499).wanted).not.toContain('s0');
  });

  it('keeps chunks within the hysteresis margin without wanting them', () => {
    const p = plan(1300.1);
    expect(p.wanted).not.toContain('s0'); expect(p.keep.has('s0')).toBe(true);
    expect(plan(1300 + HYSTERESIS_M + 1).keep.has('s0')).toBe(false);
    expect(plan(1300.1, 0).keep.has('s0')).toBe(false);
    for (const id of p.wanted) expect(p.keep.has(id)).toBe(true);
  });

  it('never plans the horizon, which is always resident', () => {
    expect(plan(0).wanted).not.toContain('horizon'); expect(plan(0).keep.has('horizon')).toBe(false);
  });
});

describe('free camera residency', () => {
  it('wants chunks whose bounds are within the free camera radius, nearest first', () => {
    // Over s0 (x 0..100, z 0..100): s0 is under the camera, the pit chunk 450 m away, s1 900 m, s2 1900 m.
    const p = free(50, 50);
    expect(p.under).toEqual(['s0']); expect(p.wanted).toEqual(['s0', 'p0', 's1']);
    // Over s2: s1 and s3 are both 950 m away.
    expect(free(2050, 50).wanted).toEqual(['s2', 's1', 's3']);
  });

  it('keeps chunks up to the hysteresis margin beyond the radius', () => {
    const near = free(-600, 50); // s1 is 1600 m away: outside 1500, inside 1500 + 250
    expect(near.wanted).not.toContain('s1'); expect(near.keep.has('s1')).toBe(true); expect(near.wanted).toContain('s0');
    expect(free(-800, 50).keep.has('s1')).toBe(false);
  });
});
