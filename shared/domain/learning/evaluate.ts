export interface EvaluationExample {
  sessionId: string;
  startedAt: number;
  cohort: string;
  resourceKind: 'fuel' | 've';
  predicted: number;
  actual: number;
}

export interface EvaluationMetrics {
  count: number;
  bias: number;
  mae: number;
  p95AbsoluteError: number;
  underpredictionCount: number;
}

export interface CohortEvaluation {
  cohort: string;
  resourceKind: EvaluationExample['resourceKind'];
  trainCount: number;
  hasCompatibleTrainingEvidence: boolean;
  test: EvaluationMetrics | null;
}

export interface LearningBaselineEvaluation {
  trainSessionIds: string[];
  testSessionIds: string[];
  trainCount: number;
  testCount: number;
  excludedCount: number;
  byResource: Record<EvaluationExample['resourceKind'], EvaluationMetrics>;
  cohorts: CohortEvaluation[];
}

function isValidExample(value: EvaluationExample): boolean {
  return typeof value.sessionId === 'string' && value.sessionId.length > 0
    && Number.isFinite(value.startedAt)
    && typeof value.cohort === 'string' && value.cohort.length > 0
    && (value.resourceKind === 'fuel' || value.resourceKind === 've')
    && Number.isFinite(value.predicted) && value.predicted > 0
    && Number.isFinite(value.actual) && value.actual > 0;
}

function metrics(examples: EvaluationExample[]): EvaluationMetrics {
  const errors = examples.map(({ predicted, actual }) => predicted - actual);
  const absoluteErrors = errors.map(Math.abs).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(absoluteErrors.length * 0.95) - 1);
  return {
    count: errors.length,
    bias: errors.reduce((sum, error) => sum + error, 0) / errors.length,
    mae: absoluteErrors.reduce((sum, error) => sum + error, 0) / errors.length,
    p95AbsoluteError: absoluteErrors[p95Index] ?? 0,
    underpredictionCount: errors.filter((error) => error < 0).length,
  };
}

export function evaluateLearningBaseline(
  examples: EvaluationExample[],
  holdoutFraction = 0.25,
): LearningBaselineEvaluation {
  if (!Number.isFinite(holdoutFraction) || holdoutFraction <= 0 || holdoutFraction >= 1) {
    throw new RangeError('holdoutFraction must be finite and between 0 and 1');
  }

  const valid = examples.filter(isValidExample);
  const sessions = new Map<string, number>();
  for (const example of valid) {
    const existing = sessions.get(example.sessionId);
    if (existing === undefined || example.startedAt < existing) sessions.set(example.sessionId, example.startedAt);
  }
  const ordered = [...sessions.entries()].sort(([aId, aTime], [bId, bTime]) => aTime - bTime || aId.localeCompare(bId));
  const targetTrainCount = Math.max(1, Math.min(ordered.length - 1, Math.round(ordered.length * (1 - holdoutFraction))));
  let split = ordered.length;
  if (ordered.length > 1) {
    const candidates: number[] = [];
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index - 1]?.[1] !== ordered[index]?.[1]) candidates.push(index);
    }
    split = candidates.reduce((best, candidate) =>
      Math.abs(candidate - targetTrainCount) < Math.abs(best - targetTrainCount) ? candidate : best,
    candidates[0] ?? ordered.length);
  }
  const trainSessionIds = ordered.slice(0, split).map(([id]) => id);
  const testSessionIds = ordered.slice(split).map(([id]) => id);
  const trainIds = new Set(trainSessionIds);
  const testIds = new Set(testSessionIds);
  const train = valid.filter(({ sessionId }) => trainIds.has(sessionId));
  const test = valid.filter(({ sessionId }) => testIds.has(sessionId));

  const cohortKeys = new Set(valid.map(({ cohort, resourceKind }) => `${resourceKind}\u0000${cohort}`));
  const cohorts = [...cohortKeys].map((key) => {
    const separator = key.indexOf('\u0000');
    const resourceKind = key.slice(0, separator) as EvaluationExample['resourceKind'];
    const cohort = key.slice(separator + 1);
    const cohortTrain = train.filter((example) => example.cohort === cohort && example.resourceKind === resourceKind);
    const cohortTest = test.filter((example) => example.cohort === cohort && example.resourceKind === resourceKind);
    return {
      cohort,
      resourceKind,
      trainCount: cohortTrain.length,
      hasCompatibleTrainingEvidence: cohortTrain.length > 0,
      test: cohortTest.length > 0 ? metrics(cohortTest) : null,
    };
  }).sort((a, b) => a.resourceKind.localeCompare(b.resourceKind) || a.cohort.localeCompare(b.cohort));

  return {
    trainSessionIds,
    testSessionIds,
    trainCount: train.length,
    testCount: test.length,
    excludedCount: examples.length - valid.length,
    byResource: {
      fuel: test.some((example) => example.resourceKind === 'fuel') ? metrics(test.filter((example) => example.resourceKind === 'fuel')) : emptyMetrics(),
      ve: test.some((example) => example.resourceKind === 've') ? metrics(test.filter((example) => example.resourceKind === 've')) : emptyMetrics(),
    },
    cohorts,
  };
}

function emptyMetrics(): EvaluationMetrics {
  return { count: 0, bias: 0, mae: 0, p95AbsoluteError: 0, underpredictionCount: 0 };
}
