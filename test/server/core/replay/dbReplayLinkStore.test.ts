import { querySessionPage } from '../../../../server/core/sessionSummaries/pageQueries.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import type { DetailedSession } from '../../../../server/core/types.js';

const replayLink = {
  name: 'Bahrain Paddock Circuit P1 18.Vcr',
  path: 'C:\\replays\\Bahrain Paddock Circuit P1 18.Vcr',
  sizeBytes: 6863306,
  durationSec: 340.635,
};

const session = {
  id: '2026_06_28_18_29_32-98P1',
  filename: '2026_06_28_18_29_32-98P1.xml',
  timestamp: Date.parse('2026-06-28T22:23:11.101Z'),
  trackVenue: 'Bahrain International Circuit',
  trackCourse: 'Bahrain Paddock Circuit',
  sessionType: 'Practice',
  sessionName: 'P1',
  driversCount: 0,
  drivers: [],
  matchingReplayFile: replayLink,
} as unknown as DetailedSession;

describe('rejected replay links', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    db.upsertSession(session, 'C:\\results\\2026_06_28_18_29_32-98P1.xml', 1, 1);
  });

  afterEach(() => {
    db.close();
  });

  it('removes the link from the session row and records what it held', () => {
    const rejected = db.rejectSessionReplayLink(session.id, replayLink, 'time-window');

    expect(rejected).toEqual({ replayName: replayLink.name, reason: 'time-window', rejectedAt: expect.any(Number) });
    db.markSessionDataChanged();
    expect(db.getSessionById(session.id)?.matchingReplayFile).toBeUndefined();
    expect(querySessionPage(db.getDb(), { page: 1, pageSize: db.getSessionsCount() }).sessions[0].matchingReplayFile).toBeUndefined();
    expect(db.getRejectedReplayLinks().get(session.id)).toEqual([rejected]);
  });

  it('keeps the previous link so the withdrawal can be undone', () => {
    db.rejectSessionReplayLink(session.id, replayLink, 'time-window');

    const raw = (db as unknown as { db: { prepare(sql: string): { get(): { previous_link_json: string } } } }).db
      .prepare('SELECT previous_link_json FROM rejected_replay_links').get();
    expect(JSON.parse(raw.previous_link_json)).toEqual(replayLink);
  });

  it('does not store a withdrawn replay again when the XML is parsed again', () => {
    db.rejectSessionReplayLink(session.id, replayLink, 'owned-by-other-session');
    const reparsed = { ...session, matchingReplayFile: { ...replayLink } } as DetailedSession;

    db.upsertSession(reparsed, 'C:\\results\\2026_06_28_18_29_32-98P1.xml', 2, 1);

    expect(reparsed.matchingReplayFile).toBeUndefined();
    db.markSessionDataChanged();
    expect(db.getSessionById(session.id)?.matchingReplayFile).toBeUndefined();
    expect(querySessionPage(db.getDb(), { page: 1, pageSize: db.getSessionsCount() }).sessions[0].matchingReplayFile).toBeUndefined();
  });

  it('stores a different replay matched by a later parse', () => {
    db.rejectSessionReplayLink(session.id, replayLink, 'time-window');
    const other = { ...replayLink, name: 'Bahrain Paddock Circuit P1 19.Vcr' };

    db.upsertSession({ ...session, matchingReplayFile: other } as DetailedSession, 'C:\\results\\2026_06_28_18_29_32-98P1.xml', 2, 1);

    db.markSessionDataChanged();
    expect(db.getSessionById(session.id)?.matchingReplayFile?.name).toBe(other.name);
  });

  it('records nothing for a session that is not stored', () => {
    expect(db.rejectSessionReplayLink('missing', replayLink, 'layout')).toBeNull();
    expect(db.getRejectedReplayLinks().size).toBe(0);
  });
});

describe('stored replay links', () => {
  let db: SessionDatabase;
  const unlinked = { ...session, matchingReplayFile: undefined } as DetailedSession;
  const updatedAt = () => (db as unknown as { db: { prepare(sql: string): { get(id: string): { updated_at: number } } } }).db
    .prepare('SELECT updated_at FROM sessions WHERE id = ?').get(session.id).updated_at;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    db.upsertSession(unlinked, 'C:\\results\\2026_06_28_18_29_32-98P1.xml', 1, 1);
  });

  afterEach(() => {
    db.close();
  });

  it('stores a new link in the source row and compact card', () => {
    db.updateSessionMatchingReplay(session.id, replayLink);

    db.markSessionDataChanged();
    expect(db.getSessionById(session.id)?.matchingReplayFile).toEqual(replayLink);
    expect(querySessionPage(db.getDb(), { page: 1, pageSize: db.getSessionsCount() }).sessions[0].matchingReplayFile).toEqual(replayLink);
  });

  it('does not rewrite the row when the same link is stored again', () => {
    db.updateSessionMatchingReplay(session.id, replayLink);
    const firstWrite = updatedAt();
    const later = vi.spyOn(Date, 'now').mockReturnValue(firstWrite + 60_000);

    db.updateSessionMatchingReplay(session.id, { ...replayLink });

    expect(updatedAt()).toBe(firstWrite);
    later.mockRestore();
  });

  it('links, withdraws and links another replay, each read back from the database', () => {
    const other = { ...replayLink, name: 'Bahrain Paddock Circuit P1 19.Vcr' };

    db.updateSessionMatchingReplay(session.id, replayLink);
    db.rejectSessionReplayLink(session.id, replayLink, 'time-window');
    db.markSessionDataChanged();
    expect(db.getSessionById(session.id)?.matchingReplayFile).toBeUndefined();

    db.updateSessionMatchingReplay(session.id, other);
    db.markSessionDataChanged();
    expect(db.getSessionById(session.id)?.matchingReplayFile?.name).toBe(other.name);
    expect(db.getRejectedReplayLinks().get(session.id)?.map(link => link.replayName)).toEqual([replayLink.name]);
  });

  it('ignores a session that is not stored', () => {
    expect(() => db.updateSessionMatchingReplay('missing', replayLink)).not.toThrow();
    expect(db.getSessionsCount()).toBe(1);
  });
});
