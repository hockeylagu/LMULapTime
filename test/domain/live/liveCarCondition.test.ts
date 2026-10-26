import { describe, expect, it } from 'vitest';
import { LiveDamageTracker, LiveTyreTracker } from '../../../shared/domain/live/liveCarCondition.js';
import type { LiveCarReading, LiveVehicleCondition } from '../../../shared/domain/live/liveCarCondition.js';
import { nextForecastChange } from '../../../shared/domain/live/liveForecast.js';
import { liveLap } from '../../helpers/liveSnapshot.js';

const wheel = { flat: false, detached: false };
const car = (patch: Partial<LiveCarReading> = {}): LiveCarReading => ({
  fuelLiters: 40, fuelCapacityLiters: 117, dentSeverity: [0, 0, 0, 0, 0, 0, 0, 0], detached: false, lastImpactEt: 0,
  wheels: [wheel, wheel, wheel, wheel], compound: 'Medium', ...patch,
});
const condition = (patch: Partial<LiveVehicleCondition> = {}): LiveVehicleCondition => ({
  body: 0, suspension: [0, 0, 0, 0], tires: [0.98, 0.97, 0.99, 0.98], ...patch,
});

describe('LiveDamageTracker', () => {
  it('stays null without damage, then measures pace on valid laps either side of the impact', () => {
    const damage = new LiveDamageTracker();
    damage.updateCar(car(), 3);
    damage.updateCondition(condition());
    for (const [lap, time] of [[1, 76], [2, 75], [3, 75.5]] as const) damage.lapCompleted(liveLap(lap, time, [null, null, null]));
    expect(damage.damage(3, 10)).toBeNull();

    damage.updateCar(car({ dentSeverity: [0, 0, 0, 0, 0, 2, 0, 0] }), 4);
    damage.updateCondition(condition({ body: 0.4, suspension: [0, 0.11, 0, 0] }));
    damage.updateEstimate(30, 0);
    damage.lapCompleted(liveLap(4, 79, [null, null, null]));
    damage.lapCompleted(liveLap(5, 76.4, [null, null, null]));
    expect(damage.damage(5, 8)).toMatchObject({ impactLap: 4, lapsSinceImpact: 2, paceLossPerLap: null, repairSeconds: 30, significant: true });
    damage.lapCompleted(liveLap(6, 76.6, [null, null, null]));
    expect(damage.damage(6, 7)).toEqual({
      wheel: null, body: 0.4, suspension: 0.11, partsDetached: false, impactLap: 4, lapsSinceImpact: 3,
      paceLossPerLap: 1, lossToFinish: 7, repairSeconds: 30, significant: true,
    });
  });

  it('does not read one slow lap after a scrape as damage pace (COTA race 2026-10-20)', () => {
    const damage = new LiveDamageTracker();
    for (const [lap, time] of [[2, 135.4], [3, 135.2]] as const) damage.lapCompleted(liveLap(lap, time, [null, null, null]));
    damage.updateCondition(condition({ body: 0.03 }));
    for (const [lap, time] of [[5, 132.3], [6, 131.4], [7, 132.3], [8, 145.2]] as const) damage.lapCompleted(liveLap(lap, time, [null, null, null]));
    expect(damage.damage(8, 6)).toMatchObject({ paceLossPerLap: 0, significant: false });
  });

  it('moves the impact to a later hit that breaks the suspension (COTA race 2026-10-21)', () => {
    const damage = new LiveDamageTracker();
    damage.updateCar(car(), 1);
    damage.updateCondition(condition({ body: 0.13 }));
    for (const [lap, time] of [[2, 75.2], [3, 75], [4, 75.1]] as const) damage.lapCompleted(liveLap(lap, time, [null, null, null]));
    damage.updateCar(car(), 5);
    damage.updateCondition(condition({ body: 0.19 }));
    expect(damage.damage(4, 6)).toMatchObject({ impactLap: 1, paceLossPerLap: null });

    damage.updateCondition(condition({ body: 0.23, suspension: [0, 0, 0, 0.12] }));
    damage.updateEstimate(30, 0);
    for (const [lap, time] of [[5, 80], [6, 76], [7, 76.2]] as const) damage.lapCompleted(liveLap(lap, time, [null, null, null]));
    expect(damage.damage(7, 3)).toMatchObject({ impactLap: 5, lapsSinceImpact: 3, paceLossPerLap: 1, lossToFinish: 3, repairSeconds: 30 });
  });

  it('keeps the repair estimate while a penalty hides it, and clears everything once repaired', () => {
    const damage = new LiveDamageTracker();
    damage.updateCondition(condition({ body: 1.38, suspension: [0, 0.72, 0, 0], tires: [0.98, 0, 0.99, 0.98] }));
    damage.updateEstimate(129.9, 0);
    damage.updateEstimate(0, 1);
    expect(damage.damage(0, null)).toMatchObject({ wheel: { problem: 'flat', corner: 'FR' }, repairSeconds: 130, significant: true });
    damage.updateCondition(condition());
    expect(damage.damage(1, null)).toBeNull();
  });

  it('reports a lost wheel before a flat one, and minor damage as not significant', () => {
    const damage = new LiveDamageTracker();
    damage.updateCar(car({ wheels: [wheel, { flat: true, detached: false }, wheel, { flat: false, detached: true }] }), 2);
    expect(damage.damage(1, 5)?.wheel).toEqual({ problem: 'detached', corner: 'RR' });
    const minor = new LiveDamageTracker();
    minor.updateCondition(condition({ body: 0.05 }));
    minor.updateEstimate(4, 0);
    expect(minor.damage(1, 5)).toMatchObject({ significant: false, repairSeconds: 4 });
  });
});

describe('LiveTyreTracker', () => {
  it('measures each wheel over its stint, names the most worn tyre and restarts a wheel on a new tyre', () => {
    const tyres = new LiveTyreTracker();
    for (const tread of [[0.95, 0.9, 0.96, 0.95], [0.947, 0.894, 0.952, 0.948], [0.944, 0.887, 0.944, 0.946]]) tyres.lapCompleted(tread);
    expect(tyres.tyres('Medium', [0.944, 0.887, 0.944, 0.946], 54)).toEqual({
      compound: 'Medium', worst: 0.887, worstCorner: 'FR', wearPerLap: 0.008, newSets: 54,
      wheels: [
        { corner: 'FL', tread: 0.944, wearPerLap: 0.003 }, { corner: 'FR', tread: 0.887, wearPerLap: 0.0065 },
        { corner: 'RL', tread: 0.944, wearPerLap: 0.008 }, { corner: 'RR', tread: 0.946, wearPerLap: 0.002 },
      ],
    });
    tyres.lapCompleted([1, 1, 1, 1]);
    expect(tyres.tyres('Medium', undefined, null)).toMatchObject({ worst: null, worstCorner: null, wearPerLap: null });
  });

  it('restarts on fresh tyres after a short stint and projects the median lap, not a spin', () => {
    // Silverstone 2026-10-25: fresh tyres after 5 laps rose only 0.015; a spin took 11% off RL in one lap.
    const tyres = new LiveTyreTracker();
    for (const rl of [0.998, 0.995, 0.992, 0.989, 0.982, 0.997, 0.994, 0.884, 0.881, 0.878]) tyres.lapCompleted([1, 1, rl, 1]);
    expect(tyres.tyres('Medium', undefined, null).wheels?.[2].wearPerLap).toBe(0.003);
  });

  it('takes a puncture on one wheel for damage, not wear, and keeps measuring the other wheels', () => {
    // Seen live: a flat read 0 at the crossing into the pits, then the changed tyre read 93%.
    const tyres = new LiveTyreTracker();
    for (const fr of [0.977, 0.973, 0, 0.93, 0.926]) tyres.lapCompleted([0.99, fr, 0.99, 0.99]);
    expect(tyres.tyres('Medium', undefined, null).wheels?.map(wheel => wheel.wearPerLap)).toEqual([0, null, 0, 0]);
    tyres.lapCompleted([0.99, 0.922, 0.99, 0.99]);
    expect(tyres.tyres('Medium', undefined, null).wheels?.[1].wearPerLap).toBe(0.004);
  });
});

describe('nextForecastChange', () => {
  // The offline script seen live: clear, storm at 25 %, clear at 50 %, light clouds after.
  const nodes = [
    { fraction: 0, rainChance: 0 }, { fraction: 0.25, rainChance: 100 }, { fraction: 0.5, rainChance: 0 },
    { fraction: 0.75, rainChance: 0 }, { fraction: 1, rainChance: 0 },
  ];
  const base = { nodes, sessionSeconds: 900, raining: 0, lapSeconds: 75, lapNumber: 1, lapFraction: 0 };

  it('places rain halfway toward the rain node, on the lap it lands on', () => {
    expect(nextForecastChange({ ...base, elapsedSeconds: 10 })).toEqual({ change: 'rain', chance: 100, atSeconds: 113, lap: 2 });
  });

  it('places the end of the rain halfway toward the next dry node while it rains', () => {
    expect(nextForecastChange({ ...base, elapsedSeconds: 200, raining: 0.9, lapNumber: 3, lapFraction: 0.5 }))
      .toEqual({ change: 'dry', chance: 100, atSeconds: 338, lap: 5 });
  });

  it('says the weather holds when the forecast does not change, and nothing without a session length', () => {
    expect(nextForecastChange({ ...base, elapsedSeconds: 400 })).toEqual({ change: 'none', chance: 0, atSeconds: 900, lap: null });
    expect(nextForecastChange({ ...base, elapsedSeconds: 10, sessionSeconds: 0 })).toBeNull();
    expect(nextForecastChange({ ...base, elapsedSeconds: 10, lapSeconds: null })).toMatchObject({ lap: null });
  });
});
