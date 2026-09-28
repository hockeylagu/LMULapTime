import { describe, it, expect } from 'vitest';
import { annotateLapTraffic, hadTraffic } from '../../shared/domain/raceTraffic.js';
import type { LapTraffic } from '../../shared/types/index.js';

interface TestLap {
  lapNum: number;
  lapTime: number | null;
  elapsedSeconds: number | null;
  isPitStop: boolean;
  isOutLap?: boolean;
  traffic?: LapTraffic;
}

/**
 * A driver whose laps start at the given session times (LMU's `et` is the lap start). Each lap
 * lasts until the next one starts; the last lap lasts `lastLapTime`.
 */
function driver(name: string, carClass: string, starts: number[], lastLapTime = 100) {
  const laps: TestLap[] = starts.map((start, i) => ({
    lapNum: i + 1,
    lapTime: i + 1 < starts.length ? starts[i + 1] - start : lastLapTime,
    elapsedSeconds: start,
    isPitStop: false,
  }));
  return { name, carClass, laps };
}

const lap = (d: { laps: TestLap[] }, lapNum: number) => d.laps.find(l => l.lapNum === lapNum)?.traffic;

describe('annotateLapTraffic', () => {
  it('measures the nearest cars on the road when each lap starts', () => {
    const me = driver('Me', 'Hyper', [100, 200, 300]);
    const ahead = driver('Ahead', 'Hyper', [99.2, 198.5, 298.1]);
    const behind = driver('Behind', 'Hyper', [101.5, 202.25, 303]);

    annotateLapTraffic([me, ahead, behind]);

    expect(lap(me, 2)?.ahead).toEqual({ car: { name: 'Ahead', carClass: 'Hyper', sameClass: true }, gapSec: 1.5 });
    expect(lap(me, 2)?.behind?.gapSec).toBe(2.25);
    expect(lap(me, 2)?.behind?.car.name).toBe('Behind');
  });

  it('finds a slower car passed during the lap, in another class', () => {
    // The GT3 starts the lap 3 s ahead on the road and crosses the line 10 s after the Hypercar.
    const me = driver('Me', 'Hyper', [100, 200, 300]);
    const gt3 = driver('Slow GT3', 'GT3', [85, 197, 310]);

    annotateLapTraffic([me, gt3]);

    expect(lap(me, 2)?.passed).toEqual([{ name: 'Slow GT3', carClass: 'GT3', sameClass: false }]);
    expect(lap(me, 2)?.passedBy).toEqual([]);
    expect(lap(gt3, 2)?.passedBy.map(c => c.name)).toEqual(['Me']);
    expect(hadTraffic(lap(me, 2))).toBe(true);
  });

  it('finds a faster car that passed the driver during the lap', () => {
    const me = driver('Me', 'Hyper', [100, 200, 300]);
    const rival = driver('Rival', 'Hyper', [101, 201, 299]);

    annotateLapTraffic([me, rival]);

    expect(lap(me, 2)?.passedBy.map(c => c.name)).toEqual(['Rival']);
    expect(lap(me, 1)?.passedBy).toEqual([]);
  });

  it('marks a lap spent within a second of a car ahead at both ends as following', () => {
    const me = driver('Me', 'Hyper', [100, 200, 300, 400]);
    const ahead = driver('Ahead', 'Hyper', [99.5, 199.4, 298, 398]);

    annotateLapTraffic([me, ahead]);

    expect(lap(me, 2)?.following).toBe(false); // 0.6 s at the start, 2 s at the finish
    expect(lap(me, 1)?.following).toBe(true);
    expect(hadTraffic(lap(me, 1))).toBe(true);
    expect(lap(me, 3)?.following).toBe(false);
  });

  it('marks a lap spent with a car within a second behind at both ends as pressured', () => {
    const me = driver('Me', 'Hyper', [100, 200, 300, 400]);
    const behind = driver('Behind', 'Hyper', [100.5, 200.6, 302, 402]);

    annotateLapTraffic([me, behind]);

    expect(lap(me, 1)?.pressured).toBe(true);
    expect(hadTraffic(lap(me, 1))).toBe(true);
    expect(lap(me, 2)?.pressured).toBe(false); // 0.6 s at the start, 2 s at the finish
  });

  it('does not call a car on its way into, in or out of the pits an overtake', () => {
    // Each car is on the road ahead when one of Me's laps starts and crosses the line after it ends.
    const me = driver('Me', 'Hyper', [100, 200, 300, 400, 500]);
    const inLap = driver('In-lap', 'Hyper', [99, 199, 310, 420]);
    inLap.laps[2].isPitStop = true; // lap 3 holds the stop, so lap 2 is the in-lap
    const pitLap = driver('Pit lap', 'Hyper', [99, 199, 299, 410]);
    pitLap.laps[2].isPitStop = true;
    const outLap = driver('Out-lap', 'Hyper', [99, 199, 299, 399, 510]);
    outLap.laps[3].isOutLap = true;
    const racing = driver('Racing', 'Hyper', [99, 199, 310, 420]);

    annotateLapTraffic([me, inLap, pitLap, outLap, racing]);

    expect(lap(me, 2)?.passed.map(c => c.name)).toEqual(['Racing']);
    expect(lap(me, 3)?.passed).toEqual([]);
    expect(lap(me, 4)?.passed).toEqual([]);
  });

  it('times the last lap from its lap time, and finds nothing on a standing start', () => {
    const me = driver('Me', 'Hyper', [50, 150], 95);
    const other = driver('Other', 'Hyper', [50, 148], 110);

    annotateLapTraffic([me, other]);

    // Both start lap 1 together: nobody is ahead or passed.
    expect(lap(me, 1)?.ahead).toBeNull();
    expect(lap(me, 1)?.passed).toEqual([]);
    // Lap 2: Other starts 2 s ahead, finishes at 258, after Me at 245.
    expect(lap(me, 2)?.passed.map(c => c.name)).toEqual(['Other']);
  });

  it('leaves laps without line times unannotated and replaces older results', () => {
    const me = driver('Me', 'Hyper', [100, 200]);
    me.laps.push({ lapNum: 3, lapTime: null, elapsedSeconds: null, isPitStop: false, traffic: { ahead: null, behind: null, following: true, passed: [], passedBy: [] } });

    annotateLapTraffic([me]);

    expect(lap(me, 3)).toBeUndefined();
    expect(lap(me, 1)).toEqual({ ahead: null, behind: null, following: false, pressured: false, passed: [], passedBy: [] });
    expect(hadTraffic(lap(me, 1))).toBe(false);
  });
});
