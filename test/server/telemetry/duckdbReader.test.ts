import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DuckDBInstance, type DuckDBValue } from '@duckdb/node-api';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DuckDbReader, normalizeDuckDbGForces } from '../../../server/telemetry/duckdbReader.js';

describe('DuckDbReader', () => {
  it('normalizes exported G-force labels to ISO 8855 lateral and longitudinal axes', () => {
    // LMU's "G Force Long" holds lateral G (+ left turn); "G Force Lat" holds longitudinal G (+ braking).
    expect(normalizeDuckDbGForces(1.25, -0.75)).toEqual({
      accelLatG: -0.75,
      accelLonG: -1.25,
      accelTotalG: 1.46,
    });
  });

  // Isolate native database fixtures in a fresh temporary folder for each run.
  const TEMP_PREFIX = 'lmu-duckdb-reader-';
  const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const removeQuietly = (dir: string) => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Still locked: left for a later run.
    }
  };
  const testDbPath = path.join(testDbDir, 'Bahrain_Test_P_2026-09-13T20_33_32Z.duckdb');

  beforeAll(async () => {
    for (const entry of fs.readdirSync(os.tmpdir())) {
      const dir = path.join(os.tmpdir(), entry);
      if (entry.startsWith(TEMP_PREFIX) && dir !== testDbDir) removeQuietly(dir);
    }

    // Create fixture DuckDB file with representative schema
    const instance = await DuckDBInstance.create(testDbPath);
    const db = await instance.connect();
    await db.run(`
        CREATE TABLE metadata (key VARCHAR NOT NULL, value VARCHAR);
        INSERT INTO metadata VALUES
          ('track', 'Bahrain International Circuit'),
          ('session', 'Practice'),
          ('driver', 'Samuel Lague'),
          ('car', 'Ferrari 499P'),
          ('start_time', '2026-09-13T20:33:32Z');

        CREATE TABLE channelsList (channelName VARCHAR NOT NULL, frequency INTEGER, unit VARCHAR);
        INSERT INTO channelsList VALUES
          ('GPS Time', 100, 's'),
          ('Ground Speed', 100, 'm/s'),
          ('Throttle Pos', 100, '%'),
          ('Brake Pos', 100, '%'),
          ('Steering Input', 100, 'deg'),
          ('Engine RPM', 100, 'rpm'),
          ('G Force Lat', 10, 'G'),
          ('G Force Long', 10, 'G'),
          ('RideHeights', 100, 'm'),
          ('TyresPressure', 100, 'kPa'),
          ('TyresWear', 100, '%'),
          ('TyresTemp', 100, 'C'),
          ('Brakes Temp', 100, 'C'),
          ('Wheel Speed', 100, 'm/s'),
          ('Fuel Level', 20, 'L'),
          ('Virtual Energy', 20, '%'),
          ('SoC', 20, '%'),
          ('Regen Rate', 100, 'kW');

        CREATE TABLE eventsList (eventName VARCHAR NOT NULL, unit VARCHAR);
        INSERT INTO eventsList VALUES
          ('Lap', ''),
          ('Current Sector', ''),
          ('Gear', ''),
          ('ABS', ''),
          ('TC', '');

        CREATE TABLE "GPS Time" (value FLOAT);
        CREATE TABLE "Ground Speed" (value FLOAT);
        CREATE TABLE "Throttle Pos" (value FLOAT);
        CREATE TABLE "Brake Pos" (value FLOAT);
        CREATE TABLE "Steering Input" (value FLOAT);
        CREATE TABLE "Engine RPM" (value FLOAT);
        CREATE TABLE "G Force Lat" (value FLOAT);
        CREATE TABLE "G Force Long" (value FLOAT);
        CREATE TABLE "RideHeights" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "TyresPressure" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "TyresWear" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "TyresTemp" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "Brakes Temp" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "Wheel Speed" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "Fuel Level" (value FLOAT);
        CREATE TABLE "Virtual Energy" (value FLOAT);
        CREATE TABLE "SoC" (value FLOAT);
        CREATE TABLE "Regen Rate" (value FLOAT);

        CREATE TABLE "Lap" (ts DOUBLE, value INTEGER);
        CREATE TABLE "Current Sector" (ts DOUBLE, value INTEGER);
        CREATE TABLE "Gear" (ts DOUBLE, value INTEGER);
        CREATE TABLE "ABS" (ts DOUBLE, value INTEGER);
        CREATE TABLE "TC" (ts DOUBLE, value INTEGER);

        -- Lap 1 from ts=10.0 to ts=110.0 (100 seconds, 1000 samples at 100Hz)
        INSERT INTO "Lap" VALUES (10.0, 1), (110.0, 2);
        INSERT INTO "Current Sector" VALUES (10.0, 1), (40.0, 2), (75.0, 3);
        INSERT INTO "Gear" VALUES (10.0, 2), (25.0, 3), (45.0, 4), (60.0, 3);
        INSERT INTO "ABS" VALUES (35.0, 1), (37.0, 0);
        INSERT INTO "TC" VALUES (65.0, 1), (67.0, 0);

        INSERT INTO "GPS Time" SELECT (i * 0.1)::FLOAT FROM range(1200) t(i);
        INSERT INTO "Ground Speed" SELECT (50.0 + 20.0 * sin(i / 50.0))::FLOAT FROM range(1200) t(i);
        INSERT INTO "Throttle Pos" SELECT (CASE WHEN i > 200 AND i < 600 THEN 1.0 ELSE 0.0 END)::FLOAT FROM range(1200) t(i);
        INSERT INTO "Brake Pos" SELECT (CASE WHEN i >= 600 AND i < 800 THEN 0.8 ELSE 0.0 END)::FLOAT FROM range(1200) t(i);
        INSERT INTO "Steering Input" SELECT (15.0 * cos(i / 40.0))::FLOAT FROM range(1200) t(i);
        INSERT INTO "Engine RPM" SELECT (6000.0 + 1500.0 * sin(i / 30.0))::FLOAT FROM range(1200) t(i);
        INSERT INTO "G Force Lat" SELECT 1.25::FLOAT FROM range(120) t(i);
        INSERT INTO "G Force Long" SELECT -0.75::FLOAT FROM range(120) t(i);
        INSERT INTO "RideHeights" SELECT 0.025::FLOAT, 0.026::FLOAT, 0.030::FLOAT, 0.031::FLOAT FROM range(1200) t(i);
        INSERT INTO "TyresPressure" SELECT 180.0::FLOAT, 181.0::FLOAT, 185.0::FLOAT, 186.0::FLOAT FROM range(1200) t(i);
        INSERT INTO "TyresWear" SELECT 98.5::FLOAT, 98.2::FLOAT, 97.5::FLOAT, 97.3::FLOAT FROM range(1200) t(i);
        INSERT INTO "TyresTemp" SELECT 85.0::FLOAT, 86.0::FLOAT, 92.0::FLOAT, 93.0::FLOAT FROM range(1200) t(i);
        INSERT INTO "Brakes Temp" SELECT 450.0::FLOAT, 440.0::FLOAT, 380.0::FLOAT, 370.0::FLOAT FROM range(1200) t(i);
        INSERT INTO "Wheel Speed" SELECT (50.0 + 20.0 * sin(i / 50.0))::FLOAT, (50.0 + 20.0 * sin(i / 50.0))::FLOAT, (51.0 + 20.4 * sin(i / 50.0))::FLOAT, (51.0 + 20.4 * sin(i / 50.0))::FLOAT FROM range(1200) t(i);
        INSERT INTO "Fuel Level" SELECT (75.5 - (i * 0.01))::FLOAT FROM range(240) t(i);
        INSERT INTO "Virtual Energy" SELECT (95.0 - (i * 0.02))::FLOAT FROM range(240) t(i);
        INSERT INTO "SoC" SELECT (88.0)::FLOAT FROM range(240) t(i);
        INSERT INTO "Regen Rate" SELECT (120.0)::FLOAT FROM range(1200) t(i);
      `);

    db.closeSync();
    instance.closeSync();
  });

  it('shares concurrent opens, preserves bound values, and releases the file on close', async () => {
    const reader = new DuckDbReader(testDbPath);
    await Promise.all([reader.open(), reader.open(), reader.open()]);
    try {
      expect(await reader.queryAll('SELECT ?::BIGINT AS count, ?::VARCHAR AS text, ?::DOUBLE AS missing',
        [9007199254740993n, "driver's car", null])).toEqual([
        { count: 9007199254740993n, text: "driver's car", missing: null },
      ]);
      await expect(reader.queryAll('CREATE TABLE forbidden (value INTEGER)')).rejects.toThrow();
    } finally {
      await reader.close();
    }
    await reader.open();
    expect(await reader.hasTable('Lap')).toBe(true);
    await reader.close();
  });

  it('reads the fuel, VE and tread at each line crossing, each channel at its own rate', async () => {
    const reader = new DuckDbReader(testDbPath);
    await reader.open();
    try {
      const states = await reader.getLapEndStates();
      const round = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);
      // The lap counter turns 1 at 10 s and 2 at 110 s: fuel and VE at 20 Hz, the wear in percent as 0..1 tread.
      expect(states.map(state => ({ lap: state.lap, fuel: round(state.fuel), ve: round(state.ve), tread: state.tread?.map(round) }))).toEqual([
        { lap: 1, fuel: 75.3, ve: 94.6, tread: [0.985, 0.982, 0.975, 0.973] },
        { lap: 2, fuel: 73.3, ve: 90.6, tread: [0.985, 0.982, 0.975, 0.973] },
      ]);
    } finally {
      await reader.close();
    }
  });

  it('can retry opening after a missing file becomes available', async () => {
    const filename = path.join(testDbDir, 'retry.duckdb');
    const reader = new DuckDbReader(filename);
    await expect(reader.open()).rejects.toThrow();
    const instance = await DuckDBInstance.create(filename);
    instance.closeSync();
    try {
      await reader.open();
      expect(await reader.getTables()).toEqual([]);
    } finally {
      await reader.close();
    }
  });

  it('reads metadata and catalogs correctly', async () => {
    const reader = new DuckDbReader(testDbPath);
    await reader.open();

    const metadata = await reader.getMetadata();
    expect(metadata.track).toBe('Bahrain International Circuit');
    expect(metadata.driver).toBe('Samuel Lague');
    expect(metadata.car).toBe('Ferrari 499P');

    const channels = await reader.getChannelsList();
    expect(channels.length).toBe(18);
    expect(channels.find(c => c.channelName === 'Ground Speed')?.frequency).toBe(100);
    expect(channels.find(c => c.channelName === 'TyresWear')?.frequency).toBe(100);

    const events = await reader.getEventsList();
    expect(events.some(e => e.eventName === 'Lap')).toBe(true);

    await reader.close();
  });

  it('extracts lap list and slices lap telemetry', async () => {
    const reader = new DuckDbReader(testDbPath);
    await reader.open();
    const queryAll = vi.spyOn(reader, 'queryAll');

    const laps = await reader.getLapList();
    expect(laps.length).toBeGreaterThanOrEqual(1);
    expect(laps[0].lapNumber).toBe(1);
    expect(laps[0].lapTimeSec).toBe(100.0);

    const lapTelemetry = await reader.getLapTelemetry(1);
    expect(lapTelemetry).not.toBeNull();
    expect(lapTelemetry!.lapNumber).toBe(1);
    expect(lapTelemetry!.points.length).toBeGreaterThan(0);
    expect(queryAll.mock.calls.filter(([sql]) => sql === 'SELECT ts, value FROM "Lap" ORDER BY ts ASC')).toHaveLength(1);

    // Verify channel fidelity
    const p0 = lapTelemetry!.points[0];
    expect(p0.speedKmh).toBeGreaterThan(0);
    expect(p0.engineRpm).toBeGreaterThan(0);
    expect(p0.accelLatG).toBeCloseTo(-0.75, 2);
    expect(p0.accelLonG).toBeCloseTo(-1.25, 2);
    expect(p0.accelTotalG).toBeCloseTo(1.46, 2);
    expect(p0.tirePressures).toBeDefined();
    expect(p0.rideHeight).toEqual([25, 26, 30, 31]);
    expect(p0.wheelSpeeds?.[0]).toBeCloseTo(245.47, 1);
    expect(p0.wheelSpeeds?.[2]).toBeCloseTo(250.38, 1);
    expect(p0.tireWear).toBeDefined();
    expect(p0.tireWear![0]).toBeCloseTo(98.5, 1);
    expect(p0.tireTemps).toBeDefined();
    expect(p0.tireTemps![0]).toBeCloseTo(85.0, 1);
    expect(p0.brakeTemps).toBeDefined();
    expect(p0.brakeTemps![0]).toBeCloseTo(450.0, 1);
    expect(p0.fuel).toBeCloseTo(75.3, 1);
    expect(p0.virtualEnergy).toBeCloseTo(94.6, 1);
    expect(p0.soc).toBeCloseTo(88.0, 1);
    expect(p0.regenRate).toBeCloseTo(120.0, 1);

    await reader.close();
  });

  it('retries a lap list query after a transient failure', async () => {
    const reader = new DuckDbReader(testDbPath);
    await reader.open();
    const queryAll = reader.queryAll.bind(reader);
    let failLapQuery = true;
    vi.spyOn(reader, 'queryAll').mockImplementation(async <T>(sql: string, params: DuckDBValue[] = []) => {
      if (sql === 'SELECT ts, value FROM "Lap" ORDER BY ts ASC' && failLapQuery) {
        failLapQuery = false;
        throw new Error('transient DuckDB read failure');
      }
      return queryAll<T>(sql, params);
    });

    await expect(reader.getLapList()).rejects.toThrow('transient DuckDB read failure');
    expect(await reader.getLapList()).toHaveLength(1);

    await reader.close();
  });

  it('preserves overlapping sector windows, first transitions and missing sectors across laps', async () => {
    const reader = new DuckDbReader('unused.duckdb');
    vi.spyOn(reader, 'hasTable').mockImplementation(async name => name === 'Lap' || name === 'Current Sector');
    vi.spyOn(reader, 'queryAll')
      .mockResolvedValueOnce([
        { ts: 0, value: 1 }, { ts: 5, value: 1 }, { ts: 10, value: 2 },
        { ts: 20, value: 3 }, { ts: 30, value: 4 }, { ts: 40, value: 5 },
      ])
      .mockResolvedValueOnce([
        { ts: -1, value: 2 }, { ts: 0, value: 2 },
        { ts: 3, value: 2 }, { ts: 4, value: 2 },
        { ts: 10.02, value: 2 }, { ts: 10.04, value: 3 },
        { ts: 25, value: 3 },
        { ts: 33, value: 2 }, { ts: 37, value: 3 },
      ]);
    expect(await reader.getLapList()).toEqual([
      { lapNumber: 1, startTs: 0, endTs: 10, lapTimeSec: 10, s1Sec: 3, s2Sec: 7.04, s3Sec: -0.04 },
      { lapNumber: 2, startTs: 10, endTs: 20, lapTimeSec: 10, s1Sec: 0.02, s2Sec: 0.02, s3Sec: 9.96 },
      { lapNumber: 3, startTs: 20, endTs: 30, lapTimeSec: 10, s1Sec: undefined, s2Sec: undefined, s3Sec: undefined },
      { lapNumber: 4, startTs: 30, endTs: 40, lapTimeSec: 10, s1Sec: 3, s2Sec: 4, s3Sec: 3 },
    ]);
    vi.restoreAllMocks();
  });

  it('supports continuous TC channel, hasColumn detection, and lap time alignment', async () => {
    const multiRateDbPath = path.join(testDbDir, 'MultiRate_Test.duckdb');

    const instance = await DuckDBInstance.create(multiRateDbPath);
    const db = await instance.connect();
    await db.run(`
        CREATE TABLE channelsList (channelName VARCHAR NOT NULL, frequency INTEGER, unit VARCHAR);
        INSERT INTO channelsList VALUES
          ('GPS Time', 100, 's'),
          ('Ground Speed', 100, 'km/h'),
          ('Throttle Pos', 50, '%'),
          ('Brake Pos', 50, '%'),
          ('Steering Pos', 100, '%'),
          ('TC', 100, ''),
          ('TyresPressure', 10, 'kPa');

        CREATE TABLE "GPS Time" (value FLOAT);
        CREATE TABLE "Ground Speed" (value FLOAT);
        CREATE TABLE "Throttle Pos" (value FLOAT);
        CREATE TABLE "Brake Pos" (value FLOAT);
        CREATE TABLE "Steering Pos" (value FLOAT);
        CREATE TABLE "TC" (value BOOLEAN);
        CREATE TABLE "TyresPressure" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);

        CREATE TABLE "Lap" (ts DOUBLE, value INTEGER);
        -- Lap 0: Outlap ts=0 to ts=100 (100s)
        -- Lap 1: Flying lap ts=100 to ts=200 (100s, lapTime=100.0)
        INSERT INTO "Lap" VALUES (0.0, 0), (100.0, 1), (200.0, 2);

        -- 100Hz channels: 2000 points (from 0 to 200s)
        INSERT INTO "GPS Time" SELECT (i * 0.1)::FLOAT FROM range(2000) t(i);
        INSERT INTO "Ground Speed" SELECT (150.0)::FLOAT FROM range(2000) t(i);
        INSERT INTO "Steering Pos" SELECT (-2.5)::FLOAT FROM range(2000) t(i);
        INSERT INTO "TC" SELECT (i % 200 < 50)::BOOLEAN FROM range(2000) t(i);

        -- 50Hz channels: 1000 points (from 0 to 200s)
        INSERT INTO "Throttle Pos" SELECT (100.0)::FLOAT FROM range(1000) t(i);
        INSERT INTO "Brake Pos" SELECT (0.0)::FLOAT FROM range(1000) t(i);

        -- 10Hz channel: 200 points (from 0 to 200s)
        INSERT INTO "TyresPressure" SELECT 175.0::FLOAT, 175.0::FLOAT, 175.0::FLOAT, 175.0::FLOAT FROM range(200) t(i);
      `);

    db.closeSync();
    instance.closeSync();

    const reader = new DuckDbReader(multiRateDbPath);
    await reader.open();

    expect(await reader.hasColumn('TC', 'value')).toBe(true);
    expect(await reader.hasColumn('TC', 'ts')).toBe(false);

    const laps = await reader.getLapList();
    expect(laps.length).toBe(2);
    expect(laps[0].lapNumber).toBe(0);
    expect(laps[1].lapNumber).toBe(1);

    // Test lap alignment: requesting VCR Lap 2 with lapTime=100s should align to DuckDB Lap 1
    const lapTelemetry = await reader.getLapTelemetry(2, 100.0);
    expect(lapTelemetry).not.toBeNull();
    expect(lapTelemetry!.points.length).toBeGreaterThan(0);
    expect(lapTelemetry!.points[0].throttle).toBe(100);
    // LMU's Steering Pos -2.5% is to the left, positive under ISO 8855.
    expect(lapTelemetry!.points[0].steerYaw).toBe(0.025);
    expect(lapTelemetry!.signConvention).toBe('iso8855');
    expect(lapTelemetry!.points[0].tirePressures).toBeDefined();
    expect(lapTelemetry!.points[0].tirePressures![0]).toBe(175);
    expect(typeof lapTelemetry!.points[0].tcActive).toBe('boolean');

    await reader.close();
  });

  it('keeps a percent pedal in percent while it passes through 0-1 %', async () => {
    // LMU stores pedals in percent. Deciding the scale per sample turned 0.8 % into 80 %: a spike
    // each time the brake was pressed or released (Le Mans R1 41, 2026-09-25).
    const percentDbPath = path.join(testDbDir, 'Sarthe_Percent_R_2026-09-25T16_59_48Z.duckdb');
    const instance = await DuckDBInstance.create(percentDbPath);
    const db = await instance.connect();
    await db.run(`
        CREATE TABLE channelsList (channelName VARCHAR NOT NULL, frequency INTEGER, unit VARCHAR);
        INSERT INTO channelsList VALUES ('GPS Time', 100, 's'), ('Ground Speed', 100, 'km/h'),
          ('Throttle Pos', 100, '%'), ('Brake Pos', 100, '%');
        CREATE TABLE "GPS Time" (value FLOAT);
        CREATE TABLE "Ground Speed" (value FLOAT);
        CREATE TABLE "Throttle Pos" (value FLOAT);
        CREATE TABLE "Brake Pos" (value FLOAT);
        CREATE TABLE "Lap" (ts DOUBLE, value INTEGER);
        INSERT INTO "Lap" VALUES (0.0, 1), (10.0, 2);
        INSERT INTO "GPS Time" SELECT (i * 0.01)::FLOAT FROM range(1100) t(i);
        INSERT INTO "Ground Speed" SELECT 200.0::FLOAT FROM range(1100) t(i);
        -- Brake: 0, a press through 0.4 and 0.8 %, then 100 %, then a release through 0.8 %.
        INSERT INTO "Brake Pos" SELECT (CASE WHEN i = 300 THEN 0.4 WHEN i = 301 THEN 0.8 WHEN i > 301 AND i < 500 THEN 100.0 WHEN i = 500 THEN 0.8 ELSE 0.0 END)::FLOAT FROM range(1100) t(i);
        INSERT INTO "Throttle Pos" SELECT (CASE WHEN i < 300 THEN 100.0 WHEN i = 600 THEN 0.7 WHEN i > 600 THEN 100.0 ELSE 0.0 END)::FLOAT FROM range(1100) t(i);
      `);
    db.closeSync();
    instance.closeSync();

    const reader = new DuckDbReader(percentDbPath);
    await reader.open();
    const lap = await reader.getLapTelemetry(1);
    await reader.close();

    const brakeAt = (index: number) => lap!.points[index].brake;
    expect([brakeAt(300), brakeAt(301), brakeAt(302), brakeAt(500)]).toEqual([
      expect.closeTo(0.4, 3), expect.closeTo(0.8, 3), 100, expect.closeTo(0.8, 3),
    ]);
    expect(lap!.points[600].throttle).toBeCloseTo(0.7, 3);
    expect(Math.max(...lap!.points.filter((_, index) => index < 300 || index >= 500).map(point => point.brake ?? 0))).toBeLessThan(1);
  });

  it('starts a lap in the gear of the last shift before it, however long ago', async () => {
    // At Daytona the last upshift to 7th is well before the line down the banking; looking back
    // only 5 s found no shift and every lap started in gear 1 at 318 km/h (R1 10, 2026-09-25).
    const gearDbPath = path.join(testDbDir, 'Daytona_Gear_R_2026-09-25T22_42_51Z.duckdb');
    const instance = await DuckDBInstance.create(gearDbPath);
    const db = await instance.connect();
    await db.run(`
        CREATE TABLE channelsList (channelName VARCHAR NOT NULL, frequency INTEGER, unit VARCHAR);
        INSERT INTO channelsList VALUES ('GPS Time', 100, 's'), ('Ground Speed', 100, 'km/h');
        CREATE TABLE "GPS Time" (value FLOAT);
        CREATE TABLE "Ground Speed" (value FLOAT);
        CREATE TABLE "Lap" (ts DOUBLE, value INTEGER);
        CREATE TABLE "Gear" (ts DOUBLE, value INTEGER);
        CREATE TABLE "ABS" (ts DOUBLE, value INTEGER);
        INSERT INTO "Lap" VALUES (0.0, 1), (30.0, 2), (60.0, 3);
        -- Up to 7th at 12 s, 18 s before lap 2 starts; down to 6th 5 s into lap 2.
        INSERT INTO "Gear" VALUES (0.0, 5), (6.0, 6), (12.0, 7), (35.0, 6);
        -- ABS switched on 10 s before lap 2 and still on at its start.
        INSERT INTO "ABS" VALUES (20.0, 1), (31.0, 0);
        INSERT INTO "GPS Time" SELECT (i * 0.01)::FLOAT FROM range(6100) t(i);
        INSERT INTO "Ground Speed" SELECT 318.0::FLOAT FROM range(6100) t(i);
      `);
    db.closeSync();
    instance.closeSync();

    const reader = new DuckDbReader(gearDbPath);
    await reader.open();
    const lap = await reader.getLapTelemetry(2);
    await reader.close();

    const points = lap!.points;
    expect(points[0].gear).toBe(7);
    expect(points[0].absActive).toBe(true);
    expect(points[100].absActive).toBe(false);
    expect(points[499].gear).toBe(7);
    expect(points[501].gear).toBe(6);
  });

  it.each([
    { name: 'duplicate and regressing timestamps', gps: [0, 10, 10, 9, 15, 20, 12, 25], start: 10,
      indices: [1, 2, 3, 4, 5], times: [0, 0, 0, 5, 10] },
    { name: 'truncated timeline', gps: [0, 10, 10, 9, 15], start: 10,
      indices: [1, 2, 3, 4], times: [0, 0, 0, 5] },
    { name: 'unreachable start', gps: [0, 1, 2], start: 10,
      indices: [0, 1, 2], times: [0, 0, 0] },
    { name: 'null timestamp at zero', gps: [null, 10, 20], start: 0,
      indices: [0, 1, 2], times: [0, 10, 20] },
    { name: 'NaN inside the lap', gps: [10, NaN, 20], start: 10,
      indices: [0, 1, 2], times: [0, NaN, 10] },
    { name: 'missing timeline', gps: null, start: 10,
      indices: Array.from({ length: 101 }, (_, i) => 100 + i), times: Array.from({ length: 101 }, (_, i) => i / 10) },
    { name: 'empty timeline', gps: [], start: 10,
      indices: Array.from({ length: 101 }, (_, i) => 100 + i), times: Array.from({ length: 101 }, (_, i) => i / 10) },
  ])('preserves channel indices with $name', async ({ name, gps, start, indices, times }) => {
    const filePath = path.join(testDbDir, `${name}.duckdb`);
    const instance = await DuckDBInstance.create(filePath);
    const db = await instance.connect();
    const timelineSql = gps === null ? '' : `CREATE TABLE "GPS Time" (value FLOAT); ${gps.length
      ? `INSERT INTO "GPS Time" VALUES ${gps.map(value => `(${value === null ? 'NULL' : Number.isNaN(value) ? "'NaN'::FLOAT" : value})`).join(',')};` : ''}`;
    try {
      await db.run(`
        CREATE TABLE channelsList (channelName VARCHAR, frequency INTEGER, unit VARCHAR);
        INSERT INTO channelsList VALUES ('Ground Speed', 10, 'km/h'), ('Wheel Speed', 5, 'km/h');
        CREATE TABLE "Ground Speed" AS SELECT (100 + i)::FLOAT AS value FROM range(300) t(i);
        CREATE TABLE "Wheel Speed" AS SELECT (10 + i)::FLOAT AS value1, (20 + i)::FLOAT AS value2,
          (30 + i)::FLOAT AS value3, (40 + i)::FLOAT AS value4 FROM range(150) t(i);
        CREATE TABLE "Lap" (ts DOUBLE, value INTEGER);
        INSERT INTO "Lap" VALUES (${start}, 1), (20, 2);
        CREATE TABLE "Gear" (ts DOUBLE, value INTEGER);
        INSERT INTO "Gear" VALUES (-10, 7), (12, 6);
        ${timelineSql}
      `);
    } finally {
      db.closeSync();
      instance.closeSync();
    }
    const reader = new DuckDbReader(filePath);
    try {
      const actualQuery = reader.queryAll.bind(reader);
      let returnedGpsRows = 0;
      vi.spyOn(reader, 'queryAll').mockImplementation(async <T>(sql: string, params: DuckDBValue[] = []) => {
        const rows = await actualQuery<T>(sql, params);
        if (sql.includes('FROM "GPS Time"')) returnedGpsRows += rows.length;
        return rows;
      });
      const lap = await reader.getLapTelemetry(1);
      expect(lap?.points.map(point => point.speedKmh)).toEqual(indices.map(i => 100 + i));
      expect(lap?.points.map(point => point.timeSec)).toEqual(times);
      expect(lap?.points.map(point => point.wheelSpeeds)).toEqual(indices.map((_, i) => {
        const offset = Math.floor(indices[0] / 2) + Math.floor(i / 2);
        return [10 + offset, 20 + offset, 30 + offset, 40 + offset];
      }));
      expect(lap?.points[0].gear).toBe(7);
      expect(returnedGpsRows).toBeLessThanOrEqual(indices.length + 2);
    } finally { await reader.close(); }
  });

  afterAll(() => removeQuietly(testDbDir));
});
