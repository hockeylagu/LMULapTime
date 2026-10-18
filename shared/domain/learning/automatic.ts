import { CALIBRATION_POLICY, calibrationErrorGates, calibrationMetrics, evaluateLearningCalibration } from './calibration.js';
import type { EvaluationExample } from './evaluate.js';

/** Persisted fixed candidates: screening data may never become prospective acceptance data. */
export interface AutomaticCorrection {
  cohort: string;
  resourceKind: 'fuel' | 've';
  adjustment: number;
  screenedThrough: number;
  createdAt: number;
  supportSessions: string[];
  supportSignature: string;
  state: 'validating' | 'active';
  validationSessions: number;
  validationExamples: number;
}
export interface AutomaticLearningState {
  version: 1;
  models: AutomaticCorrection[];
}

export function boundedCorrection(predicted: number, adjustment: number): number {
  const bound = predicted * CALIBRATION_POLICY.maxAdjustmentFraction;
  return predicted + Math.max(-bound, Math.min(bound, adjustment));
}

/** Same error gates as offline screening, applied to a fixed model on genuinely later sessions. */
function improves(examples: EvaluationExample[], adjustment: number): boolean {
  const baseline = calibrationMetrics(examples);
  const candidate = calibrationMetrics(examples.map(row => ({ ...row, predicted: boundedCorrection(row.predicted, adjustment) })));
  return calibrationErrorGates(baseline, candidate).length === 0;
}

/** Called off track. A support signature change withdraws the model, as does prospective regression. */
export function advanceAutomaticLearning(examples: EvaluationExample[], previous: AutomaticLearningState,
  signature: (rows: EvaluationExample[]) => string, now: number): AutomaticLearningState {
  const models: AutomaticCorrection[] = [];
  const retained = new Set<string>();
  for (const model of previous.version === 1 ? previous.models : []) {
    const group = examples.filter(row => row.cohort === model.cohort && row.resourceKind === model.resourceKind);
    const support = group.filter(row => model.supportSessions.includes(row.sessionId));
    if (!Number.isFinite(model.adjustment) || !Number.isFinite(model.createdAt) || signature(support) !== model.supportSignature) continue;
    const future = group.filter(row => row.startedAt > Math.max(model.screenedThrough, model.createdAt)
      && !model.supportSessions.includes(row.sessionId));
    const validationSessions = new Set(future.map(row => row.sessionId)).size;
    const enough = validationSessions >= CALIBRATION_POLICY.minTestSessions && future.length >= CALIBRATION_POLICY.minTestExamples;
    // Once active, loss of acceptance evidence also withdraws a correction.
    if ((model.state === 'active' && !enough) || (enough && !improves(future, model.adjustment))) continue;
    models.push({ ...model, state: enough ? 'active' : 'validating', validationSessions, validationExamples: future.length });
    retained.add(JSON.stringify([model.resourceKind, model.cohort]));
  }
  const screened = evaluateLearningCalibration(examples).calibration.cohorts;
  for (const cohort of screened) {
    if (cohort.state !== 'passes-offline-gates' || !cohort.model || retained.has(JSON.stringify([cohort.resourceKind, cohort.cohort]))) continue;
    const support = examples.filter(row => row.cohort === cohort.cohort && row.resourceKind === cohort.resourceKind);
    models.push({ cohort: cohort.cohort, resourceKind: cohort.resourceKind, adjustment: cohort.model.adjustment,
      createdAt: now, screenedThrough: support.reduce((latest, row) => Math.max(latest, row.startedAt), -Infinity), supportSessions: [...new Set(support.map(row => row.sessionId))],
      supportSignature: signature(support), state: 'validating', validationSessions: 0, validationExamples: 0 });
  }
  return { version: 1, models };
}
