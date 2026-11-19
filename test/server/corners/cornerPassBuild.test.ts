import { describe, expect, it } from 'vitest';
import { nearTrackTest } from '../../../server/corners/cornerPassBuild.js';
import { buildCenterlineSpatialIndex } from '../../../server/tracks/trackProjection.js';

describe('nearTrackTest', () => {
  it('keeps samples near the centre line and drops a car parked far off it', () => {
    // One long straight segment: the test must cover its middle, not only its end points.
    const near = nearTrackTest(buildCenterlineSpatialIndex([[0, 0], [500, 0], [500, 500], [0, 500]]));
    expect(near(250, 0)).toBe(true);
    expect(near(250, 29)).toBe(true);
    expect(near(250, -29)).toBe(true);
    // Never as far as the projection's whole-track search (50 m).
    expect(near(250, 50)).toBe(false);
    expect(near(250, -50)).toBe(false);
    expect(near(250, 120)).toBe(false);
    expect(near(250, 250)).toBe(false);
  });
});
