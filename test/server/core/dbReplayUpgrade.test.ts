import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionDatabase } from '../../../server/core/db.js';
import type { ReplayUpgradeResult } from '../../../server/core/db.js';
import { REPLAY_CACHE_VERSION } from '../../../server/core/dbSchema.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

const name = 'Upgrade_P1.Vcr';

describe('replay upgrade', () => {
  let db: SessionDatabase;
  let dir: string;

  const sql = (statement: string, ...params: unknown[]) => db.getDb().prepare(statement).run(...params);
  const versions = () => (db.getDb().prepare(
    'SELECT driver_slot, parser_version FROM replay_trajectories WHERE filename = ? GROUP BY driver_slot, parser_version ORDER BY driver_slot'
  ).all(name) as Array<{ driver_slot: number; parser_version: string }>);

  // Stores the replay at the current version, then marks its rows as written by an older one.
  const ingestAsOlderVersion = () => {
    db.syncReplaysFromDir(dir, { playerName: 'Player Driver' });
    sql("UPDATE replay_trajectories SET parser_version = 'v4'");
    sql("UPDATE replay_metadata SET parser_version = 'v4'");
    sql('DELETE FROM replay_ingest_drivers');
  };

  const runUpgrade = async (shouldStop?: () => boolean): Promise<ReplayUpgradeResult> => {
    const iterator = db.upgradeReplaysAsyncIterator(dir, { playerName: 'Player Driver', shouldStop });
    let step = await iterator.next();
    while (!step.done) step = await iterator.next();
    return step.value;
  };

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-replay-upgrade-'));
    fs.writeFileSync(path.join(dir, name), createSliceVcrBuffer({
      drivers: [
        { name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'A', carNumber: '21' },
        { name: 'Rival Driver', vehicleId: '21_26_AFCO95641716', team: 'B', carNumber: '22' },
      ],
      slices: [
        { sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 },
        { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 10 },
        { sTime: 0, driverSlot: 2, x: 5, y: 0, z: 0 },
        { sTime: 1, driverSlot: 2, x: 15, y: 0, z: 10 },
      ],
    }));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists an on-disk replay whose rows are from an older version', () => {
    ingestAsOlderVersion();

    expect(db.listReplayUpgradeBacklog(dir)).toEqual([
      expect.objectContaining({ filename: name, metadataOutdated: true, driverSlots: [1, 2], primarySlot: 1 }),
    ]);
  });

  it('does not list a replay LMU has deleted, nor one whose file changed', () => {
    ingestAsOlderVersion();
    const filePath = path.join(dir, name);

    fs.utimesSync(filePath, new Date(), new Date(Date.now() + 60_000));
    expect(db.listReplayUpgradeBacklog(dir)).toEqual([]);

    fs.rmSync(filePath);
    expect(db.listReplayUpgradeBacklog(dir)).toEqual([]);
  });

  it('decodes every driver again at the current version and keeps the player as the default', async () => {
    ingestAsOlderVersion();

    const result = await runUpgrade();

    expect(result).toMatchObject({ replays: 1, upgraded: 2, failed: 0, interrupted: false });
    expect(versions()).toEqual([
      { driver_slot: 1, parser_version: REPLAY_CACHE_VERSION },
      { driver_slot: 2, parser_version: REPLAY_CACHE_VERSION },
    ]);
    expect(db.getStoredReplayTrajectory(name, -1, -1)?.driverSlot).toBe(1);
    expect(db.getReplayDriverIngest(name, 2)?.status).toBe('stored');
    expect(db.listReplayUpgradeBacklog(dir)).toEqual([]);
  });

  it('records a driver that fails and keeps its older rows, without listing it again', async () => {
    ingestAsOlderVersion();
    const replace = db.replaceReplayDriverLaps.bind(db);
    vi.spyOn(db, 'replaceReplayDriverLaps').mockImplementation((...args) => {
      if (args[4] === 2) throw new Error('bad stream');
      replace(...args);
    });

    const result = await runUpgrade();

    expect(result).toMatchObject({ upgraded: 1, failed: 1 });
    expect(db.getReplayDriverIngest(name, 2)).toMatchObject({ status: 'failed', error: 'bad stream' });
    expect(versions()).toContainEqual({ driver_slot: 2, parser_version: 'v4' });
    expect(db.listReplayUpgradeBacklog(dir)).toEqual([]);
  });

  it('stops between drivers when asked, and the next run resumes with the rest', async () => {
    ingestAsOlderVersion();
    let decoded = 0;

    const first = await runUpgrade(() => decoded++ >= 1);

    expect(first.interrupted).toBe(true);
    expect(db.listReplayUpgradeBacklog(dir)).toEqual([expect.objectContaining({ driverSlots: [2], metadataOutdated: false })]);

    await runUpgrade();
    expect(db.listReplayUpgradeBacklog(dir)).toEqual([]);
  });
});
