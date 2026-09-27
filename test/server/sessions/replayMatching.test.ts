import { describe, expect, it } from 'vitest';
import { findMatchingReplay, pickReplayOwner, replayIndexEntryFromStored, replayLinkRejection, ReplayMatchTarget } from '../../../server/sessions/replayMatching.js';
import type { ReplayFileEntry } from '../../../server/sessions/sessionXmlTypes.js';

// Real timings from the cache (2026-06-28): LMU saved one replay for a practice run of 7 session
// XMLs, and the replay records only the last of them (340 s long, saved with the last XML).
const practiceRunReplay: ReplayFileEntry = {
  name: 'Bahrain Paddock Circuit P1 18.Vcr',
  path: 'C:\\replays\\Bahrain Paddock Circuit P1 18.Vcr',
  sizeBytes: 6863306,
  trackName: 'Bahrain Paddock Circuit',
  sessionCode: 'P1',
  mtime: Date.parse('2026-06-28T23:44:43.122Z'),
  durationSec: 340.635,
};

function paddockPractice(startIso: string, xmlIso: string): ReplayMatchTarget {
  return {
    trackVenue: 'Bahrain International Circuit',
    trackCourse: 'Bahrain Paddock Circuit',
    sessionCode: 'P1',
    sessionTimestampMs: Date.parse(startIso),
    xmlFileMtimeMs: Date.parse(xmlIso),
  };
}

const firstOfRun = paddockPractice('2026-06-28T22:23:11.101Z', '2026-06-28T22:29:32.478Z');
const lastOfRun = paddockPractice('2026-06-28T23:38:39.101Z', '2026-06-28T23:44:43.176Z');

describe('replayLinkRejection', () => {
  it('accepts the replay saved with the session XML', () => {
    expect(replayLinkRejection(practiceRunReplay, lastOfRun)).toBeNull();
  });

  it('rejects the replay for an earlier session of the same practice run', () => {
    expect(replayLinkRejection(practiceRunReplay, firstOfRun)).toBe('time-window');
  });

  it('rejects a replay of another session type', () => {
    expect(replayLinkRejection(practiceRunReplay, { ...lastOfRun, sessionCode: 'R1' })).toBe('session-type');
  });

  it('rejects a replay of another circuit', () => {
    expect(replayLinkRejection(practiceRunReplay, { ...lastOfRun, trackVenue: 'Fuji Speedway', trackCourse: 'Fuji Speedway' }))
      .toBe('layout');
  });
});

describe('findMatchingReplay', () => {
  it('finds no replay for an earlier session of a practice run', () => {
    expect(findMatchingReplay([practiceRunReplay], firstOfRun)).toBeUndefined();
  });

  it('finds the replay for the session it records', () => {
    expect(findMatchingReplay([practiceRunReplay], lastOfRun)?.name).toBe(practiceRunReplay.name);
  });
});

describe('pickReplayOwner', () => {
  // Two practice sessions saved 5 minutes apart both pass the rules against the replay.
  const earlier = paddockPractice('2026-06-28T23:30:00.000Z', '2026-06-28T23:39:43.000Z');

  it('gives the replay to the session saved with it', () => {
    expect(pickReplayOwner(practiceRunReplay, [
      { id: 'earlier', target: earlier },
      { id: 'last', target: lastOfRun },
    ])).toBe('last');
  });

  it('prefers the exact session code over a closer session of another code', () => {
    expect(pickReplayOwner(practiceRunReplay, [
      { id: 'practice-2', target: { ...lastOfRun, sessionCode: 'P2' } },
      { id: 'practice-1', target: earlier },
    ])).toBe('practice-1');
  });
});

describe('layout matching', () => {
  const saved = Date.parse('2026-06-29T17:06:16.000Z');
  const sessionAt = (trackVenue: string, trackCourse: string): ReplayMatchTarget => ({
    trackVenue,
    trackCourse,
    sessionCode: 'P1',
    sessionTimestampMs: saved - 600_000,
    xmlFileMtimeMs: saved,
  });
  const replay = (trackName: string, sceneDesc?: string): ReplayFileEntry => ({
    name: `${trackName} P1 1.Vcr`,
    path: `C:\replays\${trackName} P1 1.Vcr`,
    sizeBytes: 1,
    trackName,
    sessionCode: 'P1',
    mtime: saved,
    durationSec: 600,
    sceneDesc,
  });

  it('never gives a School circuit replay to a full-course Sebring session', () => {
    const school = replay('Sebring School Circuit', 'SEBRINGWEC_SCHOOL');
    const fullCourse = sessionAt('Sebring International Raceway', 'Sebring International Raceway');

    expect(replayLinkRejection(school, fullCourse)).toBe('layout');
    expect(findMatchingReplay([school], fullCourse)).toBeUndefined();
  });

  it('takes the layout from the recorded scene when the filename only names the facility', () => {
    const curvaGrande = replay('Autodromo Nazionale Monza', 'MONZAWEC_GRANDE');

    expect(replayLinkRejection(curvaGrande, sessionAt('Autodromo Nazionale Monza', 'Autodromo Nazionale Monza'))).toBe('layout');
    expect(replayLinkRejection(curvaGrande, sessionAt('Autodromo Nazionale Monza', 'Monza Curva Grande Circuit'))).toBeNull();
  });

  it('falls back to the filename when the scene is unknown', () => {
    expect(replayLinkRejection(replay('Monza Curva Grande Circuit'), sessionAt('Autodromo Nazionale Monza', 'Monza Curva Grande Circuit')))
      .toBeNull();
  });
});

describe('replayIndexEntryFromStored', () => {
  const stored = (metadata: Record<string, unknown>) => ({
    filename: 'Sebring School Circuit P1 1.Vcr',
    file_path: 'C:\replays\Sebring School Circuit P1 1.Vcr',
    file_size: 1,
    file_mtime: 2,
    metadata: metadata as never,
  });

  it('reads the track and session code from the filename', () => {
    expect(replayIndexEntryFromStored(stored({}))).toMatchObject({ trackName: 'Sebring School Circuit', sessionCode: 'P1' });
  });

  it('takes the scene from the event info when older rows lack the top-level field', () => {
    expect(replayIndexEntryFromStored(stored({ eventInfo: { sceneDesc: 'SEBRINGWEC_SCHOOL' } })).sceneDesc).toBe('SEBRINGWEC_SCHOOL');
    expect(replayIndexEntryFromStored(stored({ sceneDesc: 'SEBRINGWEC', eventInfo: { sceneDesc: 'X' } })).sceneDesc).toBe('SEBRINGWEC');
  });
});
