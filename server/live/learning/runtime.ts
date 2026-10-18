import type { Database } from 'better-sqlite3';
import type { AutomaticLearningState } from '../../../shared/domain/learning/automatic.js';
import { boundedCorrection } from '../../../shared/domain/learning/automatic.js';
import { learningCohort, type LearningIdentity } from '../../../shared/domain/learning/cohort.js';
import type { LiveResourceKind } from '../../../shared/types/liveStrategy.js';
import { readLearningModels, saveLearningModels } from '../../core/live/dbLearningModelStore.js';
import { getLiveCaptureIndexRows } from '../../core/live/dbLiveCaptureStore.js';
import { learningProjectionInputs } from './inputs.js';
import { readAutomaticLearning } from './automaticReader.js';

/** No database reads while driving: a small compatible model map and trusted current-run XML patch. */
export class AutomaticLearningRuntime {
  private models = new Map<string, number>();
  private runStartedAt: number | null = null;
  private patch: string | null = null;
  private running = false;
  private pending: AbortController | null = null;
  private lastRevision: string | null = null;
  public constructor(private readonly enabled = true) {}

  public gameRunning(running: boolean, now = Date.now()): void {
    if (running && !this.running) { this.runStartedAt = now; this.lastRevision = null; }
    if (!running) { this.runStartedAt = null; this.patch = null; this.models.clear(); this.cancel(); }
    this.running = running;
  }
  public cancel(): void { this.pending?.abort(); }

  public correct(kind: LiveResourceKind, predicted: number, identity: Omit<LearningIdentity, 'gameVersion'>):
    { perLap: number; adjustment: number } | null {
    if (!this.enabled || !this.running || !this.patch || !Number.isFinite(predicted) || predicted <= 0) return null;
    const cohort = learningCohort({ ...identity, gameVersion: this.patch });
    const adjustment = cohort ? this.models.get(JSON.stringify([kind, cohort])) : undefined;
    if (adjustment === undefined || !Number.isFinite(adjustment)) return null;
    const perLap = boundedCorrection(predicted, adjustment);
    return { perLap, adjustment: perLap - predicted };
  }

  public async refresh(db: Database, blocked: () => boolean,
    read = readAutomaticLearning): Promise<void> {
    if (!this.enabled || blocked() || this.pending) return;
    const request = new AbortController(); this.pending = request;
    // Both local writes and writes from another connection invalidate the asynchronous snapshot.
    const revision = (): string => JSON.stringify([db.prepare('SELECT total_changes() AS n').get(), db.pragma('data_version')]);
    const before = revision();
    if (before === this.lastRevision) { this.pending = null; return; }
    let saved = false;
    try {
      const state: AutomaticLearningState = await read(db.name, request.signal);
      if (blocked() || request.signal.aborted) return;
      saved = db.transaction(() => {
        if (before !== revision()) return false;
        saveLearningModels(db, state);
        return true;
      }).immediate();
    } catch (error) {
      if (request.signal.aborted) return;
      throw error;
    } finally { this.pending = null; }
    // Serve what is committed: a refresh that lost a race keeps the previous models instead of none.
    this.models = new Map(readLearningModels(db).models.filter(model => model.state === 'active')
      .map(model => [JSON.stringify([model.resourceKind, model.cohort]), model.adjustment]));
    const patches = new Set(getLiveCaptureIndexRows(db).filter(entry => this.runStartedAt !== null
      && entry.manifest.startedAt >= this.runStartedAt && learningProjectionInputs(db, entry) !== null)
      .map(entry => entry.manifest.gameVersion).filter((patch): patch is string => Boolean(patch)));
    this.patch = patches.size === 1 ? [...patches][0] : null;
    if (saved) this.lastRevision = revision();
  }
}
