import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';
import { DuckDbReader } from '../../server/duckdbReader.js';

describe('DuckDbReader', () => {
  const testDbDir = path.join(process.cwd(), 'test', 'fixtures', 'telemetry');
  const testDbPath = path.join(testDbDir, 'Bahrain_Test_P_2026-09-13T20_33_32Z.duckdb');

  beforeAll(async () => {
    fs.mkdirSync(testDbDir, { recursive: true });
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create fixture DuckDB file with representative schema
    const db = new duckdb.Database(testDbPath);
    await new Promise<void>((resolve, reject) => {
      db.exec(`
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
          ('Susp Pos', 100, 'mm'),
          ('TyresPressure', 100, 'kPa'),
          ('TyresWear', 100, '%'),
          ('TyresTemp', 100, 'C'),
          ('Brakes Temp', 100, 'C'),
          ('Wheel Speed', 100, 'm/s');

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
        CREATE TABLE "Susp Pos" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "TyresPressure" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "TyresWear" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "TyresTemp" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "Brakes Temp" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);
        CREATE TABLE "Wheel Speed" (value1 FLOAT, value2 FLOAT, value3 FLOAT, value4 FLOAT);

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
        INSERT INTO "Susp Pos" SELECT 25.0::FLOAT, 26.0::FLOAT, 30.0::FLOAT, 31.0::FLOAT FROM range(1200) t(i);
        INSERT INTO "TyresPressure" SELECT 180.0::FLOAT, 181.0::FLOAT, 185.0::FLOAT, 186.0::FLOAT FROM range(1200) t(i);
        INSERT INTO "TyresWear" SELECT 98.5::FLOAT, 98.2::FLOAT, 97.5::FLOAT, 97.3::FLOAT FROM range(1200) t(i);
        INSERT INTO "TyresTemp" SELECT 85.0::FLOAT, 86.0::FLOAT, 92.0::FLOAT, 93.0::FLOAT FROM range(1200) t(i);
        INSERT INTO "Brakes Temp" SELECT 450.0::FLOAT, 440.0::FLOAT, 380.0::FLOAT, 370.0::FLOAT FROM range(1200) t(i);
        INSERT INTO "Wheel Speed" SELECT (50.0 + 20.0 * sin(i / 50.0))::FLOAT, (50.0 + 20.0 * sin(i / 50.0))::FLOAT, (51.0 + 20.4 * sin(i / 50.0))::FLOAT, (51.0 + 20.4 * sin(i / 50.0))::FLOAT FROM range(1200) t(i);
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {
        // ignore
      }
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
    expect(channels.length).toBe(12);
    expect(channels.find(c => c.channelName === 'Ground Speed')?.frequency).toBe(100);
    expect(channels.find(c => c.channelName === 'TyresWear')?.frequency).toBe(100);

    const events = await reader.getEventsList();
    expect(events.some(e => e.eventName === 'Lap')).toBe(true);

    await reader.close();
  });

  it('extracts lap list and slices lap telemetry', async () => {
    const reader = new DuckDbReader(testDbPath);
    await reader.open();

    const laps = await reader.getLapList();
    expect(laps.length).toBeGreaterThanOrEqual(1);
    expect(laps[0].lapNumber).toBe(1);
    expect(laps[0].lapTimeSec).toBe(100.0);

    const lapTelemetry = await reader.getLapTelemetry(1);
    expect(lapTelemetry).not.toBeNull();
    expect(lapTelemetry!.lapNumber).toBe(1);
    expect(lapTelemetry!.points.length).toBeGreaterThan(0);

    // Verify channel fidelity
    const p0 = lapTelemetry!.points[0];
    expect(p0.speedKmh).toBeGreaterThan(0);
    expect(p0.engineRpm).toBeGreaterThan(0);
    expect(p0.tirePressures).toBeDefined();
    expect(p0.suspPos).toBeDefined();
    expect(p0.wheelSpeeds).toBeDefined();
    expect(p0.tireWear).toBeDefined();
    expect(p0.tireWear![0]).toBeCloseTo(98.5, 1);
    expect(p0.tireTemps).toBeDefined();
    expect(p0.tireTemps![0]).toBeCloseTo(85.0, 1);
    expect(p0.brakeTemps).toBeDefined();
    expect(p0.brakeTemps![0]).toBeCloseTo(450.0, 1);

    await reader.close();
  });
});
