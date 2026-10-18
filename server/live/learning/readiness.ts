import type { Database } from 'better-sqlite3';
import type { LiveLearningReadinessReport } from '../../../shared/types/liveLearning.js';
import { evaluateLiveLearning } from './report.js';

/** Compact UI projection of the same canonical evaluation as the CLI. Run in a read-only worker. */
export function learningReadiness(db: Database): LiveLearningReadinessReport {
  const report = evaluateLiveLearning(db);
  const policy = report.calibration.policy;
  return {
    state: 'evaluated', generatedAt: report.generatedAt, historicalCorrectionsEnabled: report.historicalCorrectionsEnabled,
    automaticLearning: report.automaticLearning,
    captures: report.captures, processing: report.processing, dataset: report.dataset,
    sessions: { training: report.evaluation.trainSessionIds.length, heldOut: report.evaluation.testSessionIds.length },
    sources: report.sources,
    resources: (['fuel', 've'] as const).map(kind => {
      const cohorts = report.calibration.cohorts.filter(cohort => cohort.resourceKind === kind);
      const gates: Record<string, number> = {};
      for (const cohort of cohorts) for (const gate of cohort.gates) gates[gate] = (gates[gate] ?? 0) + 1;
      return { kind,
        trainingExamples: cohorts.reduce((sum, cohort) => sum + cohort.trainCount, 0),
        heldOutExamples: cohorts.reduce((sum, cohort) => sum + cohort.testCount, 0),
        insufficientCohorts: cohorts.filter(cohort => cohort.state === 'insufficient-evidence').length,
        rejectedCohorts: cohorts.filter(cohort => cohort.state === 'rejected').length,
        passingCohorts: cohorts.filter(cohort => cohort.state === 'passes-offline-gates').length,
        gates,
      };
    }),
    minimumEvidence: { trainSessions: policy.minTrainSessions, trainExamples: policy.minTrainExamples,
      testSessions: policy.minTestSessions, testExamples: policy.minTestExamples },
  };
}
