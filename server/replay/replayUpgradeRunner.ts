import { ReplayUpgradeStatus } from '../core/types.js';
import type { SessionDatabase, ReplayUpgradeCandidate } from '../core/db.js';

// Runs the replay upgrade (see dbReplayUpgrade) in the background. It is the lowest-priority work:
// it starts once a replay sync has finished, and a new scan asks it to stop, which it does after the
// driver it is decoding; everything stored so far stays stored, so the next run resumes from there.

const ENABLED_KEY = 'replay_upgrade_enabled';

function idleStatus(enabled: boolean): ReplayUpgradeStatus {
  return {
    enabled,
    running: false,
    processed: 0,
    total: 0,
    currentFile: null,
    currentStage: null,
    filePercent: null,
    driversDone: 0,
    driversTotal: 0,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };
}

export class ReplayUpgradeRunner {
  private status: ReplayUpgradeStatus;
  private stopRequested = false;
  // A start asked for while a stopping run finishes its current driver.
  private restartPending: { replaysDir: string; playerName?: string } | null = null;

  public constructor(private readonly sessionDb: SessionDatabase) {
    this.status = idleStatus(this.isEnabled());
  }

  public isEnabled(): boolean {
    return this.sessionDb.getMetadata(ENABLED_KEY) !== 'false';
  }

  public setEnabled(enabled: boolean): void {
    this.sessionDb.setMetadata(ENABLED_KEY, String(enabled));
    this.status.enabled = enabled;
    if (!enabled) this.stop();
  }

  public getStatus(): ReplayUpgradeStatus {
    return this.status;
  }

  public getBacklog(replaysDir: string): ReplayUpgradeCandidate[] {
    return this.sessionDb.listReplayUpgradeBacklog(replaysDir);
  }

  /** Asks a running upgrade to stop after its current driver. */
  public stop(): void {
    this.restartPending = null;
    if (this.status.running) this.stopRequested = true;
  }

  public start(replaysDir: string, playerName?: string): boolean {
    if (!this.isEnabled()) return false;
    if (this.status.running) {
      if (this.stopRequested) this.restartPending = { replaysDir, playerName };
      return false;
    }
    this.stopRequested = false;
    this.status = { ...idleStatus(true), running: true, startedAt: new Date().toISOString() };

    const iterator = this.sessionDb.upgradeReplaysAsyncIterator(replaysDir, {
      playerName,
      shouldStop: () => this.stopRequested,
    });
    const finish = (): void => {
      this.status.running = false;
      this.status.finishedAt = new Date().toISOString();
      this.status.currentFile = null;
      this.status.currentStage = null;
      this.status.filePercent = null;
      const restart = this.restartPending;
      this.restartPending = null;
      if (restart) this.start(restart.replaysDir, restart.playerName);
    };
    const step = async (): Promise<void> => {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          this.status.result = value;
          this.status.driversDone = value.upgraded + value.failed;
          if (value.replays > 0) {
            console.log(`[SQLite Cache] Replay upgrade: ${value.upgraded} drivers decoded again, ${value.failed} failed, across ${value.replays} replays${value.interrupted ? ' (paused)' : ''}`);
          }
          finish();
          return;
        }
        this.status.processed = value.processed;
        this.status.total = value.total;
        this.status.currentFile = value.currentFile || null;
        this.status.currentStage = value.stage || null;
        this.status.filePercent = value.filePercent ?? null;
        this.status.driversDone = value.driversDone;
        this.status.driversTotal = value.driversTotal;
        setImmediate(() => { void step(); });
      } catch (error) {
        this.status.error = error instanceof Error ? error.message : String(error);
        console.warn('[SQLite Cache] Replay upgrade warning:', error);
        finish();
      }
    };
    setImmediate(() => { void step(); });
    return true;
  }
}
