import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { LearningReadinessReader } from '../../../../server/live/learning/readinessReader.js';

const folders: string[] = [];
const databases: SessionDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  for (const folder of folders.splice(0)) {
    expect(path.dirname(folder)).toBe(path.resolve(tmpdir()));
    await rm(folder, { recursive: true, force: true });
  }
});

async function fixture() {
  const folder = await mkdtemp(path.join(tmpdir(), 'lmu-readiness-')); folders.push(folder);
  const filename = path.join(folder, 'learning.db');
  const db = new SessionDatabase(filename); databases.push(db);
  return { folder, filename, db };
}

describe('read-only learning readiness worker', () => {
  it('reports the compact empty state without writes or raw-file access and bounds concurrent evaluation', async () => {
    const { filename, db } = await fixture();
    const before = db.getDb().prepare('SELECT total_changes() AS count').get();
    const reader = new LearningReadinessReader();
    const first = reader.read(filename, new AbortController().signal);
    await expect(reader.read(filename, new AbortController().signal)).rejects.toThrow('already being checked');
    expect(await first).toMatchObject({ state: 'evaluated', historicalCorrectionsEnabled: false,
      dataset: { eligible: 0 }, sessions: { training: 0, heldOut: 0 } });
    expect(db.getDb().prepare('SELECT total_changes() AS count').get()).toEqual(before);
  });

  it('cancels in-flight work, releases the slot and does not create missing databases', async () => {
    const { folder, filename } = await fixture();
    const reader = new LearningReadinessReader(); const abort = new AbortController();
    const pending = reader.read(filename, abort.signal); abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect((await reader.read(filename, new AbortController().signal)).state).toBe('evaluated');
    await expect(reader.read(path.join(folder, 'missing.db'), new AbortController().signal)).rejects.toThrow();
  });
});
