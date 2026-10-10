import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DetailedSession, LapData } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertSession } from '../../../../server/core/dbSessionStore.js';
import { queryTrackDetailFilters, queryTrackDetailSummary, queryTrackSummaries } from '../../../../server/core/sessionSummaries/trackQueries.js';
import { aggregateTrackSummaries } from '../../../../shared/domain/trackSummaryUtils.js';

function makeSession(id: string, time: number, carType: string, carClass: string, lapTime: number): DetailedSession {
  const lap: LapData = { lapNum: 1, position: 1, lapTime, lapTimeString: `${lapTime}`, s1: 30, s2: 30, s3: lapTime - 60,
    topSpeed: 250, fCompound: 'Dry', rCompound: 'Dry', isPitStop: false, isValid: true };
  const driver = { name: 'Driver', carType, carClass, carNumber: '1', teamName: '', isPlayer: true, position: 1, classPosition: 1,
    bestLapTime: lapTime, bestLapTimeString: `${lapTime}`, bestLapNum: 1, bestS1: 30, bestS2: 30, bestS3: lapTime - 60,
    theoreticalBest: lapTime, theoreticalBestString: `${lapTime}`, lapsCount: 1, laps: [lap] };
  return { id, filename: `${id}.xml`, filePath: `${id}.xml`, trackVenue: 'Monza', trackCourse: 'GP', trackEvent: '',
    trackLengthMeters: 5793, timeString: `2026/06/01 12:0${time}`, timestamp: time, sessionType: time === 1 ? 'Race' : 'Qualifying',
    sessionName: 'Session', driversCount: 1, playerDriver: driver, drivers: [driver] };
}

describe('track detail summary queries', () => {
  it('aggregates the selected class and car across history and returns scoped option counts', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    upsertSession(db, makeSession('hypercar', 1, 'Ferrari 499P', 'Hypercar', 90), 'hypercar.xml', 1, 10);
    upsertSession(db, makeSession('hypercar-later', 3, 'Ferrari 499P', 'Hypercar', 91), 'hypercar-later.xml', 3, 10);
    upsertSession(db, makeSession('gt3', 2, 'Porsche 911 GT3', 'LMGT3', 100), 'gt3.xml', 2, 10);
    db.prepare('UPDATE sessions SET is_empty=1 WHERE id=?').run('gt3');
    const summary = queryTrackDetailSummary(db, 'Monza', 'LMH', 'Ferrari 499P');
    expect(summary).toMatchObject({ sessionsCount: 2, totalLaps: 2, bestLapTime: 90, bestLapCar: 'Ferrari 499P' });
    const filters = queryTrackDetailFilters(db, 'Monza', 'LMH');
    expect(filters.carModels).toEqual(['Ferrari 499P']);
    expect(filters.sessionTypes).toEqual(['qualifying', 'race']);
    expect(filters.emptyCount).toBe(0);
    expect(filters.replayCount).toBe(0);
    db.close();
  });

  it('matches the domain aggregate across class and model scopes without reading session cards', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const sessions = [
      makeSession('hypercar', 1, 'Ferrari 499P', 'Hypercar', 90),
      makeSession('hypercar-later', 3, 'Ferrari 499P', 'Hypercar', 91),
      makeSession('gt3', 2, 'Porsche 911 GT3', 'LMGT3', 100),
      { ...makeSession('other-layout', 4, 'Oreca 07', 'LMP2 (ELMS)', 99), trackVenue: 'Le Mans', trackCourse: '24 Hours' },
    ];
    for (const session of sessions) upsertSession(db, session, `${session.id}.xml`, session.timestamp ?? 0, 10);

    const expected = aggregateTrackSummaries(sessions, { carClass: 'LMH', includeEmptyVenues: true });
    const actual = queryTrackSummaries(db, 'LMH');
    expect(actual).toHaveLength(Object.keys(expected).length);
    for (const summary of actual) expect(summary).toEqual(expected[summary.trackVenue]);
    expect(queryTrackDetailSummary(db, 'Monza', 'LMH', 'Porsche 911 GT3')).toBeUndefined();
    expect(queryTrackDetailSummary(db, 'Monza', 'GT3')?.sessionsCount).toBe(1);
    db.close();
  });

  it('keeps unknown layouts isolated by venue and course', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const first = { ...makeSession('mod-a', 1, 'Oreca 07', 'LMP2 (ELMS)', 99), trackVenue: 'Mod Circuit Alpha', trackCourse: 'Short' };
    const second = { ...makeSession('mod-b', 2, 'Oreca 07', 'LMP2 (ELMS)', 98), trackVenue: 'Mod Circuit Beta', trackCourse: 'Short' };
    upsertSession(db, first, 'mod-a.xml', 1, 10);
    upsertSession(db, second, 'mod-b.xml', 2, 10);

    expect(queryTrackDetailSummary(db, 'Mod Circuit Alpha (Short)', 'LMP2elms'))
      .toMatchObject({ trackVenue: 'Mod Circuit Alpha (Short)', sessionsCount: 1, bestLapTime: 99 });
    db.close();
  });
});
