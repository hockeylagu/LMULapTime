import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertSession } from '../../../../server/core/dbSessionStore.js';
import { queryProgression, querySessionPage } from '../../../../server/core/sessionSummaries/pageQueries.js';
import { querySessionContext } from '../../../../server/core/sessionSummaries/contextQueries.js';
import { computeProgression } from '../../../../server/sessions/sessionAnalytics.js';
import { normalizeCarClass } from '../../../../shared/domain/paceCategory.js';
import type { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';

function fixture(id: string, timestamp: number): DetailedSession {
  const laps: LapData[] = [90, 91, 92].map((lapTime, ordinal) => ({ lapNum: ordinal + 2, position: 1,
    lapTime, lapTimeString: `${lapTime}`, s1: 30, s2: 30, s3: lapTime - 60, topSpeed: 250,
    fCompound: 'Dry', rCompound: 'Dry', isPitStop: false, isValid: true }));
  const driver: DriverData = { name: 'Player', carType: 'Ferrari 499P', carClass: 'Hypercar', carNumber: '1', teamName: '',
    isPlayer: true, position: 1, classPosition: 1, bestLapTime: 90, bestLapTimeString: '90', bestLapNum: 2,
    bestS1: 30, bestS2: 30, bestS3: 30, theoreticalBest: 90, theoreticalBestString: '90', lapsCount: 3, laps };
  return { id, filename: `${id}.xml`, filePath: `${id}.xml`, trackVenue: 'Monza', trackCourse: 'GP', trackEvent: '',
    trackLengthMeters: 5793, timeString: '2026/10/10 12:00', timestamp, sessionType: 'Race', sessionName: 'R1',
    driversCount: 1, playerDriver: driver, drivers: [driver], weatherInfo: 'Sunny' };
}

describe('paged session queries', () => {
  it('preserves progression metrics and includes empty sessions across explicit pages', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      const full = fixture('full', 1);
      full.drivers[0].laps.push({ ...full.drivers[0].laps[0], lapNum: 5, lapTime: null, isValid: false });
      full.drivers[0].lapsCount = 4;
      const empty: DetailedSession = { ...fixture('empty', 2), playerDriver: undefined, drivers: [], driversCount: 0 };
      const fallback = fixture('fallback', 3);
      fallback.drivers[0].laps = [];
      fallback.drivers[0].lapsCount = 7;
      fallback.drivers[0].avgLapTime = 92;
      for (const session of [full, empty, fallback]) upsertSession(db, session, session.filePath, 1, 1);
      const legacy = computeProgression([full, empty, fallback]).map(point => ({
        ...point, carClass: point.carClass === 'General' ? 'General' : normalizeCarClass(point.carClass),
      }));
      const first = queryProgression(db, { pageSize: 1 });
      const second = queryProgression(db, { pageSize: 1, page: 2 });
      expect(first.total).toBe(3);
      expect(first.points).toEqual([legacy[0]]);
      expect(second.points).toEqual([legacy[1]]);
      expect(queryProgression(db, { pageSize: 1, page: 3 }).points).toEqual([legacy[2]]);
    } finally { db.close(); }
  });

  it('normalizes class filters, tolerates absent pace targets and ignores invalid date bounds', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      const session = fixture('one', 1);
      upsertSession(db, session, session.filePath, 1, 1);
      const page = querySessionPage(db, { carClass: 'Hypercar', sort: 'pace-asc', from: Number.NaN });
      expect(page.total).toBe(1);
      expect(page.sessions[0].playerDriver).not.toHaveProperty('laps');
      expect(page.sessions[0].playerDriver).toMatchObject({ driverOrdinal: 0, bestLapOrdinal: 0 });
    } finally { db.close(); }
  });

  it('marks history context unavailable during a projection rebuild', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      const session = fixture('one', 1);
      upsertSession(db, session, session.filePath, 1, 1);
      expect(querySessionContext(db, session)).toMatchObject({ ready: true, personalBests: [{ driverOrdinal: 0, bestLapTime: 90 }] });
      db.prepare('UPDATE sessions SET projection_revision=projection_revision-1').run();
      expect(querySessionContext(db, session)).toEqual({ ready: false, relatedSessions: [], personalBests: [] });
    } finally { db.close(); }
  });
});
