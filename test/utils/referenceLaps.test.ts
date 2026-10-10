import { describe, it, expect } from 'vitest';
import { pickAttainableSameCarLap, pickFastestSameCarLap, suggestReferenceLap } from '../../src/utils/referenceLaps.js';
import type { ComparableLap } from '../../shared/types/index.js';

const RACE = 'Daytona International Speedway Road Course R1 10.Vcr';
const PRACTICE = 'Daytona International Speedway Road Course P1 20.Vcr';
const QUALI = 'Daytona International Speedway Road Course Q1 9.Vcr';
const OTHER_QUALI = 'Daytona International Speedway Road Course Q1 7.Vcr';
const ME = 'Samuel Lague';

function lap(replay: string, lapNum: number, lapTime: number, extra: Partial<ComparableLap> = {}): ComparableLap {
  return {
    id: `${replay}_${lapNum}`,
    sessionId: replay,
    driverName: ME,
    carType: 'Peugeot 9x8',
    carClass: 'Hyper',
    lapNum,
    lapTime,
    lapTimeString: '',
    s1: null,
    s2: null,
    s3: null,
    topSpeed: null,
    isValid: true,
    matchingReplayFile: replay,
    ...extra,
  } as ComparableLap;
}

const myLaps = [
  lap(RACE, 20, 95.894),
  lap(RACE, 16, 95.961),
  lap(QUALI, 7, 95.683),
  lap(PRACTICE, 24, 95.658),
  // Faster, but in another car at this track: never the suggestion.
  lap(PRACTICE, 3, 94.9, { carType: 'Porsche 963' }),
];

describe('suggestReferenceLap', () => {
  it('suggests the driver fastest lap in the same car when it beats the lap on screen', () => {
    expect(suggestReferenceLap(myLaps, RACE, ME, 20, 95.894)?.id).toBe(`${PRACTICE}_24`);
  });

  it('uses session identity when recording filenames differ from session IDs', () => {
    const candidates = myLaps.map(lap => ({ ...lap, matchingReplayFile: 'reused-recording.Vcr' }));
    expect(suggestReferenceLap(candidates, RACE, ME, 20, 95.894)?.id).toBe(`${PRACTICE}_24`);
    expect(suggestReferenceLap(candidates, 'reused-recording.Vcr', ME, 20, 95.894)).toBeNull();
  });

  it('suggests nothing when the lap on screen is already the best', () => {
    expect(suggestReferenceLap(myLaps, PRACTICE, ME, 24, 95.658)).toBeNull();
  });

  it('skips laps the parser marked non-representative', () => {
    const marked = myLaps.map(l => (l.id === `${PRACTICE}_24` ? { ...l, nonRepresentativeReason: 'offPace' as const } : l));
    expect(suggestReferenceLap(marked, RACE, ME, 20, 95.894)?.id).toBe(`${QUALI}_7`);
  });

  it('suggests nothing for a driver without laps in this replay', () => {
    expect(suggestReferenceLap(myLaps, RACE, 'Alexandr Malynych', 20, 95.746)).toBeNull();
  });
});

describe('pickFastestSameCarLap', () => {
  const analysed = { sessionId: RACE, driverName: ME, lapNum: 20, carType: 'Peugeot 9x8' };
  const everyone = [
    ...myLaps,
    lap(OTHER_QUALI, 3, 93.974, { driverName: 'Davide Catani' }),
    lap(OTHER_QUALI, 4, 93.9, { driverName: 'Davide Catani', isValid: false }),
    lap(OTHER_QUALI, 5, 93.5, { driverName: 'Davide Catani', matchingReplayFile: undefined }),
  ];

  it('picks the fastest same-car lap by any driver, with a replay and at racing speed', () => {
    expect(pickFastestSameCarLap(everyone, analysed)?.id).toBe(`${OTHER_QUALI}_3`);
  });

  it('takes the next fastest when the analysed lap is the fastest there is', () => {
    const fastest = { sessionId: OTHER_QUALI, driverName: 'Davide Catani', lapNum: 3, carType: 'Peugeot 9x8' };
    expect(pickFastestSameCarLap(everyone, fastest)?.id).toBe(`${PRACTICE}_24`);
  });

  it('skips out-laps, pit laps and non-representative laps', () => {
    const laps = [
      lap(OTHER_QUALI, 1, 90, { driverName: 'X', isOutLap: true }),
      lap(OTHER_QUALI, 2, 91, { driverName: 'X', isPitStop: true }),
      lap(OTHER_QUALI, 6, 92, { driverName: 'X', nonRepresentativeReason: 'offPace' }),
      lap(QUALI, 7, 95.683),
    ];
    expect(pickFastestSameCarLap(laps, analysed)?.id).toBe(`${QUALI}_7`);
  });

  it('returns nothing without another same-car lap', () => {
    expect(pickFastestSameCarLap([lap(RACE, 20, 95.894)], analysed)).toBeNull();
  });
});

describe('pickAttainableSameCarLap', () => {
  // 95.894 x 0.995 = 95.415: the target.
  const analysed = { sessionId: RACE, driverName: ME, lapNum: 20, carType: 'Peugeot 9x8', lapTime: 95.894 };

  it('picks the same-car lap closest to 0.5% faster than the analysed lap, not the fastest', () => {
    const laps = [
      ...myLaps,
      lap(OTHER_QUALI, 3, 93.974, { driverName: 'Davide Catani' }),
      lap(OTHER_QUALI, 8, 95.45, { driverName: 'Near Rival' }),
      lap(OTHER_QUALI, 9, 95.3, { driverName: 'Other Rival' }),
    ];
    expect(pickAttainableSameCarLap(laps, analysed)?.driverName).toBe('Near Rival');
  });

  it('only considers faster laps, and prefers the faster of two equally close', () => {
    expect(pickAttainableSameCarLap([lap(RACE, 16, 95.961)], analysed)).toBeNull();
    const tied = [lap(OTHER_QUALI, 1, 95.315, { driverName: 'A' }), lap(OTHER_QUALI, 2, 95.515, { driverName: 'B' })];
    expect(pickAttainableSameCarLap(tied, analysed)?.driverName).toBe('A');
  });

  it('skips laps that cannot be a reference, like the fastest-lap picker', () => {
    const laps = [
      lap(OTHER_QUALI, 1, 95.41, { driverName: 'X', nonRepresentativeReason: 'traffic' }),
      lap(OTHER_QUALI, 2, 95.42, { driverName: 'X', carType: 'Porsche 963' }),
      lap(OTHER_QUALI, 3, 95.6, { driverName: 'X' }),
    ];
    expect(pickAttainableSameCarLap(laps, analysed)?.lapNum).toBe(3);
  });
});
