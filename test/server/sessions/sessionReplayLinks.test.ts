import fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionReplayLinks } from '../../../server/sessions/sessionReplayLinks.js';
import type { LmuParser } from '../../../server/sessions/parser.js';
import type { ReplayFileEntry } from '../../../server/sessions/sessionXmlTypes.js';
import type { DetailedSession } from '../../../server/core/types.js';
import { SessionDatabase } from '../../../server/core/db.js';

const xmlMtimeMs = Date.parse('2026-09-20T18:00:00Z');

function parserAt(revision: number): LmuParser {
  return { getReplayIndexRevision: () => revision, findMatchingReplay: () => undefined } as unknown as LmuParser;
}

function practiceSession(replayName: string): DetailedSession {
  return {
    id: 'practice-1', filename: 'practice-1.xml', filePath: 'C:/results/practice-1.xml', sessionName: 'P1', sessionType: 'Practice',
    trackVenue: 'Spa', trackCourse: 'Grand Prix', timestamp: xmlMtimeMs - 3_600_000, drivers: [],
    matchingReplayFile: { name: replayName, path: `C:/replays/${replayName}`, sizeBytes: 1 },
  } as unknown as DetailedSession;
}

describe('SessionReplayLinks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the persisted XML timestamp without touching a missing source file', () => {
    const db = new SessionDatabase(':memory:');
    try {
      const session = practiceSession('Spa P1.Vcr');
      db.upsertSession(session, session.filePath, xmlMtimeMs, 1);
      const stat = vi.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('deleted XML'); });
      const links = new SessionReplayLinks(db);
      expect(links.xmlMtime(session)).toBe(xmlMtimeMs);
      expect(stat).not.toHaveBeenCalled();
      expect(db.getSessionXmlMtime(session.id, 'another.xml')).toBeUndefined();
      db.upsertSession(session, session.filePath, xmlMtimeMs + 1000, 1);
      expect(links.xmlMtime(session)).toBe(xmlMtimeMs + 1000);
      db.clearCache();
      expect(links.xmlMtime(session)).toBeUndefined();
    } finally { db.close(); }
  });

  it('falls back to disk for unstored timestamps without retaining successful or failed reads', () => {
    const stat = vi.spyOn(fs, 'statSync')
      .mockImplementationOnce(() => { throw new Error('temporarily unavailable'); })
      .mockReturnValue({ mtimeMs: xmlMtimeMs } as unknown as fs.Stats);
    const links = new SessionReplayLinks({ updateSessionMatchingReplay: vi.fn(), rejectSessionReplayLink: vi.fn() });
    const session = practiceSession('Spa P1.Vcr');
    expect(links.xmlMtime(session)).toBeUndefined();
    expect(links.xmlMtime(session)).toBe(xmlMtimeMs);
    expect(links.xmlMtime(session)).toBe(xmlMtimeMs);
    expect(stat).toHaveBeenCalledTimes(3);
  });

  it('retries validation after a failed timestamp read with the same parser revision', () => {
    vi.spyOn(fs, 'statSync').mockImplementationOnce(() => { throw new Error('locked'); })
      .mockReturnValue({ mtimeMs: xmlMtimeMs } as unknown as fs.Stats);
    const db = { updateSessionMatchingReplay: vi.fn(), rejectSessionReplayLink: vi.fn() };
    const links = new SessionReplayLinks(db);
    const session = practiceSession('Spa R1.Vcr');
    const replay = { name: 'Spa R1.Vcr', trackName: 'Spa', sessionCode: 'R1', mtime: xmlMtimeMs } as ReplayFileEntry;
    const parser = parserAt(1);
    const index = new Map([[replay.name, replay]]);
    links.linkSessions([session], parser, index);
    expect(session.matchingReplayFile).toBeDefined();
    links.linkSessions([session], parser, index);
    expect(db.rejectSessionReplayLink).toHaveBeenCalledWith(session.id, expect.anything(), 'session-type');
  });

  it('revalidates reparsed session metadata at the same replay revision', () => {
    const db = { updateSessionMatchingReplay: vi.fn(), rejectSessionReplayLink: vi.fn(), getSessionXmlMtime: () => xmlMtimeMs };
    const links = new SessionReplayLinks(db);
    const session = practiceSession('Spa P1.Vcr');
    const replay = { name: 'Spa P1.Vcr', trackName: 'Spa', sessionCode: 'P1', mtime: xmlMtimeMs } as ReplayFileEntry;
    const parser = parserAt(1);
    const index = new Map([[replay.name, replay]]);
    links.linkSessions([session], parser, index);
    expect(db.rejectSessionReplayLink).not.toHaveBeenCalled();
    session.sessionName = 'R1';
    session.sessionType = 'Race';
    links.linkSessions([session], parser, index);
    expect(db.rejectSessionReplayLink).toHaveBeenCalledWith(session.id, expect.anything(), 'session-type');
  });

  it('re-checks stored links again after the parser is replaced, whose revisions restart', () => {
    vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: xmlMtimeMs } as unknown as fs.Stats);
    const db = { updateSessionMatchingReplay: vi.fn(), rejectSessionReplayLink: vi.fn(), getRejectedReplayLinks: () => new Map() };
    const links = new SessionReplayLinks(db);
    const session = practiceSession('Spa R1 1.Vcr');
    const raceReplay = { name: 'Spa R1 1.Vcr', path: '', sizeBytes: 1, trackName: 'Spa', sessionCode: 'R1', mtime: xmlMtimeMs } as ReplayFileEntry;

    // The first parser does not know the replay yet: the link cannot be judged, and is kept.
    links.linkSessions([session], parserAt(1), new Map());
    expect(db.rejectSessionReplayLink).not.toHaveBeenCalled();

    // Directories changed: a new parser, whose index knows the race replay, at the same revision number.
    links.linkSessions([session], parserAt(1), new Map([[raceReplay.name, raceReplay]]));

    expect(db.rejectSessionReplayLink).toHaveBeenCalledWith('practice-1', expect.objectContaining({ name: 'Spa R1 1.Vcr' }), 'session-type');
    expect(session.matchingReplayFile).toBeUndefined();
  });
});
