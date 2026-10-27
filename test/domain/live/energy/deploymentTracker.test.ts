import { describe, expect, it } from 'vitest';
import type { LiveHybridReading } from '../../../../shared/domain/live/liveCarCondition.js';
import { DeploymentTracker, hybridChargePercent } from '../../../../shared/domain/live/energy/deploymentTracker.js';

const KW = [0, 20, 40, 60, 80, 100, 120];
const hybrid = (patch: Partial<LiveHybridReading> = {}): LiveHybridReading =>
  ({ batteryChargeFraction: 0.5, soc: 0, motorMap: 3, motorMapMax: 6, motorState: 2, regen: 0, ...patch });

const LAP = 100;
const METERS = 5000;

/**
 * Laps of 100 s and 5 km at 5 Hz: the lap-average charge moves `perLap` points a lap from `start` (`pit` puts the first
 * `pitSeconds` in the pit lane). Returns the clock at the end, to drive on from.
 */
function laps(tracker: DeploymentTracker, start: number, perLap: number, count: number,
  patch: Partial<LiveHybridReading> = {}, from = 0, pitSeconds = 0) {
  let time = from;
  for (; time <= from + count * LAP; time += 0.2) {
    const charge = start + (perLap * (time - from)) / LAP;
    tracker.applyCar(hybrid({ batteryChargeFraction: charge / 100, ...patch }));
    tracker.sample(time, (time / LAP) * METERS, METERS, time - from < pitSeconds);
  }
  return time;
}

describe('hybridChargePercent', () => {
  it('takes the charge fraction, else soc as a fraction or percent, and reads zero or garbage as unavailable', () => {
    expect(hybridChargePercent(hybrid({ batteryChargeFraction: 0.625, soc: 0.1 }))).toBe(62.5);
    expect(hybridChargePercent(hybrid({ batteryChargeFraction: 0, soc: 0.4 }))).toBe(40);
    expect(hybridChargePercent(hybrid({ batteryChargeFraction: 1.5, soc: 55 }))).toBe(55);
    expect(hybridChargePercent(hybrid({ batteryChargeFraction: 0, soc: 0 }))).toBeNull();
    expect(hybridChargePercent(hybrid({ batteryChargeFraction: Number.NaN, soc: 250 }))).toBeNull();
  });
});

describe('DeploymentTracker', () => {
  it('advises in kW from the plugin list and falls back to map positions without one', () => {
    const plugin = new DeploymentTracker();
    plugin.setPluginKw(KW);
    laps(plugin, 30, -10, 2);
    expect(plugin.deployment(true)).toMatchObject({ unit: 'kW', current: 60, target: 40, chargePercent: 10, changePerLap: -10, edge: 20, edgeSeconds: 0 });
    const map = new DeploymentTracker();
    laps(map, 30, -10, 2);
    expect(map.deployment(true)).toMatchObject({ unit: 'map', current: 3, target: 2 });
  });

  it('falls back to map positions when the plugin list does not fit the game map range', () => {
    const tracker = new DeploymentTracker();
    tracker.setPluginKw([0, 20, 40]);
    laps(tracker, 30, -10, 2);
    expect(tracker.deployment(true)).toMatchObject({ unit: 'map', current: 3, target: 2 });
  });

  it('measures again after the pit lane', () => {
    const tracker = new DeploymentTracker();
    const time = laps(tracker, 30, -10, 2);
    expect(tracker.deployment(true)).toMatchObject({ target: 2 });
    // The pit lane broke the measurement: a full lap on track again before any trend.
    laps(tracker, 30, -10, 1, {}, time, 30);
    expect(tracker.deployment(true)).toMatchObject({ target: null, changePerLap: null });
    laps(tracker, 30, -10, 2, {}, time + LAP + 1);
    expect(tracker.deployment(true)).toMatchObject({ target: 2, changePerLap: -10 });
  });

  it('is null off the active sessions, without a hybrid, without a battery charge and without a usable map range', () => {
    const tracker = new DeploymentTracker();
    expect(tracker.deployment(true)).toBeNull();
    tracker.applyCar(hybrid());
    expect(tracker.deployment(false)).toBeNull();
    expect(tracker.deployment(true)).toMatchObject({ unit: 'map', current: 3, target: null, chargePercent: 50 });
    tracker.applyCar(hybrid({ motorMapMax: 0 }));
    expect(tracker.deployment(true)).toBeNull();
    // A Hypercar without a hybrid system may still report motor map fields, but never a battery charge.
    tracker.applyCar(hybrid({ batteryChargeFraction: 0, soc: 0 }));
    expect(tracker.deployment(true)).toBeNull();
    tracker.applyCar(undefined);
    expect(tracker.deployment(true)).toBeNull();
  });

  it('shows the live setting: advice already followed holds, advice a changed setting no longer fits is withdrawn', () => {
    const tracker = new DeploymentTracker();
    tracker.setPluginKw(KW);
    laps(tracker, 30, -10, 2);
    tracker.applyCar(hybrid({ motorMap: 2, batteryChargeFraction: 0.1 }));
    expect(tracker.deployment(true)).toMatchObject({ current: 40, target: 40 });
    tracker.applyCar(hybrid({ motorMap: 5, batteryChargeFraction: 0.1 }));
    expect(tracker.deployment(true)).toMatchObject({ current: 100, target: null, next: null });
  });

  it('starts again after a reset', () => {
    const tracker = new DeploymentTracker();
    laps(tracker, 30, -10, 2);
    tracker.reset();
    tracker.applyCar(hybrid());
    expect(tracker.deployment(true)).toMatchObject({ target: null, changePerLap: null });
  });
});
