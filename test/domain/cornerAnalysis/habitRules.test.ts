import { describe, expect, it } from 'vitest';
import { actionDone, habitDetail, withAction } from '../../../shared/domain/cornerAnalysis/habitRules.js';
import type { CornerHabit } from '../../../shared/types/corners/cornerAnalysis.js';
import type { TurnUsual } from '../../../shared/domain/cornerAnalysis/turnUsual.js';

describe('actionDone', () => {
  it.each([
    ['lift', 40, 20, 'braked 20 points lighter'],
    ['brakeLater', 11, 4, 'braked 7 m later'],
    ['brakeShorter', 0.5, 0.2, 'came off the brake 0.3 s sooner'],
    ['turnInEarlier', 12, 4, 'turned in 8 m earlier'],
    ['reachInside', 1.6, 1, 'got a little closer to the inside at the apex'],
  ] as const)('says what a %s try did', (type, before, after, did) => {
    expect(actionDone(type, before, after)?.did).toBe(did);
  });

  it('reads no try when the gap moved less than the action\'s step', () => {
    expect(actionDone('brakeLater', 11, 9)).toBeNull();
    expect(actionDone('reachInside', 1, 1.5)).toBeNull();
  });
});

describe('habitDetail', () => {
  const own = { minKmh: 90, exitKmh: 140 } as TurnUsual;
  const target = { minKmh: 89, exitKmh: 145 } as TurnUsual;

  it('never says "no action is measured" under a brake point headline, which is its own action', () => {
    expect(habitDetail('brakeEarly', own, target, 'exitOnly', null)).toBe('Apex 90 km/h, target 89 km/h');
    expect(habitDetail('brakeEarly', own, target, 'tighterArc', null)).toBe('Apex 90 km/h, target 89 km/h · tighter arc');
    expect(habitDetail('exitSpeed', own, target, 'exitOnly', null))
      .toBe('Exit 140 km/h, target 145 km/h · apex 90 km/h, target 89 km/h · no action is measured for a slower exit alone');
  });
});

describe('withAction', () => {
  it('restores the replaced action\'s cause and drops the new action\'s cause in canonical order', () => {
    const brakeLater = { type: 'brakeLater' as const, gap: 15, line: 'Brake 15 m later' };
    const brakeShorter = { type: 'brakeShorter' as const, gap: 0.4, line: 'Come off the brake 0.4 s sooner' };
    const reachInside = { type: 'reachInside' as const, gap: 1, line: 'Get closer to the inside at the apex' };
    const habit = {
      half: 'in',
      action: brakeLater,
      otherActions: [brakeShorter, reachInside],
      causes: [
        { type: 'brakeLonger', gap: 0.4, line: 'braking 0.4 s longer' },
        { type: 'coast', gap: 0.3, line: '0.3 s more coasting' },
      ],
    } as CornerHabit;

    // Rotating from brakeLater -> reachInside restores brakePoint before brakeLonger.
    const toInside = withAction(habit, reachInside);
    expect(toInside.causes.map(c => c.line)).toEqual(['braking 15 m earlier', 'braking 0.4 s longer', '0.3 s more coasting']);

    // Rotating from brakeLater -> brakeShorter drops brakeLonger and restores brakePoint.
    const toShorter = withAction(habit, brakeShorter);
    expect(toShorter.causes.map(c => c.line)).toEqual(['braking 15 m earlier', '0.3 s more coasting']);
  });
});
