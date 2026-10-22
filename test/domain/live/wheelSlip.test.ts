import { describe, expect, it } from 'vitest';
import { detectWheelSlipEvents, wheelSlipChannelIndexes, wheelSlipRatios } from '../../../shared/domain/live/wheelSlip.js';
import type { LiveEvidenceChannel, WheelSlipRatios } from '../../../shared/types/liveEvidence.js';

const wheelChannels: LiveEvidenceChannel[] = ['fl', 'fr', 'rl', 'rr'].flatMap(wheel => (['patch', 'ground'] as const).map(kind => ({
  name: `${wheel}_${kind}_longitudinal_mps`, unit: 'm/s', frame: 'iso8855-wheel' as const, sourceField: kind,
})));

/** Evenly spaced samples (default 10 ms); `rear` is the RL ratio, the other wheels roll freely. */
const samples = (rear: Array<number | null>, from = 0, step = 0.01) => rear.map((ratio, index) => ({
  lapSeconds: from + index * step, ratios: [0, 0, ratio, 0] as WheelSlipRatios,
}));

describe('measured wheel slip', () => {
  it('uses the SAE sign: braking/lockup negative, wheelspin positive, undefined for airborne or slow wheels', () => {
    const indexes = wheelSlipChannelIndexes(wheelChannels)!;
    // Patch velocity forward-positive: the tyre surface sliding forward over the road while braking.
    expect(wheelSlipRatios([4, 40, -8, 40, 10, 40, 0, 0], indexes)).toEqual([-0.1, 0.2, -0.25, null]);
    expect(wheelSlipRatios([null, 40, 0, -40, 0, 4.9, 0, Number.NaN], indexes)).toEqual([null, null, null, null]);
  });

  it('requires both longitudinal channels for every wheel', () => {
    expect(wheelSlipChannelIndexes(wheelChannels.slice(1))).toBeNull();
    expect(wheelSlipChannelIndexes(wheelChannels.map(channel => ({ ...channel, frame: 'iso8855-vehicle' as const })))).toBeNull();
  });

  it('keeps spans of at least 40 ms beyond 15 %, with the most extreme ratio', () => {
    const events = detectWheelSlipEvents([...samples([0.2, 0.3, 0.2, 0.2]), ...samples([0.16, 0.2, 0.4, 0.2, 0.16, 0.1], 0.5)]);
    expect(events).toEqual([{ kind: 'wheelspin', wheel: 'rl', startLapSeconds: 0.5, endLapSeconds: 0.54, peakSlipRatio: 0.4 }]);
  });

  it('separates lockups from wheelspin and merges cycling across short dips only', () => {
    const lockup = detectWheelSlipEvents(samples([-0.2, -0.2, -0.2, 0, 0, 0, -0.3, -0.2]));
    expect(lockup).toEqual([{ kind: 'lockup', wheel: 'rl', startLapSeconds: 0, endLapSeconds: 0.07, peakSlipRatio: -0.3 }]);
    expect(detectWheelSlipEvents(samples([-0.2, -0.2, -0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.2, -0.2, -0.2]))).toEqual([]);
  });

  it('counts time, not samples, so 25 Hz captures keep two-sample events and merge across one dipped sample', () => {
    expect(detectWheelSlipEvents(samples([-0.2, -0.2, 0, -0.3, -0.2], 0, 0.04))).toEqual([
      { kind: 'lockup', wheel: 'rl', startLapSeconds: 0, endLapSeconds: 0.16, peakSlipRatio: -0.3 }]);
    expect(detectWheelSlipEvents(samples([0, -0.2, 0], 0, 0.04))).toEqual([]);
  });

  it('never spans a capture gap or an unavailable ratio', () => {
    const gap = [...samples([0.2, 0.2, 0.2]), ...samples([0.2, 0.2, 0.2], 0.2)];
    expect(detectWheelSlipEvents(gap)).toEqual([]);
    expect(detectWheelSlipEvents(samples([0.2, 0.2, null, 0.2, 0.2, 0.2]))).toEqual([]);
  });
});
