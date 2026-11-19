import { describe, expect, it } from 'vitest';
import { buildSequenceMap, checkSequenceMap, type SequenceLap } from '../../../shared/domain/cornerSequences/sequenceMap.js';

const LENGTH = 1000;

/** A lap from its turning points in driving order: [type, distance, speed]. */
function lap(points: Array<['max' | 'min', number, number]>): SequenceLap {
  return { points: points.map(([type, distM, speedKmh], index) => ({ type, distM, speedKmh, index })) };
}

const startsOf = (laps: SequenceLap[], turns: Array<{ id: number; apexM: number }>) =>
  buildSequenceMap(turns, laps, LENGTH).sequences.map(sequence => ({ turnIds: sequence.turnIds, startM: sequence.startM, minM: sequence.minM }));

describe('buildSequenceMap', () => {
  it('joins two turns with no speed peak between them and starts each sequence where the speed drops for it', () => {
    const turns = [{ id: 1, apexM: 100 }, { id: 2, apexM: 150 }, { id: 3, apexM: 500 }];
    const laps = [lap([['min', 120, 100], ['max', 350, 240], ['min', 500, 90], ['max', 900, 250]])];
    expect(startsOf(laps, turns)).toEqual([
      { turnIds: [3], startM: 350, minM: 500 },
      { turnIds: [1, 2], startM: 900, minM: 120 },
    ]);
  });

  it('joins a chicane that gets back little of the speed lost into it, by a majority of the laps', () => {
    const turns = [{ id: 1, apexM: 100 }, { id: 2, apexM: 160 }, { id: 3, apexM: 600 }];
    // Into turn 1 from 250 km/h to 100; 110 between the two apexes is 7% back: one braking zone.
    const chicane = (between: number) => lap([['max', 20, 250], ['min', 100, 100], ['max', 130, between], ['min', 160, 95],
      ['max', 400, 240], ['min', 600, 90]]);
    const map = buildSequenceMap(turns, [chicane(110), chicane(112), chicane(220)], LENGTH);
    expect(map.joinVotes[0]).toBe(2);
    expect(map.recovered[0]).toBeCloseTo(0.08, 2);
    expect(map.sequences.map(sequence => sequence.turnIds)).toEqual([[3], [1, 2]]);
    // Most laps get the speed back between them: two corners.
    const split = buildSequenceMap(turns, [chicane(220), chicane(225), chicane(110)], LENGTH);
    expect(split.sequences.map(sequence => sequence.turnIds)).toEqual([[2], [3], [1]]);
  });

  it('joins a chicane across the start line, reading the dip at the end of the lap', () => {
    // Into turn 2 (apex 980) from 250 km/h to 100; 110 just past the line is 7% back before turn 1 (apex 20).
    const turns = [{ id: 1, apexM: 20 }, { id: 2, apexM: 980 }, { id: 3, apexM: 500 }].sort((a, b) => a.apexM - b.apexM);
    const crossing = lap([['max', 5, 110], ['min', 20, 95], ['max', 300, 240], ['min', 500, 90], ['max', 900, 250], ['min', 980, 100]]);
    const map = buildSequenceMap(turns, [crossing, crossing], LENGTH);
    expect(map.recovered[2]).toBeCloseTo(0.07, 2);
    expect(map.sequences.map(sequence => sequence.turnIds)).toEqual([[3], [2, 1]]);
  });

  it('gives a run no lap slows for to the sequence before it, as exit turns', () => {
    // The speed comes back after turn 1 (two corners), but never drops for turn 2: it has no start of its own.
    const turns = [{ id: 1, apexM: 100 }, { id: 2, apexM: 300 }];
    const map = buildSequenceMap(turns, [lap([['max', 20, 250], ['min', 100, 90], ['max', 250, 240]])], LENGTH);
    expect(map.joinVotes[0]).toBe(0);
    expect(map.sequences).toEqual([expect.objectContaining({ turnIds: [1, 2], exitTurnIds: [2] })]);
  });

  it('starts a hairpin taken in two dips at the approach, not at the small rise in its middle', () => {
    const turns = [{ id: 1, apexM: 300 }, { id: 2, apexM: 700 }];
    const laps = [lap([['min', 250, 150], ['max', 270, 162], ['min', 300, 150], ['max', 500, 230], ['min', 700, 80], ['max', 950, 260]])];
    expect(startsOf(laps, turns).find(sequence => sequence.turnIds[0] === 1)?.startM).toBe(950);
  });

  it('takes the median start over the laps and how far they spread', () => {
    const turns = [{ id: 1, apexM: 300 }, { id: 2, apexM: 700 }];
    const at = (start: number) => lap([['max', start, 250], ['min', 300, 100], ['max', 500, 230], ['min', 700, 80]]);
    const first = buildSequenceMap(turns, [at(180), at(200), at(230)], LENGTH).sequences.find(sequence => sequence.turnIds[0] === 1)!;
    expect(first.startM).toBe(200);
    expect(first.startSpreadM).toEqual({ median: 20, max: 30 });
    expect(first.lapCount).toBe(3);
  });

  it('keeps a turn far past the slowest point as an exit turn', () => {
    const turns = [{ id: 1, apexM: 300 }, { id: 2, apexM: 500 }, { id: 3, apexM: 800 }];
    const laps = [lap([['max', 100, 250], ['min', 300, 100], ['max', 700, 240], ['min', 800, 90]])];
    const sequences = buildSequenceMap(turns, laps, LENGTH).sequences;
    expect(sequences.map(sequence => [sequence.turnIds, sequence.exitTurnIds])).toEqual([[[3], []], [[1, 2], [2]]]);
  });

  it('has no sequences without laps or turns', () => {
    expect(buildSequenceMap([], [lap([['max', 0, 200]])], LENGTH).sequences).toEqual([]);
    expect(buildSequenceMap([{ id: 1, apexM: 100 }], [], LENGTH).sequences).toEqual([]);
  });
});

describe('checkSequenceMap', () => {
  it('reports each sequence grouped the same way and how far its start sits, across the line', () => {
    const turns = [{ id: 1, apexM: 100 }, { id: 2, apexM: 500 }];
    const map = buildSequenceMap(turns, [lap([['min', 100, 100], ['max', 300, 240], ['min', 500, 90], ['max', 990, 250]])], LENGTH);
    const check = buildSequenceMap(turns, [lap([['max', 20, 250], ['min', 100, 100], ['max', 290, 240], ['min', 500, 90]])], LENGTH);
    expect(checkSequenceMap(map, check)).toEqual([
      { turnIds: [2], sameGrouping: true, startOffsetM: -10 },
      { turnIds: [1], sameGrouping: true, startOffsetM: 30 },
    ]);
    const joined = buildSequenceMap(turns, [lap([['max', 900, 250], ['min', 300, 100]])], LENGTH);
    expect(checkSequenceMap(map, joined).map(item => item.sameGrouping)).toEqual([false, false]);
  });
});
