import { describe, expect, it } from 'vitest';
import { advanceAutomaticLearning, boundedCorrection, type AutomaticLearningState } from '../../../shared/domain/learning/automatic.js';
import type { EvaluationExample } from '../../../shared/domain/learning/evaluate.js';
import { learningCohort } from '../../../shared/domain/learning/cohort.js';

const empty: AutomaticLearningState = { version: 1, models: [] };
const signature = (rows: EvaluationExample[]) => JSON.stringify(rows);
function sessions(first: number, count: number, actual = 12, cohort = 'exact', resourceKind: 'fuel' | 've' = 'fuel'): EvaluationExample[] {
  return Array.from({ length: count }, (_, offset) => Array.from({ length: 10 }, () => ({
    sessionId: `s${first + offset}`, startedAt: first + offset, cohort, resourceKind, predicted: 10, actual,
  }))).flat();
}

describe('automatic historical corrections', () => {
  it('persists a fixed screened candidate and requires genuinely fresh independent sessions before promotion', () => {
    const screened = sessions(1, 8);
    const staged = advanceAutomaticLearning(screened, empty, signature, 8);
    expect(staged.models).toHaveLength(1);
    expect(staged.models[0]).toMatchObject({ state: 'validating', screenedThrough: 8, validationExamples: 0 });
    expect(advanceAutomaticLearning(screened, staged, signature, 8)).toEqual(staged);
    const one = advanceAutomaticLearning([...screened, ...sessions(9, 1)], staged, signature, 8);
    expect(one.models[0]).toMatchObject({ state: 'validating', validationSessions: 1 });
    const active = advanceAutomaticLearning([...screened, ...sessions(9, 2)], JSON.parse(JSON.stringify(one)) as AutomaticLearningState, signature, 8);
    expect(active.models[0]).toMatchObject({ state: 'active', validationSessions: 2, validationExamples: 20 });
    expect(active.models[0].adjustment).toBe(staged.models[0].adjustment);
  });

  it('withdraws on later regression or changed canonical support instead of retaining the old active correction', () => {
    const screened = sessions(1, 8);
    const staged = advanceAutomaticLearning(screened, empty, signature, 8);
    const data = [...screened, ...sessions(9, 2)];
    const active = advanceAutomaticLearning(data, staged, signature, 8);
    expect(advanceAutomaticLearning([...data, ...sessions(11, 10, 1)], active, signature, 8).models
      .some(model => model.state === 'active')).toBe(false);
    expect(advanceAutomaticLearning(data.slice(1), active, signature, 8).models.some(model => model.state === 'active')).toBe(false);
    expect(advanceAutomaticLearning(screened, active, signature, 8).models.some(model => model.state === 'active')).toBe(false);
  });

  it('does not treat simultaneous, incompatible, sparse or reused screening sessions as fresh acceptance', () => {
    const screened = sessions(1, 8);
    const staged = advanceAutomaticLearning(screened, empty, signature, 8);
    const unrelated = [...sessions(9, 2, 12, 'other'), ...sessions(9, 2, 12, 'exact', 've')];
    const sameTime = sessions(9, 2).map(row => ({ ...row, startedAt: 8 }));
    const result = advanceAutomaticLearning([...screened, ...unrelated, ...sameTime], staged, signature, 8);
    expect(result.models.every(model => model.state === 'validating')).toBe(true);
    expect(result.models.find(model => model.cohort === 'exact' && model.resourceKind === 'fuel')?.validationSessions).toBe(0);
    expect(advanceAutomaticLearning([...screened, ...sessions(9, 2).slice(0, 11)], staged, signature, 8).models[0].state).toBe('validating');
  });

  it('bounds each correction and requires every compatibility field', () => {
    expect(boundedCorrection(2, 500)).toBe(2.2);
    expect(boundedCorrection(2, -500)).toBe(1.8);
    const identity = { layoutKey: 'monza_gp', vehicleModel: 'Ferrari 296 GT3', driverName: 'Driver', gameVersion: '1',
      condition: 'dry', compound: 'Medium', modelVersion: 3, predictionSource: 'game' as const };
    expect(learningCohort(identity)).not.toBeNull();
    expect(learningCohort({ ...identity, gameVersion: null })).toBeNull();
    expect(learningCohort({ ...identity, driverName: '' })).toBeNull();
    expect(learningCohort({ ...identity, compound: 'Soft' })).not.toBe(learningCohort(identity));
  });

  it('does not promote on backfilled sessions that happened before the candidate was created', () => {
    const screened = sessions(1, 8);
    const staged = advanceAutomaticLearning(screened, empty, signature, 100);
    const result = advanceAutomaticLearning([...screened, ...sessions(9, 2)], staged, signature, 101);
    expect(result.models[0]).toMatchObject({ state: 'validating', validationSessions: 0, createdAt: 100 });
  });
});
