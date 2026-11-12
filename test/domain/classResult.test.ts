import { describe, it, expect } from 'vitest';
import { classResult } from '../../shared/domain/classResult.js';

describe('classResult', () => {
  it('gives the class finish, grid and gain of a multi-class race', () => {
    expect(classResult({ position: 19, gridPosition: 37, positionGain: 18, classPosition: 4, classGridPosition: 9, classPositionGain: 5 }))
      .toEqual({ position: 4, gridPosition: 9, positionGain: 5 });
  });

  it('does not borrow the overall grid or gain when the class grid is unknown', () => {
    expect(classResult({ position: 19, gridPosition: 37, positionGain: 18, classPosition: 4 }))
      .toEqual({ position: 4, gridPosition: null, positionGain: null });
  });

  it('falls back to the overall result when the source has no class position', () => {
    expect(classResult({ position: 3, gridPosition: 5, positionGain: 2, classPosition: 0 }))
      .toEqual({ position: 3, gridPosition: 5, positionGain: 2 });
    expect(classResult({ position: 3 })).toEqual({ position: 3, gridPosition: null, positionGain: null });
  });
});
