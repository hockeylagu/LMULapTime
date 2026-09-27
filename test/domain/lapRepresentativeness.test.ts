import { describe, it, expect } from 'vitest';
import { markNonRepresentativeLaps } from '../../shared/domain/lapRepresentativeness.js';
import { selectCleanLapCandidates } from '../../shared/domain/lapComparison.js';
import type { LapIncident, LapTraffic, NonRepresentativeReason, TrafficCar } from '../../shared/types/index.js';

interface TestLap {
  lapNum: number;
  lapTime: number | null;
  isValid: boolean;
  isPitStop: boolean;
  isOutLap?: boolean;
  incidents?: LapIncident[];
  traffic?: LapTraffic;
  nonRepresentativeReason?: NonRepresentativeReason;
}

const contact: LapIncident = { type: 'contact', description: 'Contact with another car (326N)' };
const damage: LapIncident = { type: 'damage', description: 'New front wing damage reported' };
const gt3: TrafficCar = { name: 'Rui Paiva', carClass: 'GT3', sameClass: false };

const trafficWith = (traffic: Partial<LapTraffic>): LapTraffic => ({
  ahead: null, behind: null, following: false, passed: [], passedBy: [], ...traffic,
});

// Lap times from a 25-lap Hypercar race at Daytona: lap 9 and lap 15 had contact.
const daytonaTimes = [
  106.028, 97.81, 96.222, 96.524, 96.659, 96.168, 96.868, 97.131, 100.358, 97.027, 96.964, 97.126, 96.174,
  96.734, 97.552, 95.961, 96.478, 96.088, 96.061, 95.894, 96.381, 96.155, 96.189, 96.011, 96.134,
];

function lapsFrom(times: Array<number | null>): TestLap[] {
  return times.map((lapTime, i) => ({ lapNum: i + 1, lapTime, isValid: true, isPitStop: false }));
}

describe('markNonRepresentativeLaps', () => {
  it('marks the slow laps that had contact and leaves the rest of a race alone', () => {
    const laps = lapsFrom(daytonaTimes);
    laps[8].incidents = [contact];
    laps[14].incidents = [contact];

    markNonRepresentativeLaps(laps);

    const marked = laps.filter(l => l.nonRepresentativeReason).map(l => [l.lapNum, l.nonRepresentativeReason]);
    // Lap 1, the standing start, is already out of flying pace and is not marked.
    expect(marked).toEqual([[9, 'contact'], [15, 'contact']]);
  });

  it('keeps a lap with contact that was still faster than the median', () => {
    const laps = lapsFrom([96.0, 96.0, 96.4, 95.8, 96.2, 96.1]);
    laps[3].incidents = [contact];

    markNonRepresentativeLaps(laps);

    expect(laps[3].nonRepresentativeReason).toBeUndefined();
  });

  it('treats reported damage like contact', () => {
    const laps = lapsFrom([96.0, 96.0, 96.4, 96.9, 96.2, 96.1]);
    laps[3].incidents = [damage];

    markNonRepresentativeLaps(laps);

    expect(laps[3].nonRepresentativeReason).toBe('contact');
  });

  it('marks a lap more than 3% off the median as off pace, and one just inside it not at all', () => {
    const laps = lapsFrom([100, 100, 100, 100, 103.1, 102.9]);

    markNonRepresentativeLaps(laps);

    expect(laps[4].nonRepresentativeReason).toBe('offPace');
    expect(laps[5].nonRepresentativeReason).toBeUndefined();
  });

  it('measures the median over racing laps only, ignoring pit and out-laps', () => {
    const laps = lapsFrom([100, 100, 100, 100, 140, 150, 104]);
    laps[4].isPitStop = true;
    laps[5].isOutLap = true;

    markNonRepresentativeLaps(laps);

    expect(laps[4].nonRepresentativeReason).toBeUndefined();
    expect(laps[5].nonRepresentativeReason).toBeUndefined();
    expect(laps[6].nonRepresentativeReason).toBe('offPace');
  });

  it('marks nothing when there are too few racing laps for a median', () => {
    // Lap 1 is the start lap, so only two racing laps remain.
    const laps = lapsFrom([100, 100, 120]);

    markNonRepresentativeLaps(laps);

    expect(laps.some(l => l.nonRepresentativeReason)).toBe(false);
  });

  it('marks a slow lap spent in traffic, and keeps a fast one', () => {
    const laps = lapsFrom([100, 100, 100, 100, 100.6, 99.8, 100.4]);
    laps[4].traffic = trafficWith({ passed: [gt3] });
    laps[5].traffic = trafficWith({ passed: [gt3] });
    laps[6].traffic = trafficWith({ following: true });

    markNonRepresentativeLaps(laps);

    expect(laps[4].nonRepresentativeReason).toBe('traffic');
    expect(laps[5].nonRepresentativeReason).toBeUndefined();
    expect(laps[6].nonRepresentativeReason).toBe('traffic');
  });

  it('calls a slow lap with contact contact even when there was traffic too', () => {
    const laps = lapsFrom([100, 100, 100, 100, 104]);
    laps[4].incidents = [contact];
    laps[4].traffic = trafficWith({ passedBy: [gt3] });

    markNonRepresentativeLaps(laps);

    expect(laps[4].nonRepresentativeReason).toBe('contact');
  });

  it('does not count cars merely nearby on the road as traffic', () => {
    const laps = lapsFrom([100, 100, 100, 100, 100.6]);
    laps[4].traffic = trafficWith({ ahead: { car: gt3, gapSec: 0.4 } });

    markNonRepresentativeLaps(laps);

    expect(laps[4].nonRepresentativeReason).toBeUndefined();
  });

  it('clears a mark left from an earlier pass', () => {
    const laps = lapsFrom([100, 100, 100, 100, 101]);
    laps[4].nonRepresentativeReason = 'offPace';

    markNonRepresentativeLaps(laps);

    expect(laps[4].nonRepresentativeReason).toBeUndefined();
  });
});

describe('selectCleanLapCandidates with non-representative laps', () => {
  it('leaves out the laps the parser marked', () => {
    const laps = lapsFrom(daytonaTimes);
    laps[8].incidents = [contact];
    laps[14].incidents = [contact];
    markNonRepresentativeLaps(laps);

    const clean = selectCleanLapCandidates(laps).map(l => l.lapNum);

    expect(clean).not.toContain(9);
    expect(clean).not.toContain(15);
    expect(clean).toHaveLength(22);
  });
});
