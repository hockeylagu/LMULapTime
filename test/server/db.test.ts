import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { SessionDatabase } from '../../server/db';
import { LmuParser } from '../../server/parser';

describe('SessionDatabase (SQLite Cache)', () => {
  let db: SessionDatabase;
  const resultsDir = path.join(process.cwd(), 'test', 'fixtures', 'results');
  const replaysDir = path.join(process.cwd(), 'test', 'fixtures', 'replays');
  const parser = new LmuParser(replaysDir, resultsDir);

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('initializes schema and returns initial empty stats', () => {
    const stats = db.getCacheStats();
    expect(stats.enabled).toBe(true);
    expect(stats.sessionsCount).toBe(0);
    expect(stats.lastSyncedAt).toBeNull();
  });

  it('syncs sessions from fixtures directory and caches them', () => {
    const syncRes = db.syncSessionsFromDir(resultsDir, parser);
    expect(syncRes.added).toBeGreaterThanOrEqual(1);
    expect(syncRes.total).toBeGreaterThanOrEqual(1);
    expect(syncRes.lastSyncedAt).toBeDefined();

    const stats = db.getCacheStats();
    expect(stats.sessionsCount).toBe(syncRes.total);
    expect(stats.lastSyncedAt).toBe(syncRes.lastSyncedAt);

    // Verify session data can be retrieved
    const sessions = db.getAllSessions();
    expect(sessions.length).toBe(syncRes.total);
    expect(sessions[0]).toHaveProperty('trackVenue');
    expect(sessions[0]).toHaveProperty('drivers');

    const summaries = db.getAllSessionSummaries();
    expect(summaries.length).toBe(syncRes.total);
    expect(summaries[0]).toHaveProperty('trackVenue');
    // Summaries do not include full drivers list
    expect(summaries[0]).not.toHaveProperty('drivers');
  });

  it('skips parsing unchanged files during subsequent sync (delta sync)', () => {
    const firstSync = db.syncSessionsFromDir(resultsDir, parser);
    expect(firstSync.added).toBeGreaterThanOrEqual(1);

    // Second sync: no files modified, so added and updated should both be 0
    const secondSync = db.syncSessionsFromDir(resultsDir, parser);
    expect(secondSync.added).toBe(0);
    expect(secondSync.updated).toBe(0);
    expect(secondSync.total).toBe(firstSync.total);
  });

  it('retrieves single session by id or returns null if missing', () => {
    db.syncSessionsFromDir(resultsDir, parser);
    const sessions = db.getAllSessions();
    const id = sessions[0].id;

    const found = db.getSessionById(id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(id);

    const notFound = db.getSessionById('nonexistent-session-id');
    expect(notFound).toBeNull();
  });

  it('clears cache and resets stats', () => {
    db.syncSessionsFromDir(resultsDir, parser);
    expect(db.getSessionsCount()).toBeGreaterThan(0);

    db.clearCache();
    expect(db.getSessionsCount()).toBe(0);
    const stats = db.getCacheStats();
    expect(stats.sessionsCount).toBe(0);
    expect(stats.lastSyncedAt).toBeNull();
    expect(db.getAllSessions().length).toBe(0);
  });
});
