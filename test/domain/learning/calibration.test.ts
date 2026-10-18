import { describe, expect, it } from 'vitest';
import { CALIBRATION_POLICY, evaluateLearningCalibration } from '../../../shared/domain/learning/calibration.js';
import type { EvaluationExample } from '../../../shared/domain/learning/evaluate.js';

function dataset(trainActual = 12, testActual = 12, kind: 'fuel' | 've' = 'fuel', cohort = 'exact'): EvaluationExample[] {
  return Array.from({ length: 5 }, (_, session) => Array.from({ length: 10 }, () => ({
    sessionId: `s${session}`, startedAt: session + 1, cohort, resourceKind: kind,
    predicted: 10, actual: session < 3 ? trainActual : testActual,
  }))).flat();
}

function evaluate(examples = dataset()) {
  return evaluateLearningCalibration(examples, 0.4).calibration.cohorts[0];
}

describe('offline learning calibration', () => {
  it('fits only earlier whole sessions and screens a bounded candidate without activation', () => {
    const report = evaluateLearningCalibration(dataset(), 0.4);
    expect(report.baseline.trainSessionIds).toEqual(['s0', 's1', 's2']);
    expect(report.baseline.testSessionIds).toEqual(['s3', 's4']);
    expect(report.calibration.activationEnabled).toBe(false);
    expect(report.calibration.policy).toEqual(CALIBRATION_POLICY);
    expect(report.calibration.summary).toEqual({ evaluated: 1, passesOfflineGates: 1, rejected: 0, insufficientEvidence: 0 });
    expect(report.calibration.cohorts[0]).toMatchObject({
      model: { medianSessionResidual: 2, shrinkageWeight: 0.5, adjustment: 1 },
      baseline: { mae: 2, meanUnderprediction: 2 }, candidate: { mae: 1, meanUnderprediction: 1 },
      trainSessions: 3, testSessions: 2, state: 'passes-offline-gates', gates: [], maeImprovementFraction: 0.5,
    });
  });

  it('cannot change fitted parameters by changing future outcomes', () => {
    const original = evaluate();
    const shifted = evaluate(dataset(12, 30));
    expect(shifted.model).toEqual(original.model);
    expect(shifted.candidate).not.toEqual(original.candidate);
    expect(evaluateLearningCalibration(dataset(), 0.4).baseline.testCount).toBe(20);
  });

  it('weights session medians equally instead of letting a long race dominate', () => {
    const examples = dataset();
    examples.push(...Array.from({ length: 1000 }, () => ({ ...examples[0], actual: 80 })));
    expect(evaluate(examples).model).toMatchObject({ medianSessionResidual: 2, adjustment: 1 });
  });

  it('bounds both positive and negative adjustments by each original forecast', () => {
    const positive = evaluate(dataset(100, 100));
    const negative = evaluate(dataset(1, 1));
    expect(positive.cappedTestPredictions).toBe(20);
    expect(positive.candidate?.bias).toBe(-89);
    expect(negative.cappedTestPredictions).toBe(20);
    expect(negative.candidate?.bias).toBe(8);
    expect(negative.candidate?.meanUnderprediction).toBe(0);
  });

  it('requires independent training and test sessions as well as enough laps', () => {
    const oneTrainSession = dataset().map(row => row.startedAt <= 3 ? { ...row, sessionId: 'one', startedAt: 1 } : row);
    const sparse = evaluate(oneTrainSession);
    expect(sparse.state).toBe('insufficient-evidence');
    expect(sparse.model).toBeNull();
    expect(sparse.gates).toContain('insufficient-training-sessions');
    const oneTestSession = dataset().map(row => row.startedAt >= 4 ? { ...row, sessionId: 'last', startedAt: 5 } : row);
    const result = evaluateLearningCalibration(oneTestSession, 0.25).calibration.cohorts[0];
    expect(result.gates).toContain('insufficient-test-sessions');
    expect(result.state).toBe('insufficient-evidence');
    const fewLaps = evaluate(dataset().filter((_, index) => index % 10 === 0));
    expect(fewLaps.gates).toEqual(expect.arrayContaining(['insufficient-training-examples', 'insufficient-test-examples']));
  });

  it('keeps a new exact cohort separate even when other cohorts have ample evidence', () => {
    const examples = dataset().map(row => row.startedAt >= 4 ? { ...row, cohort: 'new-patch' } : row);
    const cohorts = evaluateLearningCalibration(examples, 0.4).calibration.cohorts;
    expect(cohorts).toHaveLength(2);
    expect(cohorts.find(row => row.cohort === 'new-patch')).toMatchObject({ trainCount: 0, model: null, state: 'insufficient-evidence' });
    expect(cohorts.find(row => row.cohort === 'exact')).toMatchObject({ testCount: 0, candidate: null, state: 'insufficient-evidence' });
  });

  it('never mixes fuel and VE even with the same cohort identifier', () => {
    const report = evaluateLearningCalibration([...dataset(), ...dataset(8, 8, 've')], 0.4);
    expect(report.calibration.cohorts.map(row => [row.resourceKind, row.model?.adjustment])).toEqual([['fuel', 1], ['ve', -1]]);
    expect(report.baseline.byResource.fuel.count).toBe(20);
    expect(report.baseline.byResource.ve.count).toBe(20);
  });

  it('rejects worsening error and cannot promote an already perfect baseline', () => {
    const report = evaluate(dataset(12, 10));
    expect(report.state).toBe('rejected');
    expect(report.maeImprovementFraction).toBeNull();
    expect(report.gates).toEqual(expect.arrayContaining(['mae-not-improved', 'p95-regressed']));
    expect(evaluate(dataset(10, 10)).gates).toContain('mae-not-improved');
    expect(evaluate(dataset(10.1, 12)).gates).toContain('mae-not-improved');
  });

  it('rejects increased shortfall even if average absolute error improves', () => {
    const examples = dataset(8, 8);
    examples[48].actual = 13;
    examples[49].actual = 13;
    const report = evaluate(examples);
    expect(report.candidate!.mae).toBeLessThan(report.baseline!.mae);
    expect(report.gates).toEqual(expect.arrayContaining(['p95-regressed', 'underprediction-amount-regressed']));
    expect(report.state).toBe('rejected');
  });

  it('rejects newly introduced underpredictions', () => {
    const report = evaluate(dataset(8, 9.5));
    expect(report.gates).toContain('underprediction-count-regressed');
    expect(report.gates).toContain('underprediction-amount-regressed');
  });

  it('does not split timestamp ties or fabricate empty-dataset readiness', () => {
    const tied = evaluate(dataset().map(row => ({ ...row, startedAt: 1 })));
    expect(tied.testCount).toBe(0);
    expect(tied.state).toBe('insufficient-evidence');
    const empty = evaluateLearningCalibration([]);
    expect(empty.calibration.cohorts).toEqual([]);
    expect(empty.calibration.summary.passesOfflineGates).toBe(0);
  });

  it('is deterministic under reordered input, ignores invalid amounts and does not mutate inputs', () => {
    const examples = dataset();
    const original = structuredClone(examples);
    const invalid = { ...examples[0], actual: Number.NaN };
    const report = evaluateLearningCalibration([...examples, invalid], 0.4);
    expect(report.baseline.excludedCount).toBe(1);
    expect(report.calibration).toEqual(evaluateLearningCalibration([...examples].reverse(), 0.4).calibration);
    expect(examples).toEqual(original);
    expect(() => evaluateLearningCalibration(examples, 1)).toThrow(RangeError);
  });
});
