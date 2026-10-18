import type { LiveLearningReadinessReport } from '../../../../shared/types/liveLearning.js';

export function learningReadinessFixture(): LiveLearningReadinessReport {
  return { state: 'evaluated', historicalCorrectionsEnabled: false, automaticLearning: { enabled: true, active: 0, validating: 0 }, generatedAt: '2026-10-18T16:00:00Z',
    captures: { indexed: 5, verified: 4, unavailable: 1 },
    processing: { current: 3, pending: 1 },
    dataset: { currentExamples: 102, eligible: 100, excluded: 2,
      exclusions: { 'lap-not-clean-representative': 1, 'missing-forecast': 1 } },
    sessions: { training: 3, heldOut: 2 }, sources: [{ state: 'ready', count: 4 }, { state: 'failed', count: 1 }],
    resources: [
      { kind: 'fuel', trainingExamples: 60, heldOutExamples: 40, passingCohorts: 1, rejectedCohorts: 0, insufficientCohorts: 1,
        gates: { 'insufficient-training-sessions': 1 } },
      { kind: 've', trainingExamples: 0, heldOutExamples: 0, passingCohorts: 0, rejectedCohorts: 0, insufficientCohorts: 0, gates: {} },
    ], minimumEvidence: { trainSessions: 3, trainExamples: 30, testSessions: 2, testExamples: 20 } };
}
