import { describe, expect, it } from 'vitest';
import { tightenPauses } from '../../../../src/components/live/voice/tightenPauses.js';

const RATE = 1000;
/** Sound and silence in 10 ms frames: `S` speech, `.` silence. */
const audio = (pattern: string) => Float32Array.from(pattern.split('').flatMap(frame => Array.from({ length: 10 }, () => (frame === 'S' ? 0.5 : 0))));
const shape = (samples: Float32Array) => Array.from({ length: samples.length / 10 }, (_, index) => (samples[index * 10] > 0 ? 'S' : '.')).join('');

describe('race radio pauses', () => {
  it('cuts pauses inside a call to the limit and the silence around it to 20 ms, never the speech', () => {
    expect(shape(tightenPauses(audio('.....SSS..........SS...SS......'), RATE, 50))).toBe('..SSS.....SS...SS..');
    expect(tightenPauses(audio('....'), RATE, 50)).toHaveLength(0);
  });
});
