import duckdb from 'duckdb';
import {
  DuckDbChannelEntry,
  DuckDbEventEntry,
  DuckDbLapSummary,
  DuckDbLapTelemetry,
  ReplayTrajectoryPoint,
} from '../core/types.js';

export interface DuckDbSessionMetadata {
  trackName?: string;
  sessionType?: string;
  driverName?: string;
  carName?: string;
  startTime?: string;
  [key: string]: string | undefined;
}

/**
 * Maps LMU's exported G-force labels and signs to the application's canonical vehicle axes:
 * lateral positive right, longitudinal positive power and negative braking.
 */
export function normalizeDuckDbGForces(
  exportedLatG: number | undefined,
  exportedLongG: number | undefined
): { accelLatG: number | undefined; accelLonG: number | undefined; accelTotalG: number | undefined } {
  const accelLatG = exportedLongG;
  const accelLonG = exportedLatG !== undefined ? -exportedLatG : undefined;
  const accelTotalG = accelLatG !== undefined && accelLonG !== undefined
    ? parseFloat(Math.hypot(accelLatG, accelLonG).toFixed(2))
    : undefined;
  return { accelLatG, accelLonG, accelTotalG };
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

  public async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    try {
      const cols = await this.queryAll<{ column_name: string }>(`DESCRIBE "${tableName}"`);
      return cols.some((c) => c.column_name.toLowerCase() === columnName.toLowerCase());
    } catch {
      return false;
    }
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

    let minGpsTime = lapEvents[0].ts;
    if (await this.hasTable('GPS Time')) {
      const firstGps = await this.queryAll<{ value: number }>('SELECT value FROM "GPS Time" LIMIT 1');
      if (firstGps.length > 0 && typeof firstGps[0].value === 'number') {
        minGpsTime = firstGps[0].value;
      }
    }

    // Filter lap events to distinct lap number transitions, keeping the first event for each distinct value
    const distinctEvents: Array<{ ts: number; value: number }> = [];
    for (const evt of lapEvents) {
      if (distinctEvents.length === 0 || evt.value !== distinctEvents[distinctEvents.length - 1].value) {
        distinctEvents.push({ ...evt });
      }
    }

    if (distinctEvents.length === 0) return [];

    // If the first distinct event is value=0 (outlap in progress), start its timestamp at the beginning of session telemetry
    if (distinctEvents[0].value === 0) {
      distinctEvents[0].ts = Math.min(minGpsTime, distinctEvents[0].ts);
    }

    const summaries: DuckDbLapSummary[] = [];

    for (let i = 0; i < distinctEvents.length - 1; i++) {
      const current = distinctEvents[i];
      const next = distinctEvents[i + 1];

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

  public async getLapTelemetry(lapNumber: number, targetLapTimeSec?: number): Promise<DuckDbLapTelemetry | null> {
    const laps = await this.getLapList();
    if (laps.length === 0) return null;

    let targetLap: DuckDbLapSummary | undefined;
    if (targetLapTimeSec && targetLapTimeSec > 0) {
      let minDiff = Infinity;
      for (const l of laps) {
        const diff = Math.abs(l.lapTimeSec - targetLapTimeSec);
        if (diff < minDiff) {
          minDiff = diff;
          targetLap = l;
        }
      }
      if (minDiff > 0.5) {
        targetLap = undefined;
      }
    }

    if (!targetLap && (!targetLapTimeSec || targetLapTimeSec <= 0)) {
      targetLap = laps.find((l) => l.lapNumber === lapNumber);
      if (!targetLap && laps[0]?.lapNumber === 0) {
        targetLap = laps.find((l) => l.lapNumber === lapNumber - 1);
      }
    }
    if (!targetLap) return null;

    const { startTs, endTs, lapTimeSec } = targetLap;

    // Determine sampling frequency and timeline
    const channels = await this.getChannelsList();
    const speedChannel = channels.find(
      (c) => c.channelName.toLowerCase() === 'ground speed' || c.channelName.toLowerCase() === 'speed'
    );
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

    // Detect continuous channel tables
    const speedTable = (await this.hasTable('Ground Speed'))
      ? 'Ground Speed'
      : (await this.hasTable('Speed'))
      ? 'Speed'
      : null;

    const throttleTable = (await this.hasTable('Throttle Pos'))
      ? 'Throttle Pos'
      : (await this.hasTable('Throttle Pos Unfiltered'))
      ? 'Throttle Pos Unfiltered'
      : (await this.hasTable('Throttle'))
      ? 'Throttle'
      : null;

    const brakeTable = (await this.hasTable('Brake Pos'))
      ? 'Brake Pos'
      : (await this.hasTable('Brake Pos Unfiltered'))
      ? 'Brake Pos Unfiltered'
      : (await this.hasTable('Brake'))
      ? 'Brake'
      : null;

    const steerTable = (await this.hasTable('Steering Pos'))
      ? 'Steering Pos'
      : (await this.hasTable('Steering Pos Unfiltered'))
      ? 'Steering Pos Unfiltered'
      : (await this.hasTable('Steering Input'))
      ? 'Steering Input'
      : (await this.hasTable('Steering'))
      ? 'Steering'
      : null;

    const rpmTable = (await this.hasTable('Engine RPM'))
      ? 'Engine RPM'
      : (await this.hasTable('RPM'))
      ? 'RPM'
      : null;

    const gForceLatTable = (await this.hasTable('G Force Lat')) ? 'G Force Lat' : null;
    const gForceLongTable = (await this.hasTable('G Force Long')) ? 'G Force Long' : null;

    const rideHeightTable = (await this.hasTable('RideHeights')) ? 'RideHeights' : null;
    const frontRideHeightTable = (await this.hasTable('FrontRideHeight')) ? 'FrontRideHeight' : null;
    const rearRideHeightTable = (await this.hasTable('RearRideHeight')) ? 'RearRideHeight' : null;

    const pressureTable = (await this.hasTable('TyresPressure'))
      ? 'TyresPressure'
      : (await this.hasTable('Tyres Pressure'))
      ? 'Tyres Pressure'
      : (await this.hasTable('Tyre Pressure'))
      ? 'Tyre Pressure'
      : (await this.hasTable('Tire Pressure'))
      ? 'Tire Pressure'
      : null;

    const wheelSpeedTable = (await this.hasTable('Wheel Speed')) ? 'Wheel Speed' : null;
    const wheelSpeedChannel = channels.find(
      (c) => c.channelName.toLowerCase() === 'wheel speed'
    );

    const brakeTempTable = (await this.hasTable('Brakes Temp'))
      ? 'Brakes Temp'
      : (await this.hasTable('Brake Temp'))
      ? 'Brake Temp'
      : null;

    const tireWearTable = (await this.hasTable('Tyres Wear'))
      ? 'Tyres Wear'
      : (await this.hasTable('TyresWear'))
      ? 'TyresWear'
      : (await this.hasTable('Tyre Wear'))
      ? 'Tyre Wear'
      : (await this.hasTable('Tire Wear'))
      ? 'Tire Wear'
      : null;

    const tireTempTable = (await this.hasTable('TyresTempCentre'))
      ? 'TyresTempCentre'
      : (await this.hasTable('TyresRubberTemp'))
      ? 'TyresRubberTemp'
      : (await this.hasTable('TyresCarcassTemp'))
      ? 'TyresCarcassTemp'
      : (await this.hasTable('TyresTemp'))
      ? 'TyresTemp'
      : (await this.hasTable('Tyre Temp'))
      ? 'Tyre Temp'
      : (await this.hasTable('Tyres Temp'))
      ? 'Tyres Temp'
      : (await this.hasTable('Tire Temp'))
      ? 'Tire Temp'
      : null;

    const fuelTable = (await this.hasTable('Fuel Level'))
      ? 'Fuel Level'
      : (await this.hasTable('FuelLevel'))
      ? 'FuelLevel'
      : (await this.hasTable('Fuel'))
      ? 'Fuel'
      : null;

    const virtualEnergyTable = (await this.hasTable('Virtual Energy'))
      ? 'Virtual Energy'
      : (await this.hasTable('VirtualEnergy'))
      ? 'VirtualEnergy'
      : null;

    const socTable = (await this.hasTable('SoC'))
      ? 'SoC'
      : (await this.hasTable('SOC'))
      ? 'SOC'
      : (await this.hasTable('State of Charge'))
      ? 'State of Charge'
      : null;

    const regenRateTable = (await this.hasTable('Regen Rate'))
      ? 'Regen Rate'
      : (await this.hasTable('RegenRate'))
      ? 'RegenRate'
      : null;

    // Check discrete vs continuous for ABS, TC, Gear
    const hasTc = await this.hasTable('TC');
    const tcHasTs = hasTc ? await this.hasColumn('TC', 'ts') : false;

    const hasAbs = await this.hasTable('ABS');
    const absHasTs = hasAbs ? await this.hasColumn('ABS', 'ts') : false;

    const hasGear = await this.hasTable('Gear');
    const gearHasTs = hasGear ? await this.hasColumn('Gear', 'ts') : false;

    const fetchContinuousChannel = async <T>(
      tableName: string | null,
      columns: string,
      defaultHz: number = declaredHz
    ): Promise<{ rows: T[]; hz: number }> => {
      if (!tableName) return { rows: [], hz: defaultHz };
      const ch = channels.find((c) => c.channelName.toLowerCase() === tableName.toLowerCase());
      const hz = ch?.frequency || defaultHz;
      const chStart = Math.floor((startIdx * hz) / declaredHz);
      const chCount = Math.ceil((rowCount * hz) / declaredHz) + 2;
      const rows = await this.queryAll<T>(
        `SELECT ${columns} FROM "${tableName}" LIMIT ${chCount} OFFSET ${chStart}`
      );
      return { rows, hz };
    };

    const [
      speedData,
      throttleData,
      brakeData,
      steerData,
      rpmData,
      gForceLatData,
      gForceLongData,
      rideHeightData,
      frontRideHeightData,
      rearRideHeightData,
      pressureData,
      wheelSpeedData,
      brakeTempData,
      tireWearData,
      tireTempData,
      tcData,
      absData,
      gearData,
      gearEvents,
      absEvents,
      tcEvents,
      fuelData,
      virtualEnergyData,
      socData,
      regenRateData,
    ] = await Promise.all([
      fetchContinuousChannel<{ value: number }>(speedTable, 'value', declaredHz),
      fetchContinuousChannel<{ value: number }>(throttleTable, 'value', 50),
      fetchContinuousChannel<{ value: number }>(brakeTable, 'value', 50),
      fetchContinuousChannel<{ value: number }>(steerTable, 'value', declaredHz),
      fetchContinuousChannel<{ value: number }>(rpmTable, 'value', declaredHz),
      fetchContinuousChannel<{ value: number }>(gForceLatTable, 'value', 10),
      fetchContinuousChannel<{ value: number }>(gForceLongTable, 'value', 10),
      fetchContinuousChannel<{ value1: number; value2: number; value3: number; value4: number }>(
        rideHeightTable,
        'value1, value2, value3, value4',
        declaredHz
      ),
      fetchContinuousChannel<{ value: number }>(frontRideHeightTable, 'value', declaredHz),
      fetchContinuousChannel<{ value: number }>(rearRideHeightTable, 'value', declaredHz),
      fetchContinuousChannel<{ value1: number; value2: number; value3: number; value4: number }>(
        pressureTable,
        'value1, value2, value3, value4',
        10
      ),
      fetchContinuousChannel<{ value1: number; value2: number; value3: number; value4: number }>(
        wheelSpeedTable,
        'value1, value2, value3, value4',
        declaredHz
      ),
      fetchContinuousChannel<{ value1: number; value2: number; value3: number; value4: number }>(
        brakeTempTable,
        'value1, value2, value3, value4',
        50
      ),
      fetchContinuousChannel<{ value1: number; value2: number; value3: number; value4: number }>(
        tireWearTable,
        'value1, value2, value3, value4',
        10
      ),
      fetchContinuousChannel<{ value1: number; value2: number; value3: number; value4: number }>(
        tireTempTable,
        'value1, value2, value3, value4',
        declaredHz
      ),
      hasTc && !tcHasTs
        ? fetchContinuousChannel<{ value: boolean | number }>('TC', 'value', declaredHz)
        : Promise.resolve({ rows: [], hz: declaredHz }),
      hasAbs && !absHasTs
        ? fetchContinuousChannel<{ value: boolean | number }>('ABS', 'value', declaredHz)
        : Promise.resolve({ rows: [], hz: declaredHz }),
      hasGear && !gearHasTs
        ? fetchContinuousChannel<{ value: number }>('Gear', 'value', declaredHz)
        : Promise.resolve({ rows: [], hz: declaredHz }),
      hasGear && gearHasTs
        ? this.queryAll<{ ts: number; value: number }>(
            'SELECT ts, value FROM "Gear" WHERE ts >= ? AND ts <= ? ORDER BY ts ASC',
            [startTs - 5, endTs + 5]
          )
        : Promise.resolve([]),
      hasAbs && absHasTs
        ? this.queryAll<{ ts: number; value: number }>(
            'SELECT ts, value FROM "ABS" WHERE ts >= ? AND ts <= ? ORDER BY ts ASC',
            [startTs - 1, endTs + 1]
          )
        : Promise.resolve([]),
      hasTc && tcHasTs
        ? this.queryAll<{ ts: number; value: number }>(
            'SELECT ts, value FROM "TC" WHERE ts >= ? AND ts <= ? ORDER BY ts ASC',
            [startTs - 1, endTs + 1]
          )
        : Promise.resolve([]),
      fetchContinuousChannel<{ value: number }>(fuelTable, 'value', 20),
      fetchContinuousChannel<{ value: number }>(virtualEnergyTable, 'value', 20),
      fetchContinuousChannel<{ value: number }>(socTable, 'value', 20),
      fetchContinuousChannel<{ value: number }>(regenRateTable, 'value', declaredHz),
    ]);

    const getChannelRow = <T>(channelData: { rows: T[]; hz: number }, i: number): T | undefined => {
      if (channelData.rows.length === 0) return undefined;
      const idx = Math.min(
        channelData.rows.length - 1,
        Math.max(0, Math.floor((i * channelData.hz) / declaredHz))
      );
      return channelData.rows[idx];
    };

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

    const speedUnit = speedChannel?.unit?.toLowerCase() || 'm/s';
    const wheelSpeedUnit = wheelSpeedChannel?.unit?.toLowerCase() || 'm/s';
    const steerChannel = steerTable
      ? channels.find((c) => c.channelName.toLowerCase() === steerTable.toLowerCase())
      : null;
    const steerUnit = steerChannel?.unit?.toLowerCase() || '';

    for (let i = 0; i < rowCount; i++) {
      const globalIdx = startIdx + i;
      const pointTime = gpsTimes.length > globalIdx ? gpsTimes[globalIdx] : startTs + i * dt;
      const lapElapsedSec = Math.max(0, pointTime - startTs);

      // Advance discrete event states or read continuous channels
      if (gearHasTs) {
        while (gearEventIdx < gearEvents.length && gearEvents[gearEventIdx].ts <= pointTime) {
          currentGear = gearEvents[gearEventIdx].value;
          gearEventIdx++;
        }
      } else if (hasGear) {
        const gRow = getChannelRow(gearData, i);
        if (gRow) currentGear = Number(gRow.value);
      }

      if (absHasTs) {
        while (absEventIdx < absEvents.length && absEvents[absEventIdx].ts <= pointTime) {
          currentAbs = absEvents[absEventIdx].value > 0;
          absEventIdx++;
        }
      } else if (hasAbs) {
        const aRow = getChannelRow(absData, i);
        if (aRow) currentAbs = Boolean(aRow.value);
      }

      if (tcHasTs) {
        while (tcEventIdx < tcEvents.length && tcEvents[tcEventIdx].ts <= pointTime) {
          currentTc = tcEvents[tcEventIdx].value > 0;
          tcEventIdx++;
        }
      } else if (hasTc) {
        const tRow = getChannelRow(tcData, i);
        if (tRow) currentTc = Boolean(tRow.value);
      }

      // Read continuous values with frequency-adjusted indexing
      const speedRow = getChannelRow(speedData, i);
      const rawSpeed = speedRow?.value ?? 0;
      const speedKmh = speedUnit.includes('km') ? rawSpeed : rawSpeed * 3.6;
      const speedMs = speedUnit.includes('km') ? rawSpeed / 3.6 : rawSpeed;

      if (i > 0) {
        cumulativeDistM += speedMs * dt;
      }

      const throttleRow = getChannelRow(throttleData, i);
      const rawThrottle = throttleRow?.value ?? 0;
      const throttle = rawThrottle <= 1.01 ? rawThrottle * 100 : rawThrottle;

      const brakeRow = getChannelRow(brakeData, i);
      const rawBrake = brakeRow?.value ?? 0;
      const brake = rawBrake <= 1.01 ? rawBrake * 100 : rawBrake;

      const steerRow = getChannelRow(steerData, i);
      const rawSteer = steerRow?.value ?? 0;
      const absSteer = Math.abs(rawSteer);
      let steerYaw = rawSteer;
      if (steerUnit.includes('%') || steerUnit.includes('percent') || (absSteer > 1.01 && absSteer <= 100.0 && !steerUnit.includes('deg'))) {
        steerYaw = rawSteer / 100;
      } else if (absSteer > 1.01 && steerUnit.includes('deg')) {
        steerYaw = rawSteer / 270;
      } else if (absSteer > 1.01 && steerUnit.includes('rad')) {
        steerYaw = rawSteer / Math.PI;
      }
      steerYaw = parseFloat(Math.max(-1, Math.min(1, steerYaw)).toFixed(4));

      const rpmRow = getChannelRow(rpmData, i);
      const engineRpm = rpmRow?.value ?? 0;
      const nativeG = normalizeDuckDbGForces(
        getChannelRow(gForceLatData, i)?.value,
        getChannelRow(gForceLongData, i)?.value
      );

      const rideHeightRow = getChannelRow(rideHeightData, i);
      const frontRideHeight = getChannelRow(frontRideHeightData, i)?.value;
      const rearRideHeight = getChannelRow(rearRideHeightData, i)?.value;
      const rideHeight: [number, number, number, number] | undefined = rideHeightRow
        ? [rideHeightRow.value1, rideHeightRow.value2, rideHeightRow.value3, rideHeightRow.value4].map(value => parseFloat((value * 1000).toFixed(1))) as [number, number, number, number]
        : frontRideHeight !== undefined && rearRideHeight !== undefined
          ? [frontRideHeight, frontRideHeight, rearRideHeight, rearRideHeight].map(value => parseFloat((value * 1000).toFixed(1))) as [number, number, number, number]
          : undefined;

      const pressureRow = getChannelRow(pressureData, i);
      const tirePressures: [number, number, number, number] | undefined = pressureRow
        ? [pressureRow.value1, pressureRow.value2, pressureRow.value3, pressureRow.value4]
        : undefined;

      const wheelSpeedRow = getChannelRow(wheelSpeedData, i);
      const wheelSpeeds: [number, number, number, number] | undefined = wheelSpeedRow
        ? [
            wheelSpeedUnit.includes('km') ? wheelSpeedRow.value1 : wheelSpeedRow.value1 * 3.6,
            wheelSpeedUnit.includes('km') ? wheelSpeedRow.value2 : wheelSpeedRow.value2 * 3.6,
            wheelSpeedUnit.includes('km') ? wheelSpeedRow.value3 : wheelSpeedRow.value3 * 3.6,
            wheelSpeedUnit.includes('km') ? wheelSpeedRow.value4 : wheelSpeedRow.value4 * 3.6,
          ]
        : undefined;

      const brakeTempRow = getChannelRow(brakeTempData, i);
      const brakeTemps: [number, number, number, number] | undefined = brakeTempRow
        ? [
            Math.round(brakeTempRow.value1),
            Math.round(brakeTempRow.value2),
            Math.round(brakeTempRow.value3),
            Math.round(brakeTempRow.value4),
          ]
        : undefined;

      const tireWearRow = getChannelRow(tireWearData, i);
      const tireWear: [number, number, number, number] | undefined = tireWearRow
        ? [
            tireWearRow.value1 <= 1.01 ? parseFloat((tireWearRow.value1 * 100).toFixed(1)) : parseFloat(tireWearRow.value1.toFixed(1)),
            tireWearRow.value2 <= 1.01 ? parseFloat((tireWearRow.value2 * 100).toFixed(1)) : parseFloat(tireWearRow.value2.toFixed(1)),
            tireWearRow.value3 <= 1.01 ? parseFloat((tireWearRow.value3 * 100).toFixed(1)) : parseFloat(tireWearRow.value3.toFixed(1)),
            tireWearRow.value4 <= 1.01 ? parseFloat((tireWearRow.value4 * 100).toFixed(1)) : parseFloat(tireWearRow.value4.toFixed(1)),
          ]
        : undefined;

      const tireTempRow = getChannelRow(tireTempData, i);
      const tireTemps: [number, number, number, number] | undefined = tireTempRow
        ? [
            Math.round(tireTempRow.value1),
            Math.round(tireTempRow.value2),
            Math.round(tireTempRow.value3),
            Math.round(tireTempRow.value4),
          ]
        : undefined;

      const fuelRow = getChannelRow(fuelData, i);
      const fuel = fuelRow?.value !== undefined ? parseFloat(fuelRow.value.toFixed(2)) : undefined;

      const veRow = getChannelRow(virtualEnergyData, i);
      const virtualEnergy = veRow?.value !== undefined ? parseFloat(veRow.value.toFixed(1)) : undefined;

      const socRow = getChannelRow(socData, i);
      const soc = socRow?.value !== undefined ? parseFloat(socRow.value.toFixed(1)) : undefined;

      const regenRow = getChannelRow(regenRateData, i);
      const regenRate = regenRow?.value !== undefined ? parseFloat(regenRow.value.toFixed(1)) : undefined;

      points.push({
        x: 0,
        y: 0,
        z: 0,
        timeSec: parseFloat(lapElapsedSec.toFixed(3)),
        distM: parseFloat(cumulativeDistM.toFixed(1)),
        speedKmh: parseFloat(speedKmh.toFixed(1)),
        throttle: parseFloat(throttle.toFixed(1)),
        brake: parseFloat(brake.toFixed(1)),
        steerYaw: parseFloat(steerYaw.toFixed(4)),
        gear: currentGear,
        absActive: currentAbs,
        tcActive: currentTc,
        engineRpm: Math.round(engineRpm),
        ...nativeG,
        rideHeight,
        tirePressures,
        wheelSpeeds,
        brakeTemps,
        tireWear,
        tireTemps,
        fuel,
        virtualEnergy,
        soc,
        regenRate,
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
