import { describe, expect, it } from 'vitest';
import { dayShare } from '../../../../../src/components/replay/view3d/scene/dayLight.js';

const ambient = { nightLevel: 2, perSunGreen: [0.05, 0.06, 0.07] as [number, number, number], fit: { minSunElevationDeg: 10, maxCloudCoverage: 0.2 } };

describe('dayShare', () => {
  it('is the ambient red (the sun green times its share) over the night level, saturated', () => {
    expect(dayShare(ambient, 20)).toBeCloseTo(0.5);
    expect(dayShare(ambient, 40)).toBe(1);
    expect(dayShare(ambient, 400)).toBe(1);
    expect(dayShare(ambient, 0)).toBe(0);
  });
});
