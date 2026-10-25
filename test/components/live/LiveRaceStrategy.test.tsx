import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { basisText, LiveRaceStrategy } from '../../../src/components/live/LiveRaceStrategy.js';
import type { LiveRaceStrategies } from '../../../shared/types/liveStrategy.js';

const PLAN: LiveRaceStrategies = { kind: 've', unit: '%', raceMinutes: 20, laps: 14, nextBest: null,
  chosen: { name: 'NO STOP', stops: 0, pitLap: null, loadStart: 62, loadToFinish: null, tyresStart: 'NEW MEDIUM',
    tyresStop: null, treadAtFlag: 0.81, gapSeconds: 0 } };

describe('race strategy source', () => {
  afterEach(cleanup);

  it('names the learned source and the limiting corner', () => {
    render(<LiveRaceStrategy strategies={{ ...PLAN, chosen: { ...PLAN.chosen, treadCorner: 'RL' },
      basis: { use: 'event', wear: 'learned', sessions: 4, races: 0 } }} />);
    expect(screen.getByTestId('live-race-strategy')).toHaveTextContent('WEAR LEARNED (4)');
    expect(screen.getByTestId('live-race-strategy')).toHaveTextContent('~81% RL');
  });

  it('says when the use or the wear comes from earlier races or the game, and nothing once the event measured both', () => {
    render(<LiveRaceStrategy strategies={{ ...PLAN, basis: { use: 'history', wear: 'history', races: 3 } }} />);
    expect(screen.getByTestId('live-race-strategy')).toHaveTextContent('20 MIN · ~14 LAPS · FROM YOUR LAST 3 RACES');
    expect(basisText({ use: 'event', wear: 'history', races: 1 })).toBe('WEAR FROM YOUR LAST RACE');
    expect(basisText({ use: 'game', wear: 'history', races: 2 })).toBe('WEAR FROM YOUR LAST 2 RACES · GAME ESTIMATE');
    expect(basisText({ use: 'history', wear: null, races: 2 })).toBe('USE FROM YOUR LAST 2 RACES');
    expect(basisText({ use: 'game', wear: null, races: 0 })).toBe('GAME ESTIMATE');
    expect(basisText({ use: 'event', wear: 'event', races: 0 })).toBeNull();
    expect(basisText(undefined)).toBeNull();
  });
});
