import fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionReplayLinks } from '../../../server/sessions/sessionReplayLinks.js';
import type { LmuParser } from '../../../server/sessions/parser.js';
import type { ReplayFileEntry } from '../../../server/sessions/sessionXmlTypes.js';
import type { DetailedSession } from '../../../server/core/types.js';

const xmlMtimeMs = Date.parse('2026-09-20T18:00:00Z');

function parserAt(revision: number): LmuParser {
  return { getReplayIndexRevision: () => revision, findMatchingReplay: () => undefined } as unknown as LmuParser;
}

function practiceSession(replayName: string): DetailedSession {
  return {
    id: 'practice-1', filePath: 'C:/results/practice-1.xml', sessionName: 'P1', sessionType: 'Practice',
    trackVenue: 'Spa', trackCourse: 'Grand Prix', timestamp: xmlMtimeMs - 3_600_000, drivers: [],
    matchingReplayFile: { name: replayName, path: `C:/replays/${replayName}`, sizeBytes: 1 },
  } as unknown as DetailedSession;
}

describe('SessionReplayLinks', () => {
  afterEach(() => vi.restoreAllMocks());

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
