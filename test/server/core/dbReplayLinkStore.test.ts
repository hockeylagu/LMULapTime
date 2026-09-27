import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import type { DetailedSession } from '../../../server/core/types.js';

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
    const cached = db.getAllSessions()[0];

    const rejected = db.rejectSessionReplayLink(session.id, replayLink, 'time-window');

    expect(rejected).toEqual({ replayName: replayLink.name, reason: 'time-window', rejectedAt: expect.any(Number) });
    expect(cached.matchingReplayFile).toBeUndefined();
    expect(cached.rejectedReplayLink).toEqual(rejected);
    db.invalidateSessionCache();
    expect(db.getSessionById(session.id)?.matchingReplayFile).toBeUndefined();
    expect(db.getAllSessionSummaries()[0].matchingReplayFile).toBeUndefined();
    expect(db.getRejectedReplayLinks().get(session.id)).toEqual([rejected]);
  });

  it('keeps the previous link so the withdrawal can be undone', () => {
    db.rejectSessionReplayLink(session.id, replayLink, 'time-window');

    const raw = (db as unknown as { db: { prepare(sql: string): { get(): { previous_link_json: string } } } }).db
      .prepare('SELECT previous_link_json FROM rejected_replay_links').get();
    expect(JSON.parse(raw.previous_link_json)).toEqual(replayLink);
  });

  it('records nothing for a session that is not stored', () => {
    expect(db.rejectSessionReplayLink('missing', replayLink, 'layout')).toBeNull();
    expect(db.getRejectedReplayLinks().size).toBe(0);
  });
});
