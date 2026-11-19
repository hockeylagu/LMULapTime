import { describe, expect, it } from 'vitest';
import { howText } from '../../../../src/components/replay/cornerCard/cornerCardText.js';
import type { Gain } from '../../../../src/components/replay/cornerCard/cornerInsight.js';

const gain = (extra: Partial<Gain>): Gain => ({
  deltaSec: 0.1, carNumber: '7', name: 'Rival', rank: 1, of: 3, entrySec: 0.07, exitSec: 0.03,
  brakeM: null, minSpeedKmh: null, throttleM: null, ...extra,
});

describe('howText', () => {
  it('says what the faster car does differently, leaving out what is about the same', () => {
    expect(howText(gain({ brakeM: 8.4, minSpeedKmh: 3.6, throttleM: -6 }))).toBe('brakes 8 m later, +4 km/h min, throttle 6 m sooner');
    expect(howText(gain({ brakeM: -3, minSpeedKmh: -2, throttleM: 0.5 }))).toBe('brakes 3 m earlier, −2 km/h min');
    expect(howText(gain({ brakeM: 0.4, minSpeedKmh: 0.2 }))).toBe('same points');
  });
});
