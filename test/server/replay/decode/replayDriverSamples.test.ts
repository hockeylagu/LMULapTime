import { describe, expect, it } from 'vitest';
import { ReplayDriverSamples } from '../../../../server/replay/decode/replayDriverSamples.js';

describe('bounded replay sample staging', () => {
  it('retains exact channels across automatic chunks without requiring lap timing packets', () => {
    const samples = new ReplayDriverSamples();
    const payload = Buffer.alloc(65);
    payload.writeFloatLE(-0, 45);
    payload.writeFloatLE(Math.PI, 57);
    let state = { brakeTemps: [500, 501, 502, 503] as [number, number, number, number], virtualEnergy: 89.123456789 };
    try {
      for (let index = 0; index < 9000; index++) {
        if (index === 4500) state = { brakeTemps: [600, 601, 602, 603], virtualEnergy: 45.987654321 };
        payload.writeFloatLE(index, 41);
        samples.append(1, index / 50, 9, payload, 0, state);
        payload.writeFloatLE(-index, 41);
        samples.append(2, index / 50, 10, payload, 0, state);
        if (index === 5000) samples.flush();
      }
      samples.flush();
      const actual = samples.read(1);
      expect(actual.map(point => point.x)).toEqual(Array.from({ length: 9000 }, (_, index) => index));
      expect(actual.map(point => point.sTime)).toEqual(Array.from({ length: 9000 }, (_, index) => index / 50));
      expect(actual.every((point, index) => point.virtualEnergy === (index < 4500 ? 89.123456789 : 45.987654321) && point.gearRaw === 1)).toBe(true);
      expect(actual[4499].brakeTemps).toEqual([500, 501, 502, 503]);
      expect(actual[4500].brakeTemps).toEqual([600, 601, 602, 603]);
      expect(Object.is(actual[0].y, -0)).toBe(true);
      expect(samples.read(2).map(point => point.x)).toEqual(Array.from({ length: 9000 }, (_, index) => -index));
      expect(samples.read(1)).toEqual([]);
      expect(samples.read(99)).toEqual([]);
    } finally {
      samples.close();
    }
  });
});
