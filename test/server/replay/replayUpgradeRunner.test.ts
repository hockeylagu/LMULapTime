import { describe, expect, it, vi } from 'vitest';
import type { SessionDatabase } from '../../../server/core/db.js';
import type { ReplaySyncProgress } from '../../../server/core/dbSchema.js';
import type { ReplayUpgradeResult } from '../../../server/core/dbReplayUpgrade.js';
import { ReplayUpgradeRunner } from '../../../server/replay/replayUpgradeRunner.js';

// A database double whose upgrade decodes `drivers` drivers, one per step, honouring shouldStop.
function fakeDb(drivers: number) {
  const metadata = new Map<string, string>();
  const runs: Array<{ decoded: number }> = [];
  const db = {
    getMetadata: (key: string) => metadata.get(key) ?? null,
    setMetadata: (key: string, value: string) => { metadata.set(key, value); },
    listReplayUpgradeBacklog: () => [],
    upgradeReplaysAsyncIterator: (_dir: string, options: { shouldStop?: () => boolean }) => {
      const run = { decoded: 0 };
      runs.push(run);
      return (async function* (): AsyncGenerator<ReplaySyncProgress, ReplayUpgradeResult, void> {
        for (let i = 0; i < drivers; i++) {
          if (options.shouldStop?.()) return { replays: 1, upgraded: run.decoded, failed: 0, interrupted: true };
          await Promise.resolve();
          run.decoded++;
          yield { processed: 0, total: 1, currentFile: 'A.Vcr' };
        }
        return { replays: 1, upgraded: run.decoded, failed: 0, interrupted: false };
      })();
    },
  };
  return { db: db as unknown as SessionDatabase, runs };
}

describe('ReplayUpgradeRunner', () => {
  it('runs the upgrade in the background and reports its result', async () => {
    const { db } = fakeDb(3);
    const runner = new ReplayUpgradeRunner(db);

    expect(runner.start('C:\\replays')).toBe(true);
    await vi.waitFor(() => expect(runner.getStatus().running).toBe(false));

    expect(runner.getStatus().result).toEqual({ replays: 1, upgraded: 3, failed: 0, interrupted: false });
  });

  it('does not start once turned off, and the switch is remembered', () => {
    const { db, runs } = fakeDb(3);
    new ReplayUpgradeRunner(db).setEnabled(false);
    const runner = new ReplayUpgradeRunner(db);

    expect(runner.getStatus().enabled).toBe(false);
    expect(runner.start('C:\\replays')).toBe(false);
    expect(runs).toHaveLength(0);
  });

  it('stops when asked, and a start asked for meanwhile runs once the stop is done', async () => {
    const { db, runs } = fakeDb(50);
    const runner = new ReplayUpgradeRunner(db);

    runner.start('C:\\replays');
    runner.stop();
    expect(runner.start('C:\\replays')).toBe(false);
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    await vi.waitFor(() => expect(runner.getStatus().running).toBe(false));

    expect(runs[0].decoded).toBeLessThan(50);
    expect(runner.getStatus().result?.interrupted).toBe(false);
  });
});
