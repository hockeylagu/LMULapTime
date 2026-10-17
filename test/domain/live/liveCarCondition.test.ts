import { describe, expect, it } from 'vitest';
import { LiveDamageTracker, LiveTyreTracker } from '../../../shared/domain/live/liveCarCondition.js';
import type { LiveCarReading, LiveVehicleCondition } from '../../../shared/domain/live/liveCarCondition.js';
import { nextForecastChange } from '../../../shared/domain/live/liveForecast.js';
import { liveLap } from '../../helpers/liveSnapshot.js';

const wheel = { flat: false, detached: false };
const car = (patch: Partial<LiveCarReading> = {}): LiveCarReading => ({
  fuelLiters: 40, fuelCapacityLiters: 117, dentSeverity: [0, 0, 0, 0, 0, 0, 0, 0], detached: false,
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
  it('names the most worn tyre and measures its wear per lap over the stint, restarting on new tyres', () => {
    const tyres = new LiveTyreTracker();
    for (const worst of [0.9, 0.895, 0.89]) tyres.lapCompleted(worst);
    expect(tyres.tyres('Medium', condition({ tires: [0.9, 0.887, 0.91, 0.9] }), 54)).toEqual({
      compound: 'Medium', worst: 0.887, worstCorner: 'FR', wearPerLap: 0.005, newSets: 54,
    });
    tyres.lapCompleted(1);
    expect(tyres.tyres('Medium', null, null)).toEqual({ compound: 'Medium', worst: null, worstCorner: null, wearPerLap: null, newSets: null });
  });

  it('takes a puncture for damage, not wear, and measures the wear again on the tyres after it', () => {
    // Seen live: a flat read 0 at the crossing into the pits, then the changed tyre read 93%.
    const tyres = new LiveTyreTracker();
    for (const worst of [0.977, 0.973, 0, 0.93, 0.926]) tyres.lapCompleted(worst);
    expect(tyres.tyres('Medium', null, null).wearPerLap).toBeNull();
    tyres.lapCompleted(0.922);
    expect(tyres.tyres('Medium', null, null).wearPerLap).toBe(0.004);
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

  it('says nothing when the forecast does not change, or without a session length', () => {
    expect(nextForecastChange({ ...base, elapsedSeconds: 400 })).toBeNull();
    expect(nextForecastChange({ ...base, elapsedSeconds: 10, sessionSeconds: 0 })).toBeNull();
    expect(nextForecastChange({ ...base, elapsedSeconds: 10, lapSeconds: null })).toMatchObject({ lap: null });
  });
});
