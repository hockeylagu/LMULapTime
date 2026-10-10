import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession, DriverData, LapData } from '../../../../server/core/types.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { canonicalSession, diffValues } from '../../../../server/core/sessionRows/canonical.js';
import { readSession } from '../../../../server/core/sessionRows/reader.js';
import { insertSessionRow } from '../../../../server/core/sessionRows/stub.js';
import { writeSessionRows } from '../../../../server/core/sessionRows/writer.js';

export function memoryDb(): DatabaseType {
  const db = new Database(':memory:');
  initDbSchema(db);
  return db;
}

export function lap(lapNum: number, overrides: Partial<LapData> = {}): LapData {
  return {
    lapNum, position: 1, lapTime: 100 + lapNum, lapTimeString: `1:${40 + lapNum}.000`, s1: 30, s2: 35, s3: 35 + lapNum,
    topSpeed: 300, fCompound: 'Medium', rCompound: 'Medium', isPitStop: false, isValid: true, ...overrides,
  };
}

export function driver(name: string, laps: LapData[], overrides: Partial<DriverData> = {}): DriverData {
  return {
    name, carType: 'Ferrari 499P', carClass: 'Hypercar', carNumber: '51', teamName: 'Team', isPlayer: false, position: 1, classPosition: 1,
    bestLapTime: 101, bestLapTimeString: '1:41.000', bestS1: 30, bestS2: 35, bestS3: 36, theoreticalBest: 100.5,
    theoreticalBestString: '1:40.500', lapsCount: laps.length, laps, ...overrides,
  };
}

export function session(drivers: DriverData[], overrides: Partial<DetailedSession> = {}): DetailedSession {
  const player = drivers.find(candidate => candidate.isPlayer);
  return {
    id: 'session-a', filename: 'session-a.xml', filePath: 'C:/Results/session-a.xml', trackVenue: 'Spa', trackCourse: 'Grand Prix',
    trackEvent: 'Spa 6h', trackLengthMeters: 7004, timeString: '2026-05-28 12:00', timestamp: 1_780_000_000_000, sessionType: 'Race',
    sessionName: 'R1', driversCount: drivers.length, drivers, ...(player ? { playerDriver: player } : {}), ...overrides,
  };
}

/** Writes a session into a fresh database and returns what was read back with its canonical form. */
export function roundTrip(input: DetailedSession, db: DatabaseType = memoryDb()): { stored: DetailedSession | null; expected: DetailedSession; diffs: string[] } {
  insertSessionRow(db, input);
  writeSessionRows(db, input);
  const stored = readSession(db, input.id);
  const expected = canonicalSession(input);
  return { stored, expected, diffs: diffValues(expected, stored) };
}
