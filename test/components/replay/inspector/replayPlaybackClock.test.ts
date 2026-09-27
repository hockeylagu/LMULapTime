import { describe, expect, it } from 'vitest';
import { advancePlaybackClock, playbackClockAt } from '../../../../src/components/replay/inspector/replayPlaybackClock.js';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';

const at = (timeSec: number): ReplayTrajectoryPoint => ({ x: 0, y: 0, z: 0, speedKmh: 100, timeSec });

/** Plays from the first sample in 16 ms frames; returns wall seconds and the samples shown. */
function play(points: ReplayTrajectoryPoint[], speed: number) {
  let clock = playbackClockAt(points, 0);
  const shown = [clock.index];
  let frames = 0;
  for (;;) {
    const next = advancePlaybackClock(points, clock, 16, speed);
    if (!next) break;
    frames++;
    if (next.index !== clock.index) shown.push(next.index);
    clock = next;
  }
  return { wallSec: (frames * 16) / 1000, shown };
}

describe('replay playback clock', () => {
  // Dense samples through a braking zone, sparse on the straight, as the server serves a lap.
  const uneven = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 2, 4, 6, 8, 10].map(at);

  it('plays a lap in its lap time at 1x however unevenly it is sampled, and twice as fast at 2x', () => {
    expect(play(uneven, 1).wallSec).toBeCloseTo(10, 1);
    expect(play(uneven, 2).wallSec).toBeCloseTo(5, 1);
    expect(play(uneven, 0.5).wallSec).toBeCloseTo(20, 1);
  });

  it('shows each sample from its time until the next, never going back', () => {
    const { shown } = play(uneven, 1);
    expect(shown).toEqual(uneven.map((_, i) => i));
    const clock = advancePlaybackClock(uneven, playbackClockAt(uneven, 6), 1000, 1);
    expect(clock).toEqual({ timeSec: 1.3, index: 6 });
    expect(advancePlaybackClock(uneven, playbackClockAt(uneven, 6), 1800, 1)?.index).toBe(7);
  });

  it('restarts from a sample the cursor was moved to, and ends past the last sample', () => {
    expect(playbackClockAt(uneven, 8)).toEqual({ timeSec: 4, index: 8 });
    expect(playbackClockAt(uneven, 99).index).toBe(11);
    expect(advancePlaybackClock(uneven, playbackClockAt(uneven, 10), 2100, 1)).toEqual({ timeSec: 10, index: 11 });
    expect(advancePlaybackClock(uneven, playbackClockAt(uneven, 11), 16, 1)).toBeNull();
    expect(advancePlaybackClock([], { timeSec: 0, index: 0 }, 16, 1)).toBeNull();
  });

  it('steps samples evenly when the lap has no timestamps', () => {
    const untimed = Array.from({ length: 41 }, () => ({ x: 0, y: 0, z: 0, speedKmh: 100 }));
    expect(play(untimed, 1).wallSec).toBeCloseTo(1, 1);
  });
});
