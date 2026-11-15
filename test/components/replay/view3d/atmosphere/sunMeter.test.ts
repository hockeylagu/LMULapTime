import { describe, expect, it } from 'vitest';
import { cloudSheets, sunVisibility, type CloudMoment } from '../../../../../src/components/replay/view3d/atmosphere/clouds.js';
import { createSunMeter, SUN_METER_STEP_M } from '../../../../../src/components/replay/view3d/atmosphere/sunMeter.js';
import { testClouds, testShading } from '../../../../helpers/scenes/sceneryProfiles.js';

const moment: CloudMoment = {cells: '0ffff', upperDrift: 0, lowerDrift: 0, startUpperDrift: -10, startLowerDrift: -10};
const rule = testShading().sunVisibility, UP: [number, number, number] = [0, 1, 0];

describe('sun meter', () => {
  it('measures again once the eye moved its step from the last measure, from where the eye is then', () => {
    const clouds = testClouds(), sheets = cloudSheets(clouds, moment, 0), meter = createSunMeter(rule, clouds, sheets, UP, [5000, 0, 5000]);
    expect(meter.step([5000 - SUN_METER_STEP_M * 0.9, 0, 5000])).toBeNull(); expect(meter.running).toBe(false);
    // Under the opaque sheet: the test rule's 8-row view is measured in one frame.
    expect(meter.step([-500, 0, -500])).toBe(sunVisibility(rule, clouds, sheets, UP, [-500, 0, -500]));
    expect(meter.running).toBe(false);
    expect(meter.step([-500 + SUN_METER_STEP_M * 0.9, 0, -500])).toBeNull();
  });
});
