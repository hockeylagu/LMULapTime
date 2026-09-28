import { describe, it, expect } from 'vitest';
import {
  describeRival,
  ghostTargetTime,
  nextRungs,
  pickRivalEntry,
  pinnedTarget,
  resolveRival,
  rivalProgress,
} from '../../shared/domain/rivals.js';
import type { Leaderboard, LeaderboardEntry, RivalTarget } from '../../shared/types/leaderboard.js';

/** A board of drivers at the given lap times; 'Me' is the player. */
function board(times: Record<string, number>, noReplay: string[] = []): Leaderboard {
  const entries = Object.entries(times)
    .sort((a, b) => a[1] - b[1])
    .map(([driverName, lapTime], i): LeaderboardEntry => ({
      driverName,
      isPlayer: driverName === 'Me',
      rank: i + 1,
      bestLap: {
        sessionId: `s-${driverName}`, sessionName: 'R1', sessionType: 'Race', timestamp: 1000, lapNum: 2, lapTime,
        s1: null, s2: null, s3: null, carType: 'Car', replayName: noReplay.includes(driverName) ? null : `${driverName}.Vcr`,
      },
      bestS1: null, bestS2: null, bestS3: null, s1Rank: null, s2Rank: null, s3Rank: null,
      theoreticalBest: driverName === 'Me' ? lapTime - 0.3 : lapTime,
      top3Average: null, top3AverageRank: null, gapToLeader: 0, representativeLaps: 3, sessions: 1, lastDriven: 1000,
    }));
  return {
    layoutKey: 'monza_gp', layoutName: '', carClass: 'LMGT3', scope: 'class', carType: null,
    entries, player: entries.find((e) => e.isPlayer) ?? null, benchmark: null,
  };
}

const target = (extra: Partial<RivalTarget>): RivalTarget => ({
  id: 7, kind: 'driver', driverName: 'Rival', targetTime: 99.7, startTime: 100, pinned: false, status: 'active',
  setAt: 1, endedAt: null, beatenTime: null, beatenSessionId: null, ...extra,
});

// At 100 s: 0.1% = 99.9, 0.3% = 99.7, 0.6% = 99.4.
describe('pickRivalEntry', () => {
  it('picks the driver ahead closest to 0.3% faster, within 0.1% to 0.6%', () => {
    const b = board({ Me: 100, TooClose: 99.95, Near: 99.8, Ideal: 99.69, Far: 99.45, TooFar: 99.3 });
    expect(pickRivalEntry(b)?.driverName).toBe('Ideal');
    expect(pickRivalEntry(b, new Set(['Ideal']))?.driverName).toBe('Near');
  });

  it('prefers a lap with a replay, whose telemetry can show where the time is', () => {
    const b = board({ Me: 100, NoReplay: 99.7, WithReplay: 99.75 }, ['NoReplay']);
    expect(pickRivalEntry(b)?.driverName).toBe('WithReplay');
  });

  it('finds nobody when nobody ahead is within the window, or the player has no lap', () => {
    expect(pickRivalEntry(board({ Me: 100, TooFar: 99, Behind: 100.2 }))).toBeNull();
    expect(pickRivalEntry(board({ Other: 100 }))).toBeNull();
  });
});

describe('resolveRival', () => {
  it('sets a driver target, or a ghost 0.2% under the player best when nobody is close', () => {
    const withRival = resolveRival(board({ Me: 100, Rival: 99.7 }), null, new Set(), 50);
    expect(withRival.created).toEqual({ kind: 'driver', driverName: 'Rival', targetTime: 99.7, startTime: 100, pinned: false, setAt: 50 });
    expect(withRival.active).toMatchObject({ kind: 'driver', driverName: 'Rival', status: 'active' });

    const ghost = resolveRival(board({ Me: 100, Alien: 95 }), null, new Set(), 50);
    expect(ghost.created).toMatchObject({ kind: 'ghost', driverName: null, targetTime: 99.8 });
    expect(ghostTargetTime(100)).toBe(99.8);
  });

  it('keeps the rival while it is ahead, and follows its best lap when it improves', () => {
    const kept = resolveRival(board({ Me: 100, Rival: 99.7 }), target({}), new Set(), 50);
    expect(kept).toMatchObject({ beaten: null, retimed: null, created: null, active: { id: 7 } });

    const improved = resolveRival(board({ Me: 100, Rival: 99.2 }), target({}), new Set(), 50);
    expect(improved.retimed).toEqual({ id: 7, targetTime: 99.2 });
    expect(improved.active?.targetTime).toBe(99.2);
  });

  it('ends a beaten rival and picks the next one, never a skipped driver', () => {
    const b = board({ Me: 99.6, Rival: 99.7, Skipped: 99.3, Next: 99.35 });
    const r = resolveRival(b, target({}), new Set(['Skipped']), 50);
    expect(r.beaten).toEqual({ id: 7, beatenTime: 99.6, beatenSessionId: 's-Me', endedAt: 50 });
    expect(r.created?.driverName).toBe('Next');
  });

  it('beats a ghost like a driver', () => {
    const r = resolveRival(board({ Me: 99.7 }), target({ kind: 'ghost', driverName: null, targetTime: 99.8 }), new Set(), 50);
    expect(r.beaten?.beatenTime).toBe(99.7);
    expect(r.created).toMatchObject({ kind: 'ghost', targetTime: ghostTargetTime(99.7) });
  });

  it('does nothing without a player lap on the board', () => {
    expect(resolveRival(board({ Other: 100 }), null, new Set(), 50)).toEqual({ beaten: null, retimed: null, created: null, active: null });
  });
});

describe('pinnedTarget', () => {
  it('pins any driver ahead, and no one behind', () => {
    const b = board({ Me: 100, Alien: 95, Behind: 101 });
    expect(pinnedTarget(b, 'Alien', 5)).toEqual({ kind: 'driver', driverName: 'Alien', targetTime: 95, startTime: 100, pinned: true, setAt: 5 });
    expect(pinnedTarget(b, 'Behind', 5)).toBeNull();
    expect(pinnedTarget(b, 'Me', 5)).toBeNull();
    expect(pinnedTarget(b, 'Nobody', 5)).toBeNull();
  });
});

describe('rivalProgress', () => {
  it('measures the share of the gap closed since the target was set', () => {
    expect(rivalProgress(target({}), 100)).toEqual({ gap: 0.3, progress: 0 });
    expect(rivalProgress(target({}), 99.85)).toEqual({ gap: 0.15, progress: 0.5 });
    expect(rivalProgress(target({}), 99.6).progress).toBe(1);
    expect(rivalProgress(target({}), 100.4).progress).toBe(0);
  });
});

describe('describeRival', () => {
  it('describes the chase: gap, progress, what the best sectors already hold, next rungs and trend', () => {
    const b = board({ Me: 100, Rival: 99.7, Up1: 99.6, Up2: 99.5, Up3: 99.4, Up4: 99.3 });
    const status = describeRival(b, target({}), [], [
      { sessionId: 'a', sessionName: 'P1', timestamp: 1, best: 100.5 },
      { sessionId: 'b', sessionName: 'R1', timestamp: 2, best: 100 },
    ]);
    expect(status).toMatchObject({ gap: 0.3, progress: 0, theoreticalGap: 0, rivalEntry: { driverName: 'Rival' } });
    expect(status.nextUp.map((e) => e.driverName)).toEqual(['Up1', 'Up2', 'Up3']);
    expect(status.trend.map((p) => p.gap)).toEqual([0.8, 0.3]);
    expect(nextRungs(b, 99.35, 5).map((e) => e.driverName)).toEqual(['Up4']);
  });
});
