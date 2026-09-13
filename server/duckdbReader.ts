import duckdb from 'duckdb';
import {
  DuckDbChannelEntry,
  DuckDbEventEntry,
  DuckDbLapSummary,
  DuckDbLapTelemetry,
  ReplayTrajectoryPoint,
} from './types.js';

export interface DuckDbSessionMetadata {
  trackName?: string;
  sessionType?: string;
  driverName?: string;
  carName?: string;
  startTime?: string;
  [key: string]: string | undefined;
}

export class DuckDbReader {
  private db: duckdb.Database | null = null;
  private filePath: string;
  private cachedTables: string[] | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async open(): Promise<void> {
    if (this.db) return;
    await new Promise<void>((resolve, reject) => {
      this.db = new duckdb.Database(this.filePath, duckdb.OPEN_READONLY, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async close(): Promise<void> {
    if (!this.db) return;
    await new Promise<void>((resolve, reject) => {
      this.db!.close((err) => {
        this.db = null;
        this.cachedTables = null;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async queryAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.db) {
      await this.open();
    }
    return new Promise<T[]>((resolve, reject) => {
      this.db!.all(sql, ...params, (err: Error | null, rows: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve((rows as T[]) || []);
        }
      });
    });
  }

  public async getTables(): Promise<string[]> {
    if (this.cachedTables) return this.cachedTables;
    const rows = await this.queryAll<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'`
    );
    this.cachedTables = rows.map((r) => r.table_name);
    return this.cachedTables;
  }

  public async hasTable(tableName: string): Promise<boolean> {
    const tables = await this.getTables();
    return tables.some((t) => t.toLowerCase() === tableName.toLowerCase());
  }

  public async getMetadata(): Promise<DuckDbSessionMetadata> {
    if (!(await this.hasTable('metadata'))) {
      return {};
    }
    const rows = await this.queryAll<{ key: string; value: string }>(
      'SELECT key, value FROM metadata ORDER BY key'
    );
    const result: DuckDbSessionMetadata = {};
    for (const r of rows) {
      result[r.key] = r.value;
      const lowerKey = r.key.toLowerCase();
      if (lowerKey.includes('track')) result.trackName = r.value;
      if (lowerKey.includes('session')) result.sessionType = r.value;
      if (lowerKey.includes('driver')) result.driverName = r.value;
      if (lowerKey.includes('car')) result.carName = r.value;
      if (lowerKey.includes('start') || lowerKey.includes('time')) result.startTime = r.value;
    }
    return result;
  }

  public async getChannelsList(): Promise<DuckDbChannelEntry[]> {
    if (!(await this.hasTable('channelsList'))) {
      return [];
    }
    return this.queryAll<DuckDbChannelEntry>(
      'SELECT channelName, frequency, unit FROM channelsList ORDER BY channelName'
    );
  }

  public async getEventsList(): Promise<DuckDbEventEntry[]> {
    if (!(await this.hasTable('eventsList'))) {
      return [];
    }
    return this.queryAll<DuckDbEventEntry>(
      'SELECT eventName, unit FROM eventsList ORDER BY eventName'
    );
  }

  public async getLapList(): Promise<DuckDbLapSummary[]> {
    if (!(await this.hasTable('Lap'))) {
      return [];
    }

    const lapEvents = await this.queryAll<{ ts: number; value: number }>(
      'SELECT ts, value FROM "Lap" ORDER BY ts ASC'
    );
    if (lapEvents.length === 0) return [];

    let sectorEvents: Array<{ ts: number; value: number }> = [];
    if (await this.hasTable('Current Sector')) {
      sectorEvents = await this.queryAll<{ ts: number; value: number }>(
        'SELECT ts, value FROM "Current Sector" ORDER BY ts ASC'
      );
    }

    const summaries: DuckDbLapSummary[] = [];

    for (let i = 0; i < lapEvents.length; i++) {
      const current = lapEvents[i];
      const next = lapEvents[i + 1];
      if (!next) break;

      const startTs = current.ts;
      const endTs = next.ts;
      const lapTimeSec = parseFloat((endTs - startTs).toFixed(3));
      if (lapTimeSec <= 0) continue;

      // Extract sectors for this lap window
      const lapSectors = sectorEvents.filter((s) => s.ts >= startTs - 0.05 && s.ts <= endTs + 0.05);
      const s2Event = lapSectors.find((s) => s.value === 2 && s.ts > startTs);
      const s3Event = lapSectors.find((s) => s.value === 3 && s.ts > (s2Event?.ts || startTs));

      let s1Sec: number | undefined;
      let s2Sec: number | undefined;
      let s3Sec: number | undefined;

      if (s2Event && s3Event) {
        s1Sec = parseFloat((s2Event.ts - startTs).toFixed(3));
        s2Sec = parseFloat((s3Event.ts - s2Event.ts).toFixed(3));
        s3Sec = parseFloat((endTs - s3Event.ts).toFixed(3));
      }

      summaries.push({
        lapNumber: current.value,
        startTs,
        endTs,
        lapTimeSec,
        s1Sec,
        s2Sec,
        s3Sec,
      });
    }

    return summaries;
  }

  public async getLapTelemetry(lapNumber: number): Promise<DuckDbLapTelemetry | null> {
    const laps = await this.getLapList();
    const targetLap = laps.find((l) => l.lapNumber === lapNumber);
    if (!targetLap) return null;

    const { startTs, endTs, lapTimeSec } = targetLap;

    // Determine sampling frequency and timeline
    const channels = await this.getChannelsList();
    const speedChannel = channels.find((c) => c.channelName.toLowerCase() === 'ground speed');
    const declaredHz = speedChannel?.frequency || 100;

    const hasGpsTime = await this.hasTable('GPS Time');
    let gpsTimes: number[] = [];
    if (hasGpsTime) {
      const rows = await this.queryAll<{ value: number }>('SELECT value FROM "GPS Time"');
      gpsTimes = rows.map((r) => r.value);
    }

    // Determine index range [startIdx, endIdx]
    let startIdx = 0;
    let endIdx = 0;

    if (gpsTimes.length > 0) {
      startIdx = gpsTimes.findIndex((t) => t >= startTs);
      if (startIdx === -1) startIdx = 0;
      endIdx = gpsTimes.findIndex((t) => t >= endTs);
      if (endIdx === -1) endIdx = gpsTimes.length - 1;
    } else {
      startIdx = Math.max(0, Math.floor(startTs * declaredHz));
      endIdx = Math.max(startIdx, Math.floor(endTs * declaredHz));
    }

    const rowCount = endIdx - startIdx + 1;
    if (rowCount <= 0) return null;

    // Fetch continuous channels with OFFSET and LIMIT
    const hasSpeed = await this.hasTable('Ground Speed');
    const hasThrottle = await this.hasTable('Throttle Pos');
    const hasBrake = await this.hasTable('Brake Pos');
    const hasSteering = await this.hasTable('Steering Input');
    const hasRpm = await this.hasTable('Engine RPM');
    const hasSusp = await this.hasTable('Susp Pos');
    const hasPressure = await this.hasTable('TyresPressure');
    const hasWheelSpeed = await this.hasTable('Wheel Speed');
    const brakeTempTable = (await this.hasTable('Brakes Temp'))
      ? 'Brakes Temp'
      : (await this.hasTable('Brake Temp'))
      ? 'Brake Temp'
      : null;

    const tireWearTable = (await this.hasTable('TyresWear'))
      ? 'TyresWear'
      : (await this.hasTable('Tyre Wear'))
      ? 'Tyre Wear'
      : (await this.hasTable('Tyres Wear'))
      ? 'Tyres Wear'
      : (await this.hasTable('Tire Wear'))
      ? 'Tire Wear'
      : null;

    const tireTempTable = (await this.hasTable('TyresTemp'))
      ? 'TyresTemp'
      : (await this.hasTable('Tyre Temp'))
      ? 'Tyre Temp'
      : (await this.hasTable('Tyres Temp'))
      ? 'Tyres Temp'
      : (await this.hasTable('Tire Temp'))
      ? 'Tire Temp'
      : null;

    const [
      speedRows,
      throttleRows,
      brakeRows,
      steerRows,
      rpmRows,
      suspRows,
      pressureRows,
      wheelSpeedRows,
      brakeTempRows,
      tireWearRows,
      tireTempRows,
    ] = await Promise.all([
      hasSpeed
        ? this.queryAll<{ value: number }>(`SELECT value FROM "Ground Speed" LIMIT ${rowCount} OFFSET ${startIdx}`)
        : Promise.resolve([]),
      hasThrottle
        ? this.queryAll<{ value: number }>(`SELECT value FROM "Throttle Pos" LIMIT ${rowCount} OFFSET ${startIdx}`)
        : Promise.resolve([]),
      hasBrake
        ? this.queryAll<{ value: number }>(`SELECT value FROM "Brake Pos" LIMIT ${rowCount} OFFSET ${startIdx}`)
        : Promise.resolve([]),
      hasSteering
        ? this.queryAll<{ value: number }>(`SELECT value FROM "Steering Input" LIMIT ${rowCount} OFFSET ${startIdx}`)
        : Promise.resolve([]),
      hasRpm
        ? this.queryAll<{ value: number }>(`SELECT value FROM "Engine RPM" LIMIT ${rowCount} OFFSET ${startIdx}`)
        : Promise.resolve([]),
      hasSusp
        ? this.queryAll<{ value1: number; value2: number; value3: number; value4: number }>(
            `SELECT value1, value2, value3, value4 FROM "Susp Pos" LIMIT ${rowCount} OFFSET ${startIdx}`
          )
        : Promise.resolve([]),
      hasPressure
        ? this.queryAll<{ value1: number; value2: number; value3: number; value4: number }>(
            `SELECT value1, value2, value3, value4 FROM "TyresPressure" LIMIT ${rowCount} OFFSET ${startIdx}`
          )
        : Promise.resolve([]),
      hasWheelSpeed
        ? this.queryAll<{ value1: number; value2: number; value3: number; value4: number }>(
            `SELECT value1, value2, value3, value4 FROM "Wheel Speed" LIMIT ${rowCount} OFFSET ${startIdx}`
          )
        : Promise.resolve([]),
      brakeTempTable
        ? this.queryAll<{ value1: number; value2: number; value3: number; value4: number }>(
            `SELECT value1, value2, value3, value4 FROM "${brakeTempTable}" LIMIT ${rowCount} OFFSET ${startIdx}`
          )
        : Promise.resolve([]),
      tireWearTable
        ? this.queryAll<{ value1: number; value2: number; value3: number; value4: number }>(
            `SELECT value1, value2, value3, value4 FROM "${tireWearTable}" LIMIT ${rowCount} OFFSET ${startIdx}`
          )
        : Promise.resolve([]),
      tireTempTable
        ? this.queryAll<{ value1: number; value2: number; value3: number; value4: number }>(
            `SELECT value1, value2, value3, value4 FROM "${tireTempTable}" LIMIT ${rowCount} OFFSET ${startIdx}`
          )
        : Promise.resolve([]),
    ]);

    // Fetch sparse event tables for this lap
    const [gearEvents, absEvents, tcEvents] = await Promise.all([
      (await this.hasTable('Gear'))
        ? this.queryAll<{ ts: number; value: number }>(
            `SELECT ts, value FROM "Gear" WHERE ts >= ${startTs - 5} AND ts <= ${endTs + 5} ORDER BY ts ASC`
          )
        : Promise.resolve([]),
      (await this.hasTable('ABS'))
        ? this.queryAll<{ ts: number; value: number }>(
            `SELECT ts, value FROM "ABS" WHERE ts >= ${startTs - 1} AND ts <= ${endTs + 1} ORDER BY ts ASC`
          )
        : Promise.resolve([]),
      (await this.hasTable('TC'))
        ? this.queryAll<{ ts: number; value: number }>(
            `SELECT ts, value FROM "TC" WHERE ts >= ${startTs - 1} AND ts <= ${endTs + 1} ORDER BY ts ASC`
          )
        : Promise.resolve([]),
    ]);

    const points: ReplayTrajectoryPoint[] = [];
    let cumulativeDistM = 0;
    const dt = 1.0 / declaredHz;

    let gearEventIdx = 0;
    let absEventIdx = 0;
    let tcEventIdx = 0;

    let currentGear = 1;
    let currentAbs = false;
    let currentTc = false;

    // Find initial state of discrete events at startTs
    for (const g of gearEvents) {
      if (g.ts <= startTs) currentGear = g.value;
      else break;
    }
    for (const a of absEvents) {
      if (a.ts <= startTs) currentAbs = a.value > 0;
      else break;
    }
    for (const t of tcEvents) {
      if (t.ts <= startTs) currentTc = t.value > 0;
      else break;
    }

    for (let i = 0; i < rowCount; i++) {
      const globalIdx = startIdx + i;
      const pointTime = gpsTimes.length > globalIdx ? gpsTimes[globalIdx] : startTs + i * dt;
      const lapElapsedSec = Math.max(0, pointTime - startTs);

      // Advance discrete event states
      while (gearEventIdx < gearEvents.length && gearEvents[gearEventIdx].ts <= pointTime) {
        currentGear = gearEvents[gearEventIdx].value;
        gearEventIdx++;
      }
      while (absEventIdx < absEvents.length && absEvents[absEventIdx].ts <= pointTime) {
        currentAbs = absEvents[absEventIdx].value > 0;
        absEventIdx++;
      }
      while (tcEventIdx < tcEvents.length && tcEvents[tcEventIdx].ts <= pointTime) {
        currentTc = tcEvents[tcEventIdx].value > 0;
        tcEventIdx++;
      }

      // Read raw values
      const rawSpeed = speedRows[i]?.value ?? 0;
      // If speed is in m/s (typical in LMU physics engine), convert to km/h if rawSpeed < 120 (max speed in m/s is ~100m/s = 360km/h)
      // If already km/h (> 120 or declared unit), handle accordingly
      const speedUnit = speedChannel?.unit?.toLowerCase() || 'm/s';
      const speedKmh = speedUnit.includes('km') ? rawSpeed : rawSpeed * 3.6;
      const speedMs = speedUnit.includes('km') ? rawSpeed / 3.6 : rawSpeed;

      if (i > 0) {
        cumulativeDistM += speedMs * dt;
      }

      const rawThrottle = throttleRows[i]?.value ?? 0;
      const throttle = rawThrottle <= 1.01 ? rawThrottle * 100 : rawThrottle;

      const rawBrake = brakeRows[i]?.value ?? 0;
      const brake = rawBrake <= 1.01 ? rawBrake * 100 : rawBrake;

      const steerYaw = steerRows[i]?.value ?? 0;
      const engineRpm = rpmRows[i]?.value ?? 0;

      const suspPos: [number, number, number, number] | undefined = suspRows[i]
        ? [suspRows[i].value1, suspRows[i].value2, suspRows[i].value3, suspRows[i].value4]
        : undefined;

      const tirePressures: [number, number, number, number] | undefined = pressureRows[i]
        ? [pressureRows[i].value1, pressureRows[i].value2, pressureRows[i].value3, pressureRows[i].value4]
        : undefined;

      const wheelSpeeds: [number, number, number, number] | undefined = wheelSpeedRows[i]
        ? [
            speedUnit.includes('km') ? wheelSpeedRows[i].value1 : wheelSpeedRows[i].value1 * 3.6,
            speedUnit.includes('km') ? wheelSpeedRows[i].value2 : wheelSpeedRows[i].value2 * 3.6,
            speedUnit.includes('km') ? wheelSpeedRows[i].value3 : wheelSpeedRows[i].value3 * 3.6,
            speedUnit.includes('km') ? wheelSpeedRows[i].value4 : wheelSpeedRows[i].value4 * 3.6,
          ]
        : undefined;

      const brakeTemps: [number, number, number, number] | undefined = brakeTempRows[i]
        ? [
            Math.round(brakeTempRows[i].value1),
            Math.round(brakeTempRows[i].value2),
            Math.round(brakeTempRows[i].value3),
            Math.round(brakeTempRows[i].value4),
          ]
        : undefined;

      const tireWear: [number, number, number, number] | undefined = tireWearRows[i]
        ? [
            tireWearRows[i].value1 <= 1.01 ? parseFloat((tireWearRows[i].value1 * 100).toFixed(1)) : parseFloat(tireWearRows[i].value1.toFixed(1)),
            tireWearRows[i].value2 <= 1.01 ? parseFloat((tireWearRows[i].value2 * 100).toFixed(1)) : parseFloat(tireWearRows[i].value2.toFixed(1)),
            tireWearRows[i].value3 <= 1.01 ? parseFloat((tireWearRows[i].value3 * 100).toFixed(1)) : parseFloat(tireWearRows[i].value3.toFixed(1)),
            tireWearRows[i].value4 <= 1.01 ? parseFloat((tireWearRows[i].value4 * 100).toFixed(1)) : parseFloat(tireWearRows[i].value4.toFixed(1)),
          ]
        : undefined;

      const tireTemps: [number, number, number, number] | undefined = tireTempRows[i]
        ? [
            Math.round(tireTempRows[i].value1),
            Math.round(tireTempRows[i].value2),
            Math.round(tireTempRows[i].value3),
            Math.round(tireTempRows[i].value4),
          ]
        : undefined;

      points.push({
        x: 0,
        y: 0,
        z: 0,
        timeSec: parseFloat(lapElapsedSec.toFixed(3)),
        distM: parseFloat(cumulativeDistM.toFixed(1)),
        speedKmh: parseFloat(speedKmh.toFixed(1)),
        throttle: parseFloat(throttle.toFixed(1)),
        brake: parseFloat(brake.toFixed(1)),
        steerYaw: parseFloat(steerYaw.toFixed(2)),
        gear: currentGear,
        absActive: currentAbs,
        tcActive: currentTc,
        engineRpm: Math.round(engineRpm),
        suspPos,
        tirePressures,
        wheelSpeeds,
        brakeTemps,
        tireWear,
        tireTemps,
      });
    }

    return {
      lapNumber,
      lapTimeSec,
      pointsCount: points.length,
      sampleRateHz: declaredHz,
      points,
    };
  }
}
