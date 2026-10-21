import {
  evaluateLearningBaseline, evaluationMetrics, isValidEvaluationExample,
  type EvaluationExample, type EvaluationMetrics,
} from './evaluate.js';

/**
 * Versioned policy shared by screening and prospective acceptance; screening alone never activates. Version 2 halved
 * the lap totals (sessions unchanged): 20 to 60 minute races give about 6 to 20 clean laps each.
 */
export const CALIBRATION_POLICY = Object.freeze({
  version: 2,
  minTrainSessions: 3,
  minTrainExamples: 15,
  minTestSessions: 2,
  minTestExamples: 10,
  shrinkageSessions: 3,
  maxAdjustmentFraction: 0.1,
  minMaeImprovementFraction: 0.05,
});

export type CalibrationGate = 'insufficient-training-sessions' | 'insufficient-training-examples'
  | 'insufficient-test-sessions' | 'insufficient-test-examples' | 'mae-not-improved'
  | 'p95-regressed' | 'underprediction-count-regressed' | 'underprediction-amount-regressed';

export interface CalibrationMetrics extends EvaluationMetrics {
  /** Mean shortfall across all observations, including zero for overpredictions. */
  meanUnderprediction: number;
}

export interface CalibrationCohort {
  cohort: string;
  resourceKind: EvaluationExample['resourceKind'];
  trainSessions: number;
  trainCount: number;
  testSessions: number;
  testCount: number;
  model: { medianSessionResidual: number; shrinkageWeight: number; adjustment: number } | null;
  baseline: CalibrationMetrics | null;
  candidate: CalibrationMetrics | null;
  cappedTestPredictions: number;
  maeImprovementFraction: number | null;
  state: 'insufficient-evidence' | 'rejected' | 'passes-offline-gates';
  gates: CalibrationGate[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

export function calibrationMetrics(examples: EvaluationExample[]): CalibrationMetrics {
  return { ...evaluationMetrics(examples), meanUnderprediction: examples.reduce((sum, example) =>
    sum + Math.max(0, example.actual - example.predicted), 0) / examples.length };
}

/** Shared screening, fresh-session acceptance and ongoing withdrawal criteria. */
export function calibrationErrorGates(baseline: CalibrationMetrics, candidate: CalibrationMetrics): CalibrationGate[] {
  const gates: CalibrationGate[] = [];
  const tolerance = Math.max(baseline.mae, candidate.mae, Number.MIN_VALUE) * 1e-9;
  if (baseline.mae <= 0 || baseline.mae - candidate.mae + tolerance
    < baseline.mae * CALIBRATION_POLICY.minMaeImprovementFraction) gates.push('mae-not-improved');
  if (candidate.p95AbsoluteError > baseline.p95AbsoluteError + tolerance) gates.push('p95-regressed');
  if (candidate.underpredictionCount > baseline.underpredictionCount) gates.push('underprediction-count-regressed');
  if (candidate.meanUnderprediction > baseline.meanUnderprediction + tolerance) gates.push('underprediction-amount-regressed');
  return gates;
}

function evaluateCohort(cohort: string, resourceKind: EvaluationExample['resourceKind'],
  train: EvaluationExample[], test: EvaluationExample[]): CalibrationCohort {
  const sessionResiduals = new Map<string, number[]>();
  for (const example of train) {
    const values = sessionResiduals.get(example.sessionId) ?? [];
    values.push(example.actual - example.predicted);
    sessionResiduals.set(example.sessionId, values);
  }
  const trainSessions = sessionResiduals.size;
  const testSessions = new Set(test.map(example => example.sessionId)).size;
  const gates: CalibrationGate[] = [];
  if (trainSessions < CALIBRATION_POLICY.minTrainSessions) gates.push('insufficient-training-sessions');
  if (train.length < CALIBRATION_POLICY.minTrainExamples) gates.push('insufficient-training-examples');
  if (testSessions < CALIBRATION_POLICY.minTestSessions) gates.push('insufficient-test-sessions');
  if (test.length < CALIBRATION_POLICY.minTestExamples) gates.push('insufficient-test-examples');
  const result: CalibrationCohort = {
    cohort, resourceKind, trainSessions, trainCount: train.length, testSessions, testCount: test.length,
    model: null, baseline: test.length ? calibrationMetrics(test) : null, candidate: null,
    cappedTestPredictions: 0, maeImprovementFraction: null, state: 'insufficient-evidence', gates,
  };
  // A long single race cannot substitute for independent sessions; test data never enters fitting.
  if (trainSessions < CALIBRATION_POLICY.minTrainSessions || train.length < CALIBRATION_POLICY.minTrainExamples) return result;
  const medianSessionResidual = median([...sessionResiduals.values()].map(median));
  const shrinkageWeight = trainSessions / (trainSessions + CALIBRATION_POLICY.shrinkageSessions);
  const adjustment = medianSessionResidual * shrinkageWeight;
  result.model = { medianSessionResidual, shrinkageWeight, adjustment };
  if (!test.length) return result;
  const corrected = test.map(example => {
    const bound = CALIBRATION_POLICY.maxAdjustmentFraction * example.predicted;
    const bounded = Math.max(-bound, Math.min(bound, adjustment));
    if (bounded !== adjustment) result.cappedTestPredictions++;
    return { ...example, predicted: example.predicted + bounded };
  });
  const baseline = result.baseline!;
  const candidate = calibrationMetrics(corrected);
  result.candidate = candidate;
  result.maeImprovementFraction = baseline.mae > 0 ? (baseline.mae - candidate.mae) / baseline.mae : null;
  if (gates.length) return result;
  // Relative numerical tolerance only; fuel and VE stay in their own units and cohorts.
  gates.push(...calibrationErrorGates(baseline, candidate));
  result.state = gates.length ? 'rejected' : 'passes-offline-gates';
  return result;
}

/** One chronological split shared with baseline evaluation, exact cohorts, no persistence or activation. */
export function evaluateLearningCalibration(examples: EvaluationExample[], holdoutFraction = 0.25) {
  const baseline = evaluateLearningBaseline(examples, holdoutFraction);
  const trainIds = new Set(baseline.trainSessionIds);
  const testIds = new Set(baseline.testSessionIds);
  const groups = new Map<string, { cohort: string; resourceKind: EvaluationExample['resourceKind'];
    train: EvaluationExample[]; test: EvaluationExample[] }>();
  for (const example of examples.filter(isValidEvaluationExample)) {
    const key = JSON.stringify([example.resourceKind, example.cohort]);
    const group = groups.get(key) ?? { cohort: example.cohort, resourceKind: example.resourceKind, train: [], test: [] };
    if (trainIds.has(example.sessionId)) group.train.push(example);
    else if (testIds.has(example.sessionId)) group.test.push(example);
    groups.set(key, group);
  }
  const cohorts = [...groups.values()].map(group => evaluateCohort(group.cohort, group.resourceKind, group.train, group.test))
    .sort((a, b) => a.resourceKind.localeCompare(b.resourceKind) || a.cohort.localeCompare(b.cohort));
  return { baseline, calibration: {
    algorithm: 'session-median-residual-shrinkage' as const,
    policy: CALIBRATION_POLICY,
    activationEnabled: false as const,
    evaluationScope: 'offline-candidate-screening' as const,
    cohorts,
    summary: {
      evaluated: cohorts.filter(cohort => cohort.state !== 'insufficient-evidence').length,
      passesOfflineGates: cohorts.filter(cohort => cohort.state === 'passes-offline-gates').length,
      rejected: cohorts.filter(cohort => cohort.state === 'rejected').length,
      insufficientEvidence: cohorts.filter(cohort => cohort.state === 'insufficient-evidence').length,
    },
  } };
}
