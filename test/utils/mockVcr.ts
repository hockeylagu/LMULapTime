import { ReplayEventInfo } from '../../shared/types/index.js';

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
  pitLimiter?: boolean;
  headlights?: boolean;
  gear?: number;
  poseType?: number;
  speedBytes?: [number, number, number, number, number];
  timing?: { splitSec: number; sector: number; lapIdx: number };
  /** Opcode 143: brake temperatures °C, wheel load steps (n × 1000 N) and tyre slide steps (n² × 0.0252 m/s), FL FR RL RR. */
  wheel?: {
    brakeTemps?: [number, number, number, number];
    loadSteps?: [number, number, number, number];
    slideSteps?: [number, number, number, number];
  };
  /** Pose bits 50..63, rpm = n × 60 / (14π). */
  engineSpeedRaw?: number;
  /** Pose wheels (bytes 16..33): the 22-bit speed value and the signed suspension field, FL FR RL RR. */
  poseWheels?: Array<{ speed: number; deflection: number }>;
  standings?: number[];
  /** `cloudCells`: the 16-byte cloud field (two 4-bit cells per byte, 0xff = clear); clear when omitted. */
  weather?: { ambientTemp?: number; rainIntensity?: number; cloudCells?: number[] };
  // Extra events appended to the slice as-is (opcode, slot, payload, time offset byte, session code).
  rawEvents?: Array<{ opcode: number; slot: number; payload: Buffer; timeOffset?: number; sessionCode?: number }>;
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

/** An event header (docs/VCR_FORMAT.md §3.2): route 0, session code 0 unless given. */
export function vcrEventHeader(opcode: number, size: number, slot: number, sessionCode = 0): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(((sessionCode << 26) | (opcode << 17) | (size << 8) | (slot & 0xff)) >>> 0, 0);
  return header;
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
    const hasStandings = Boolean(sl.standings);
    const hasWeather = Boolean(sl.weather);
    const eventCount = 1 + (hasTiming ? 1 : 0) + (hasWheel ? 1 : 0) + (hasStandings ? 1 : 0) + (hasWeather ? 1 : 0) + (sl.rawEvents?.length ?? 0);
    sBuf.writeUInt16LE(eventCount, 4);

    sliceBufs.push(sBuf);

    if (sl.wheel) {
      const wData = Buffer.alloc(24);
      for (let wheel = 0; wheel < 4; wheel++) {
        const load = sl.wheel.loadSteps?.[wheel] ?? 0, slide = sl.wheel.slideSteps?.[wheel] ?? 0;
        wData.writeUInt32LE((((load & 15) << 16) | ((slide & 63) << 20)) >>> 0, wheel * 4);
      }
      const [fl, fr, rl, rr] = (sl.wheel.brakeTemps ?? [-273.15, -273.15, -273.15, -273.15])
        .map(c => Math.round((c + 273.15) * 1023 / 1500) & 0x3ff);
      wData.writeUInt32LE(((rr & 0xff) << 24) >>> 0, 16);
      wData.writeUInt32LE(((rr >> 8) | (rl << 2) | (fr << 12) | (fl << 22)) >>> 0, 20);
      sliceBufs.push(vcrEventHeader(143, 24, sl.driverSlot), Buffer.from([0]), wData);
    }

    // The pose opcode is gear + 8 (7..17).
    const evHdr = vcrEventHeader(sl.poseType ?? (sl.gear !== undefined ? sl.gear + 8 : 9), 65, sl.driverSlot);
    const evPad = Buffer.from([0]);

    const evData = Buffer.alloc(65);
    if (sl.speedBytes) {
      Buffer.from(sl.speedBytes).copy(evData, 8);
    }
    // Headlights at byte 2, bit 4 (0x10)
    if (sl.headlights) evData[2] |= 0x10;

    // Steer at byte 4
    evData.writeUInt16LE(512, 4);


    // Brake at byte 36: bits 0..5 analog (0..63), bit 6 ABS (0x40), bit 7 TC (0x80)
    let brkByte = sl.brake !== undefined ? Math.round((sl.brake / 100) * 63) : 0;
    if (sl.abs) brkByte |= 0x40;
    if (sl.tc) brkByte |= 0x80;
    evData[36] = brkByte;

    // Status at byte 38: bit 0 off-track (0x01), bit 2 pit limiter (0x04)
    let stByte = 0;
    if (sl.pitLimiter) stByte |= 0x04;
    evData[38] = stByte;

    // Position coordinates (x, y, z) at bytes 41, 45, 49
    evData.writeFloatLE(sl.x, 41);
    evData.writeFloatLE(sl.y, 45);
    evData.writeFloatLE(sl.z, 49);
    evData.writeFloatLE(0.0, 57); // rotY

    // Engine speed: bits 50..63 (byte 6 bit 2 up).
    evData.writeUInt16LE(((sl.engineSpeedRaw ?? 0) & 0x3fff) << 2, 6);
    // Throttle: bits 43..48, n / 63 (byte 5 bit 3 up, over the steering bits).
    const throttle = Math.round(((sl.throttle ?? 0) / 100) * 63);
    evData.writeUInt16LE(evData.readUInt16LE(5) | (throttle << 3), 5);

    // Wheels: bits 0..17 of each word at 16 + 4k plus a nibble at 32, suspension in the signed top 14 bits.
    for (const [wheel, value] of (sl.poseWheels ?? []).entries()) {
      evData.writeUInt32LE((((value.speed & 0x3ffff) | (value.deflection << 18)) >>> 0), 16 + wheel * 4);
      evData.writeUInt16LE(evData.readUInt16LE(32) | (((value.speed >> 18) & 15) << (wheel * 4)), 32);
    }

    sliceBufs.push(evHdr, evPad, evData);

    if (sl.timing) {
      const timHdr = vcrEventHeader(198, 21, sl.driverSlot);
      const timPad = Buffer.from([0]);
      const timData = Buffer.alloc(21);
      timData.writeFloatLE(sl.timing.splitSec, 0);
      timData[8] = (sl.timing.lapIdx << 2) | (sl.timing.sector & 3);
      sliceBufs.push(timHdr, timPad, timData);
    }

    if (sl.standings) {
      // Opcode 240, 41 bytes here: count byte + 20 bytes + up to 20 slot bytes
      const stHdr = vcrEventHeader(240, 41, sl.driverSlot);
      const stData = Buffer.alloc(41);
      stData[0] = sl.standings.length;
      sl.standings.forEach((slot, i) => { stData[21 + i] = slot; });
      sliceBufs.push(stHdr, Buffer.from([0]), stData);
    }

    if (sl.weather) {
      // Opcode 138, size 80, slot 255
      const wHdr = vcrEventHeader(138, 80, 255);
      const wData = Buffer.alloc(80);
      wData.writeFloatLE(sl.sTime, 0);
      Buffer.from(sl.weather.cloudCells ?? new Array<number>(16).fill(0xff)).copy(wData, 18);
      const temp = sl.weather.ambientTemp ?? 25.0;
      const rawTemp = Math.round((temp - 5.9) * 8);
      wData[38] = Math.max(0, Math.min(255, rawTemp));
      wData[39] = 129;
      const rain = sl.weather.rainIntensity ?? 0;
      for (let ch = 42; ch < 78; ch += 4) {
        wData[ch] = rain;
        wData[ch + 1] = rain;
        wData[ch + 2] = rain;
      }
      sliceBufs.push(wHdr, Buffer.from([0]), wData);
    }

    for (const ev of sl.rawEvents ?? []) {
      sliceBufs.push(vcrEventHeader(ev.opcode, ev.payload.length, ev.slot, ev.sessionCode), Buffer.from([ev.timeOffset ?? 0]), ev.payload);
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
