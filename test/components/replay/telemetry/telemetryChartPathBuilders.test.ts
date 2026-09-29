import { describe, expect, it } from 'vitest';
import {
  DeltaTrace, appendScalarPoint, emptyChartPaths, emptyScalarTraces,
} from '../../../../src/components/replay/telemetry/telemetryChartPathBuilders.js';

const bounds = { maxSpd: 260, maxRpm: 8000, maxFuel: 50, maxRegen: 150 };

describe('appendScalarPoint', () => {
  it('starts every trace at the first sample and steps the gear from the previous one', () => {
    const t = emptyScalarTraces();
    appendScalarPoint(t, { speedKmh: 260, throttle: 100, engineRpm: 4000 }, 2, 0, 0, true, bounds);
    appendScalarPoint(t, { speedKmh: 130, throttle: 0, engineRpm: 4000 }, 3, 2, 500, false, bounds);
    expect(t.spd).toBe('M 0.0 10.0 L 500.0 52.5 ');
    expect(t.thr).toBe('M 0.0 10.0 L 500.0 95.0 ');
    expect(t.gr).toBe('M 0.0 72.1 L 500.0 72.1 L 500.0 60.7 ');
  });

  it('leaves a channel the sample lacks empty, and starts fuel at its first sample', () => {
    const t = emptyScalarTraces();
    appendScalarPoint(t, {}, 1, 1, 0, true, bounds);
    appendScalarPoint(t, { fuel: 25 }, 1, 1, 100, false, bounds);
    expect(t.rpm).toBe('');
    expect(t.fuel).toBe('M 100.0 52.5 ');
  });
});

describe('DeltaTrace', () => {
  it('shades a gain and a loss outside the deadband and closes the area on the zero line', () => {
    const d = new DeltaTrace(1);
    d.push(0, 0, true, 0);
    d.push(-0.5, 100, false, -0.1);
    d.push(0, 200, false, 0.1);
    d.push(0, 300, false, 0);
    expect(d.gainArea).toContain('M 0.0 50 L 0.0 50.0 L 100.0 30.0 L 100.0 50 Z');
    expect(d.lossArea).toContain('L 200.0 50.0 L 200.0 50 Z');
    expect(d.area.endsWith('L 300.0 50 L 0.0 50 Z')).toBe(true);
  });
});

describe('emptyChartPaths', () => {
  it('has no traces and default scales', () => {
    const e = emptyChartPaths();
    expect(e.speedPath).toBe('');
    expect(e.maxRpm).toBe(9000);
  });
});
