import { describe, expect, it } from 'vitest';
import { evaluateLearningBaseline, type EvaluationExample } from '../../../shared/domain/learning/evaluate.js';

function example(sessionId: string, startedAt: number, predicted: number, actual: number, cohort = 'layout|car|patch|dry|medium'): EvaluationExample {
  return { sessionId, startedAt, cohort, resourceKind: 'fuel', predicted, actual };
}

describe('evaluateLearningBaseline', () => {
  it('holds out whole sessions in chronological order', () => {
    const report = evaluateLearningBaseline([
      example('s3', 300, 10, 9), example('s1', 100, 10, 10),
      example('s2', 200, 10, 11), example('s1', 100, 10, 10),
    ], 1 / 3);
    expect(report.trainSessionIds).toEqual(['s1', 's2']);
    expect(report.testSessionIds).toEqual(['s3']);
    expect(report.trainCount).toBe(3);
    expect(report.testCount).toBe(1);
  });

  it('keeps sessions with tied start timestamps on one side', () => {
    const report = evaluateLearningBaseline([
      example('a', 100, 1, 1), example('b', 100, 1, 1),
      example('c', 200, 1, 1), example('d', 300, 1, 1),
    ], 0.5);
    expect(report.trainSessionIds).toEqual(['a', 'b']);
    expect(report.testSessionIds).toEqual(['c', 'd']);
  });

  it('reports baseline error metrics including an outlier p95', () => {
    const report = evaluateLearningBaseline([
      example('a', 1, 10, 10), example('b', 2, 10, 10),
      example('c', 3, 9, 10), example('d', 4, 10, 10),
      example('e', 5, 10, 10), example('f', 6, 10, 10),
      example('g', 7, 10, 10), example('h', 8, 10, 10),
      example('i', 9, 9, 10), example('j', 10, 20, 10),
    ], 0.2);
    expect(report.byResource.fuel).toEqual({ count: 2, bias: 4.5, mae: 5.5, p95AbsoluteError: 10, underpredictionCount: 1 });
  });

  it('marks a cohort with no exact training evidence as incompatible', () => {
    const report = evaluateLearningBaseline([
      example('a', 1, 1, 1, 'known'), example('b', 2, 1, 1, 'known'),
      example('c', 3, 1, 1, 'sparse'), example('d', 4, 1, 1, 'sparse'),
    ], 0.5);
    expect(report.cohorts.find(({ cohort }) => cohort === 'sparse')).toMatchObject({
      trainCount: 0,
      hasCompatibleTrainingEvidence: false,
      test: { count: 2 },
    });
  });

  it('excludes invalid examples and rejects invalid holdout fractions', () => {
    const report = evaluateLearningBaseline([
      example('a', 1, 1, 1), example('b', 2, 1, 1),
      example('bad-time', Number.NaN, 1, 1), example('bad-amount', 3, 0, 1),
    ]);
    expect(report.excludedCount).toBe(2);
    expect(() => evaluateLearningBaseline([], 0)).toThrow(RangeError);
    expect(() => evaluateLearningBaseline([], Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('keeps fuel and virtual energy metrics in separate units', () => {
    const examples: EvaluationExample[] = [
      { ...example('a', 1, 1, 1), resourceKind: 'fuel' },
      { ...example('b', 2, 1, 1), resourceKind: 'fuel' },
      { ...example('c', 3, 90, 80, 'energy'), resourceKind: 've' },
      { ...example('d', 4, 100, 80, 'energy'), resourceKind: 've' },
    ];
    const report = evaluateLearningBaseline(examples, 0.5);
    expect(report.byResource.fuel.mae).toBe(0);
    expect(report.byResource.ve.mae).toBe(15);
  });
});
