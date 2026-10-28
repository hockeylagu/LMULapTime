import { describe, it, expect } from 'vitest';
import { pickReferenceLaps } from '../../src/utils/referenceLaps.js';
import type { ComparableLap } from '../../shared/types/index.js';

const RACE = 'Daytona International Speedway Road Course R1 10.Vcr';
const PRACTICE = 'Daytona International Speedway Road Course P1 20.Vcr';
const QUALI = 'Daytona International Speedway Road Course Q1 9.Vcr';
const OTHER_QUALI = 'Daytona International Speedway Road Course Q1 7.Vcr';
const ME = 'Samuel Lague';

function lap(replay: string, lapNumber: number, lapTime: number, extra: Partial<ComparableLap> = {}): ComparableLap {
  return {
    id: `${replay}_${lapNumber}`,
    sessionId: replay,
    driverName: ME,
    carType: 'Peugeot 9x8',
    carClass: 'Hyper',
    lapNumber,
    lapTime,
    s1: null,
    s2: null,
    s3: null,
    topSpeed: null,
    isValid: true,
    matchingReplayFile: replay,
    ...extra,
  };
}

const myLaps = [
  lap(RACE, 20, 95.894),
  lap(RACE, 16, 95.961),
  lap(QUALI, 7, 95.683),
  lap(PRACTICE, 24, 95.658),
  // Faster, but in another car at this track: never the suggestion.
  lap(PRACTICE, 3, 94.9, { carType: 'Porsche 963' }),
];

const pick = (laps: ComparableLap[], analysed: { sessionId: string; driverName: string; lapNumber: number; carType: string; lapTime: number }, classLaps: ComparableLap[] = []) =>
  pickReferenceLaps(laps, classLaps, analysed);

describe('pickReferenceLaps: technique (the fastest lap)', () => {
  const analysed = { sessionId: RACE, driverName: ME, lapNumber: 20, carType: 'Peugeot 9x8', lapTime: 95.894 };
  const everyone = [
    ...myLaps,
    lap(OTHER_QUALI, 3, 93.974, { driverName: 'Davide Catani' }),
    lap(OTHER_QUALI, 4, 93.9, { driverName: 'Davide Catani', isValid: false }),
    lap(OTHER_QUALI, 5, 93.5, { driverName: 'Davide Catani', matchingReplayFile: undefined }),
  ];

  it('picks the fastest same-car lap by any driver, with a replay and at racing speed', () => {
    const picked = pick(everyone, analysed);
    expect(picked.technique?.id).toBe(`${OTHER_QUALI}_3`);
    expect(picked.reference?.id).toBe(`${PRACTICE}_24`);
    expect(picked.pool).toBe('car');
  });

  it('falls back to the next fastest when the analysed lap is the fastest there is', () => {
    const fastest = { sessionId: OTHER_QUALI, driverName: 'Davide Catani', lapNumber: 3, carType: 'Peugeot 9x8', lapTime: 93.974 };
    const picked = pick(everyone, fastest);
    expect(picked.reference?.id).toBe(`${PRACTICE}_24`);
    expect(picked.technique).toBeNull();
  });

  it('skips out-laps, pit laps and non-representative laps', () => {
    const laps = [
      lap(OTHER_QUALI, 1, 90, { driverName: 'X', isOutLap: true }),
      lap(OTHER_QUALI, 2, 91, { driverName: 'X', isPitStop: true }),
      lap(OTHER_QUALI, 6, 92, { driverName: 'X', nonRepresentativeReason: 'offPace' }),
      lap(QUALI, 7, 95.683),
    ];
    expect(pick(laps, analysed)).toMatchObject({ reference: { id: `${QUALI}_7` }, technique: null });
  });

  it('returns nothing without another same-car lap', () => {
    expect(pick([lap(RACE, 20, 95.894)], analysed)).toEqual({ reference: null, technique: null, pool: 'car' });
  });
});

describe('pickReferenceLaps: reference (the realistic lap)', () => {
  // 95.894 x 0.995 = 95.415: the target.
  const analysed = { sessionId: RACE, driverName: ME, lapNumber: 20, carType: 'Peugeot 9x8', lapTime: 95.894 };

  it('picks the same-car lap closest to 0.5% faster than the analysed lap, not the fastest', () => {
    const laps = [
      ...myLaps,
      lap(OTHER_QUALI, 3, 93.974, { driverName: 'Davide Catani' }),
      lap(OTHER_QUALI, 8, 95.45, { driverName: 'Near Rival' }),
      lap(OTHER_QUALI, 9, 95.3, { driverName: 'Other Rival' }),
    ];
    expect(pick(laps, analysed).reference?.driverName).toBe('Near Rival');
  });

  it('only considers faster laps, and prefers the faster of two equally close', () => {
    expect(pick([lap(RACE, 16, 95.961)], analysed).technique).toBeNull();
    const tied = [lap(OTHER_QUALI, 1, 95.315, { driverName: 'A' }), lap(OTHER_QUALI, 2, 95.515, { driverName: 'B' })];
    expect(pick(tied, analysed).reference?.driverName).toBe('A');
  });

  it('skips laps that cannot be a reference', () => {
    const laps = [
      lap(OTHER_QUALI, 1, 95.41, { driverName: 'X', nonRepresentativeReason: 'traffic' }),
      lap(OTHER_QUALI, 2, 95.42, { driverName: 'X', carType: 'Porsche 963' }),
      lap(OTHER_QUALI, 3, 95.6, { driverName: 'X' }),
    ];
    expect(pick(laps, analysed).reference?.lapNumber).toBe(3);
  });
});

describe('pickReferenceLaps: other cars of the class', () => {
  // Silverstone race 2026-10-28: the only faster Aston lap was 0.024 s quicker; the Porsches ran 0.8 s quicker.
  const analysed = { sessionId: RACE, driverName: ME, lapNumber: 12, carType: 'Aston Martin Vantage', lapTime: 63.225 };
  const aston = [lap(PRACTICE, 1, 63.201, { carType: 'Aston Martin Vantage' })];
  const field = [
    lap(RACE, 12, 63.225, { carType: 'Aston Martin Vantage' }),
    lap(RACE, 9, 62.152, { driverName: 'Enzo Syl', carType: 'Porsche 911 GT3 R' }),
    lap(RACE, 10, 62.96, { driverName: 'Mid Pack', carType: 'BMW M4 GT3' }),
    lap(RACE, 11, 62.5, { driverName: 'Mid Pack', carType: 'BMW M4 GT3', nonRepresentativeReason: 'traffic' }),
  ];

  it('uses the class laps when no same-car lap is clearly faster', () => {
    const picked = pick(aston, analysed, field);
    expect(picked.pool).toBe('class');
    expect(picked.reference?.driverName).toBe('Mid Pack');
    expect(picked.technique?.driverName).toBe('Enzo Syl');
  });

  it('keeps the same car when one of its laps is clearly faster', () => {
    const picked = pick([...aston, lap(QUALI, 4, 62.9, { carType: 'Aston Martin Vantage' })], analysed, field);
    expect(picked).toMatchObject({ pool: 'car', reference: { lapNumber: 4 } });
  });

  it('keeps the same car when the class is no faster either', () => {
    const picked = pick(aston, analysed, [lap(RACE, 9, 63.3, { driverName: 'Slow', carType: 'BMW M4 GT3' })]);
    expect(picked).toMatchObject({ pool: 'car', reference: { id: `${PRACTICE}_1` } });
  });
});
