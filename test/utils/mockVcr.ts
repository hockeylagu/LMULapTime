import { ReplayEventInfo } from '../../server/types';

export interface MockSlice {
  sTime: number;
  driverSlot: number;
  x: number;
  y: number;
  z: number;
  throttle?: number;
  brake?: number;
  tc?: boolean;
  abs?: boolean;
  offTrack?: boolean;
  pitLimiter?: boolean;
  gear?: number;
  poseType?: number;
  speedBytes?: [number, number, number, number, number];
  timing?: { splitSec: number; sector: number; lapIdx: number };
  wheel?: {
    tireTemps: [number, number, number, number];
    tireWear?: [number, number, number, number];
    brakeTemps?: [number, number, number, number];
  };
  rpmRaw10?: number;
  flag?: { flagState: number; sectorMask: number; driverFlag: number };
  standings?: number[];
}

export function createMockVcrBuffer(): Buffer {
  return createSliceVcrBuffer({
    scn: 'MOCK.SCN',
    aiw: 'MOCK.AIW',
    trackName: 'Mock_Track_2026',
    trackPath: 'C:\\Tracks\\Mock_Track',
    timeSliceCount: 3,
    totalEvents: 15,
    startTime: 10.0,
    endTime: 100.5,
    eventInfo: {
      eventTitle: 'LMGT3 Fixed',
      eventType: 'daily',
      splitNo: 2,
      session: 'PRACTICE',
    },
    drivers: [
      { name: 'Samuel Lague', vehicleId: '21_26_AFCO95641716', team: 'Vista AF Corsa', carNumber: '21' },
      { name: 'Test Rival', vehicleId: '32_26_WRT_83524148', team: 'Team WRT', carNumber: '32' },
    ],
    slices: [
      { sTime: 10.00, driverSlot: 1, x: 100.0, y: 10.0, z: 200.0, throttle: 30, brake: 0 },
      { sTime: 10.02, driverSlot: 1, x: 120.0, y: 10.2, z: 215.0, throttle: 30, brake: 0 },
      { sTime: 10.04, driverSlot: 1, x: 145.0, y: 10.5, z: 230.0, throttle: 30, brake: 0 },
    ],
  });
}

/**
 * Creates a binary VCR file containing realistic stream slices and event payloads.
 * Supports telemetry inputs (throttle, brake, ABS, TC, off-track, pit limiter),
 * multi-driver events, and custom metadata strings.
 */
export function createSliceVcrBuffer(options?: {
  slices?: MockSlice[];
  drivers?: { name: string; vehicleId: string; team: string; carNumber: string }[];
  eventInfo?: ReplayEventInfo;
  corruptMetaOffset?: boolean;
  rawEventInfoString?: string;
  trackName?: string;
  scn?: string;
  aiw?: string;
  trackVersion?: string;
  trackPath?: string;
  timeSliceCount?: number;
  totalEvents?: number;
  startTime?: number;
  endTime?: number;
}): Buffer {
  const headerText = '//[[gMb1.002f (c)2016    ]] [[            ]]\n';
  const headerBuf = Buffer.from(headerText, 'ascii'); // 45 bytes
  const irsrBuf = Buffer.from('IRSR', 'ascii'); // 4 bytes
  const verBuf = Buffer.alloc(4);
  verBuf.writeUInt32LE(0x80000008, 0); // 4 bytes

  // 4-byte stream prefix for the first chunk
  const streamPrefix = Buffer.alloc(4);

  const sliceBufs: Buffer[] = [];
  const slices = options?.slices || [];

  for (const sl of slices) {
    const sBuf = Buffer.alloc(6);
    sBuf.writeFloatLE(sl.sTime, 0);
    const hasTiming = Boolean(sl.timing);
    const hasWheel = Boolean(sl.wheel);
    const hasFlag = Boolean(sl.flag);
    const hasStandings = Boolean(sl.standings);
    const eventCount = 1 + (hasTiming ? 1 : 0) + (hasWheel ? 1 : 0) + (hasFlag ? 1 : 0) + (hasStandings ? 1 : 0);
    sBuf.writeUInt16LE(eventCount, 4);

    sliceBufs.push(sBuf);

    if (sl.wheel) {
      const sz = sl.wheel.brakeTemps ? 37 : 24;
      const wHdr = Buffer.alloc(4);
      wHdr.writeUInt32LE((15 << 17) | (sz << 8) | (sl.driverSlot & 0xff), 0);
      const wPad = Buffer.from([0]);
      const wData = Buffer.alloc(sz);
      wData.writeUInt16LE(sl.wheel.tireTemps[0], 2);
      wData.writeUInt16LE(sl.wheel.tireTemps[1], 6);
      wData.writeUInt16LE(sl.wheel.tireTemps[2], 10);
      wData.writeUInt16LE(sl.wheel.tireTemps[3], 14);
      if (sl.wheel.tireWear) {
        wData[19] = sl.wheel.tireWear[0];
        wData[20] = sl.wheel.tireWear[1];
        wData[21] = sl.wheel.tireWear[2];
        wData[22] = sl.wheel.tireWear[3];
      }
      if (sl.wheel.brakeTemps && sz === 37) {
        wData.writeUInt16LE(sl.wheel.brakeTemps[0], 24);
        wData.writeUInt16LE(sl.wheel.brakeTemps[1], 26);
        wData.writeUInt16LE(sl.wheel.brakeTemps[2], 28);
        wData.writeUInt16LE(sl.wheel.brakeTemps[3], 30);
      }
      sliceBufs.push(wHdr, wPad, wData);
    }

    const evHdr = Buffer.alloc(4);
    // eventType (bits 17..22) encodes gear as (gear + 8); eventClass (bits 29..31) is 1,
    // matching the real current-format LMU replay encoding.
    const evType = sl.poseType ?? (sl.gear !== undefined ? sl.gear + 8 : 9);
    evHdr.writeUInt32LE((1 << 29) | (evType << 17) | (65 << 8) | (sl.driverSlot & 0xff), 0);
    const evPad = Buffer.from([0]);

    const evData = Buffer.alloc(65);
    if (sl.speedBytes) {
      Buffer.from(sl.speedBytes).copy(evData, 8);
    }
    // Steer at byte 4
    evData.writeUInt16LE(512, 4);

    // Throttle at byte 5: 1 + (pct * 2.48)
    const thrByte = sl.throttle !== undefined ? Math.round(1 + (sl.throttle / 100) * 248) : 1;
    evData[5] = Math.min(255, Math.max(0, thrByte));

    // Brake at byte 36: bits 0..5 analog (0..63), bit 6 ABS (0x40), bit 7 TC (0x80)
    let brkByte = sl.brake !== undefined ? Math.round((sl.brake / 100) * 63) : 0;
    if (sl.abs) brkByte |= 0x40;
    if (sl.tc) brkByte |= 0x80;
    evData[36] = brkByte;

    // Status at byte 38: bit 0 off-track (0x01), bit 2 pit limiter (0x04)
    let stByte = 0;
    if (sl.offTrack) stByte |= 0x01;
    if (sl.pitLimiter) stByte |= 0x04;
    evData[38] = stByte;

    // Position coordinates (x, y, z) at bytes 41, 45, 49
    evData.writeFloatLE(sl.x, 41);
    evData.writeFloatLE(sl.y, 45);
    evData.writeFloatLE(sl.z, 49);
    evData.writeFloatLE(0.0, 57); // rotY

    // Engine RPM: 10-bit field at byte 6 bit 5 through byte 7 bit 6
    if (sl.rpmRaw10 !== undefined) {
      evData.writeUInt16LE((sl.rpmRaw10 & 0x3ff) << 5, 6);
    }

    sliceBufs.push(evHdr, evPad, evData);

    if (sl.timing) {
      const timHdr = Buffer.alloc(4);
      timHdr.writeUInt32LE(((6 << 29) | (6 << 17) | (21 << 8) | (sl.driverSlot & 0xff)) >>> 0, 0);
      const timPad = Buffer.from([0]);
      const timData = Buffer.alloc(21);
      timData.writeFloatLE(sl.timing.splitSec, 0);
      timData[8] = (sl.timing.lapIdx << 2) | (sl.timing.sector & 3);
      sliceBufs.push(timHdr, timPad, timData);
    }

    if (sl.flag) {
      // Class 3 Type 10, always 3 bytes: flagState, sectorMask, driverFlag
      const flagHdr = Buffer.alloc(4);
      flagHdr.writeUInt32LE(((3 << 29) | (10 << 17) | (3 << 8) | (sl.driverSlot & 0xff)) >>> 0, 0);
      const flagData = Buffer.from([sl.flag.flagState, sl.flag.sectorMask, sl.flag.driverFlag]);
      sliceBufs.push(flagHdr, Buffer.from([0]), flagData);
    }

    if (sl.standings) {
      // Type 48, always 41 bytes: count byte + 20 reserved bytes + up to 20 slot bytes
      const stHdr = Buffer.alloc(4);
      stHdr.writeUInt32LE(((7 << 29) | (48 << 17) | (41 << 8) | (sl.driverSlot & 0xff)) >>> 0, 0);
      const stData = Buffer.alloc(41);
      stData[0] = sl.standings.length;
      sl.standings.forEach((slot, i) => { stData[21 + i] = slot; });
      sliceBufs.push(stHdr, Buffer.from([0]), stData);
    }
  }

  const framesBuf = Buffer.concat([streamPrefix, ...sliceBufs]);

  function makeStr4(str: string): Buffer {
    const sBuf = Buffer.from(str, 'utf8');
    const lBuf = Buffer.alloc(4);
    lBuf.writeUInt32LE(sBuf.length, 0);
    return Buffer.concat([lBuf, sBuf]);
  }

  function makePascal(str: string): Buffer {
    const b = Buffer.from(str, 'utf8');
    return Buffer.concat([Buffer.from([b.length]), b]);
  }

  const rawEvStr = options?.rawEventInfoString !== undefined
    ? options.rawEventInfoString
    : JSON.stringify(options?.eventInfo || { eventTitle: 'Test Event', eventType: 'practice', splitNo: 1, session: 'PRACTICE' });

  const metaParts: Buffer[] = [
    makeStr4(rawEvStr),
    makeStr4(options?.scn || 'TEST.SCN'),
    makeStr4(options?.aiw || 'TEST.AIW'),
    makeStr4(options?.trackName || 'Test_Track'),
    makeStr4(options?.trackVersion || '1.00'),
    makeStr4('hash_123'),
    makeStr4(options?.trackPath || 'C:\\Tracks\\Test'),
  ];

  const defaultDrivers = options?.drivers !== undefined ? options.drivers : [
    { name: 'Player Driver', vehicleId: '21_26_AFCO95641716', team: 'Ferrari Team AF', carNumber: '21' },
    { name: 'Rival Driver', vehicleId: '32_26_WRT_83524148', team: 'WRT Team Racing', carNumber: '32' },
  ];

  const envBlock = Buffer.alloc(69);
  const countBuf = Buffer.alloc(4);
  countBuf.writeInt32LE(defaultDrivers.length, 0);

  const driverRecords: Buffer[] = [];
  for (let i = 0; i < defaultDrivers.length; i++) {
    const d = defaultDrivers[i];
    const slot = i + 1;
    if (i === 0) {
      driverRecords.push(Buffer.from([slot]));
    } else {
      const idxSlot = Buffer.alloc(4);
      idxSlot.writeUInt16BE(i, 0);
      idxSlot.writeUInt16BE(slot, 2);
      driverRecords.push(idxSlot);
    }
    driverRecords.push(makePascal(d.name));
    driverRecords.push(makePascal(d.vehicleId));
    driverRecords.push(makePascal(''));
    driverRecords.push(makePascal(d.team || ''));
    driverRecords.push(makePascal(d.carNumber || ''));
    driverRecords.push(Buffer.alloc(24));
  }

  metaParts.push(envBlock, countBuf, ...driverRecords);

  const trailer = Buffer.alloc(28);
  trailer.writeUInt32LE(options?.timeSliceCount ?? slices.length, 4);
  trailer.writeUInt32LE(options?.totalEvents ?? slices.length, 8);
  trailer.writeFloatLE(options?.startTime ?? (slices[0]?.sTime ?? 0.0), 12);
  trailer.writeFloatLE(options?.endTime ?? (slices[slices.length - 1]?.sTime ?? 100.0), 16);
  metaParts.push(trailer);

  const metadataBuf = Buffer.concat(metaParts);
  const metaOffset = options?.corruptMetaOffset ? 99999999 : 57 + framesBuf.length;
  const offsetBuf = Buffer.alloc(4);
  offsetBuf.writeUInt32LE(metaOffset, 0);

  return Buffer.concat([headerBuf, irsrBuf, verBuf, offsetBuf, framesBuf, metadataBuf]);
}
