import type { Database } from 'better-sqlite3';
import { evaluateLearningBaseline } from '../../../shared/domain/learning/evaluate.js';
import { getLiveCaptureIndexRows } from '../../core/live/dbLiveCaptureStore.js';
import { getLearningSource, readCurrentLearningExamples } from '../../core/live/dbLiveLearningStore.js';
import { learningProjectionInputs } from './inputs.js';

/** Read-only evaluation rechecks canonical ownership/classification; raw recordings need not still exist. */
export function evaluateLiveLearning(db: Database, holdoutFraction = 0.25) {
  const captures = getLiveCaptureIndexRows(db);
  const current = new Set(captures.filter(entry => {
    const source = getLearningSource(db, entry.manifest.recordingId);
    return source?.state === 'ready' && learningProjectionInputs(db, entry)?.signature === source.signature;
  }).map(entry => entry.manifest.recordingId));
  const examples = readCurrentLearningExamples(db);
  const exclusions: Record<string, number> = {};
  const eligible = examples.filter(example => {
    const reasons = [...example.exclusions, ...(!current.has(example.recordingId) ? ['stale-projection'] : [])];
    for (const reason of reasons) exclusions[reason] = (exclusions[reason] ?? 0) + 1;
    return reasons.length === 0;
  });
  const evaluation = evaluateLearningBaseline(eligible.map(example => ({ sessionId: example.sessionId,
    startedAt: example.startedAt, resourceKind: example.kind, predicted: example.predicted!, actual: example.actual,
    cohort: JSON.stringify([example.layoutKey, example.vehicleModel, example.driverName, example.gameVersion,
      example.condition, example.compound, example.modelVersion, example.predictionSource]),
  })), holdoutFraction);
  return {
    reportVersion: 1, generatedAt: new Date().toISOString(), historicalCorrectionsEnabled: false,
    state: eligible.length === 0 ? 'awaiting-eligible-evidence' : evaluation.testCount === 0 ? 'insufficient-sessions' : 'baseline-evaluated',
    errorConvention: 'predicted-minus-actual; negative means underprediction',
    units: { fuel: 'litres per lap', ve: 'percentage points per lap' },
    captures: { indexed: captures.length, verified: captures.filter(entry => entry.matchStatus === 'verified').length,
      unavailable: captures.filter(entry => !entry.available).length },
    dataset: { currentExamples: examples.length, eligible: eligible.length, excluded: examples.length - eligible.length, exclusions },
    sources: db.prepare('SELECT state,count(*) AS count FROM live_learning_sources GROUP BY state ORDER BY state').all(),
    sourceFailures: db.prepare(`SELECT recording_id AS recordingId,error,updated_at AS updatedAt FROM live_learning_sources
      WHERE state='failed' ORDER BY updated_at DESC LIMIT 20`).all(),
    evaluation,
  };
}
