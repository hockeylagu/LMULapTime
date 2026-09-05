import fs from 'fs';
import path from 'path';
import {
  ReplayMetadata,
  ReplayDriverEntry,
  ReplayTrajectoryData,
  ReplayTrajectoryPoint,
  ReplayEventInfo,
  ReplayLapSummary,
} from './types.js';

// Friendly car name mapping from known LMU skin/vehicle ID tokens
export function mapVehicleIdToModel(vehicleId?: string): string {
  if (!vehicleId) return 'Unknown Vehicle';
  const v = vehicleId.toUpperCase();
  if (v.includes('AFCO') || v.includes('296')) return 'Ferrari 296 GT3';
  if (v.includes('WRT') || v.includes('M4')) return 'BMW M4 GT3';
  if (v.includes('MUSTANG')) return 'Ford Mustang GT3';
  if (v.includes('THOR') || v.includes('VANTAGE')) return 'Aston Martin Vantage GT3';
  if (v.includes('MANT') || v.includes('911')) return 'Porsche 911 GT3 R';
  if (v.includes('GARA') || v.includes('720S')) return 'McLaren 720S GT3 Evo';
  if (v.includes('IRON') || v.includes('HURACAN')) return 'Lamborghini Huracan GT3 Evo2';
  if (v.includes('PROT')) return 'Ford Mustang GT3';
  if (v.includes('TFSP') || v.includes('CORVETTE')) return 'Corvette Z06 GT3.R';
  if (v.includes('AKKO') || v.includes('LEXUS')) return 'Lexus RC F GT3';
  if (v.includes('499P')) return 'Ferrari 499P';
  if (v.includes('963')) return 'Porsche 963';
  if (v.includes('V-SERIES') || v.includes('CADILLAC')) return 'Cadillac V-Series.R';
  if (v.includes('GR010') || v.includes('TOYOTA')) return 'Toyota GR010 Hybrid';
  if (v.includes('9X8') || v.includes('PEUGEOT')) return 'Peugeot 9X8';
  if (v.includes('A424') || v.includes('ALPINE')) return 'Alpine A424';
  if (v.includes('SC63') || v.includes('LAMBORGHINI')) return 'Lamborghini SC63';
  if (v.includes('ISOTTA')) return 'Isotta Fraschini Tipo 6';
  if (v.includes('BMW_HY') || v.includes('M_HYBRID')) return 'BMW M Hybrid V8';
  if (v.includes('ORECA') || v.includes('07') || v.includes('LMP2')) return 'Oreca 07 LMP2';
  if (v.includes('992S') || v.includes('SAFETY')) return 'Porsche 992 (Safety Car)';
  return vehicleId;
}

/**
 * Dynamically detects the LMU player profile name from UserData/player/settings.json,
 * avoiding any hardcoded player names.
 */
export function detectPlayerName(baseDirOrFile?: string): string | undefined {
  try {
    const candidateUserDataDirs: string[] = [];

    if (baseDirOrFile) {
      const uIdx = baseDirOrFile.indexOf('UserData');
      if (uIdx !== -1) {
        candidateUserDataDirs.push(baseDirOrFile.substring(0, uIdx + 8));
      }
    }

    candidateUserDataDirs.push(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData',
      path.join(process.cwd(), 'UserData')
    );

    for (const udDir of candidateUserDataDirs) {
      if (!fs.existsSync(udDir)) continue;

      const settingsPaths = [
        path.join(udDir, 'player', 'settings.json'),
        path.join(udDir, 'player', 'Settings.JSON'),
      ];

      for (const sp of settingsPaths) {
        if (fs.existsSync(sp)) {
          const raw = fs.readFileSync(sp, 'utf8');
          const parsed = JSON.parse(raw);
          const pName = parsed?.DRIVER?.['Player Name'] || parsed?.DRIVER?.PlayerName;
          if (pName && typeof pName === 'string' && pName.trim()) {
            return pName.trim();
          }
        }
      }
    }
  } catch {
    // Ignore fallback
  }
  return undefined;
}

/**
 * Parses replay header and extracts metadata block, driver roster, and session info.
 * Seeks directly to metadataOffset for sub-5ms performance.
 */
export function parseReplayMetadata(
  filePath: string,
  options?: { playerName?: string }
): ReplayMetadata {
  const effectivePlayerName = options?.playerName || detectPlayerName(filePath);
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');

  try {
    const head = Buffer.alloc(64);
    fs.readSync(fd, head, 0, 64, 0);

    const irsr = head.subarray(45, 49).toString('ascii');
    if (irsr !== 'IRSR') {
      throw new Error(`Invalid LMU replay file: missing IRSR magic tag in ${filePath}`);
    }

    const metaOffset = head.readUInt32LE(53);
    if (metaOffset <= 56 || metaOffset >= stat.size) {
      throw new Error(`Invalid metadata offset ${metaOffset} in replay ${filePath}`);
    }

    const metaLen = stat.size - metaOffset;
    const meta = Buffer.alloc(metaLen);
    fs.readSync(fd, meta, 0, metaLen, metaOffset);

    let off = 0;
    function readStr4(): string {
      if (off + 4 > meta.length) return '';
      const l = meta.readUInt32LE(off);
      off += 4;
      if (l <= 0 || off + l > meta.length) return '';
      const s = meta.subarray(off, off + l).toString('utf8');
      off += l;
      return s;
    }

    // Read header strings
    const eventJsonStr = readStr4();
    let eventInfo: ReplayEventInfo | null = null;
    if (eventJsonStr) {
      try {
        eventInfo = JSON.parse(eventJsonStr);
      } catch {
        eventInfo = { eventTitle: eventJsonStr };
      }
    }

    const scn = readStr4();
    const aiw = readStr4();
    const trackName = readStr4();
    const trackVersion = readStr4();
    readStr4(); // modUid
    readStr4(); // trackPath

    // Read trailer metrics from last 28 bytes
    let timeSliceCount = 0;
    let totalEvents = 0;
    let startTimeSec = 0;
    let endTimeSec = 0;
    let durationSec = 0;

    if (meta.length >= 28) {
      const trailer = meta.subarray(meta.length - 28);
      timeSliceCount = trailer.readUInt32LE(4);
      totalEvents = trailer.readUInt32LE(8);
      startTimeSec = trailer.readFloatLE(12);
      endTimeSec = trailer.readFloatLE(16);
      if (endTimeSec > startTimeSec) {
        durationSec = endTimeSec - startTimeSec;
      }
    }

    // Driver extraction from driver region
    const drivers: ReplayDriverEntry[] = [];
    const driverRegion = meta.subarray(off, meta.length >= 28 ? meta.length - 28 : meta.length);

    // Primary parser: Structured binary scan for LMU driver records
    // In LMU replay metadata, each driver entry has a 2-byte slot integer (UInt16BE where high byte is 0 and low byte <= 110)
    // immediately followed by a 1-byte string length and driver name string
    const seenSlots = new Set<number>();
    const seenNames = new Set<string>();

    function readPStr(buf: Buffer, offset: number): { str: string; nextOffset: number } {
      if (offset >= buf.length) return { str: '', nextOffset: offset };
      const len = buf[offset];
      if (offset + 1 + len > buf.length) return { str: '', nextOffset: offset + 1 };
      const str = buf.toString('utf8', offset + 1, offset + 1 + len).trim();
      return { str, nextOffset: offset + 1 + len };
    }

    for (let p = 2; p < driverRegion.length - 40; p++) {
      const len = driverRegion[p - 1];
      if (len >= 3 && len <= 35 && p + len <= driverRegion.length) {
        const slotHigh = p >= 3 ? driverRegion[p - 3] : 0xff;
        const slotLow = p >= 2 ? driverRegion[p - 2] : 0xff;

        if (slotHigh === 0 && slotLow <= 110) {
          const slot = slotLow;
          const str = driverRegion.toString('utf8', p, p + len).trim();

          if (
            /^[A-Z][a-zA-Z\s'-]{2,28}$/.test(str) &&
            !str.includes('.SCN') &&
            !str.includes('.AIW') &&
            !str.includes('Team') &&
            !str.includes('Racing') &&
            !str.includes('WEC') &&
            !str.includes('Corsa') &&
            !str.includes('Hybrid') &&
            !str.includes('Ambulante')
          ) {
            if (!seenNames.has(str) && !seenSlots.has(slot)) {
              seenNames.add(str);
              seenSlots.add(slot);

              let np = p + len;
              const sVehicle = readPStr(driverRegion, np); np = sVehicle.nextOffset;
              const sLivery = readPStr(driverRegion, np); np = sLivery.nextOffset;
              const sTeam = readPStr(driverRegion, np); np = sTeam.nextOffset;
              const sCarNum = readPStr(driverRegion, np); np = sCarNum.nextOffset;

              const isPlayer = Boolean(
                effectivePlayerName && (
                  str.toLowerCase() === effectivePlayerName.toLowerCase() ||
                  str.toLowerCase().includes(effectivePlayerName.toLowerCase())
                )
              );

              drivers.push({
                slot,
                name: str,
                vehicleId: sVehicle.str || undefined,
                carModel: mapVehicleIdToModel(sVehicle.str),
                team: sTeam.str || undefined,
                carNumber: sCarNum.str || undefined,
                isPlayer,
              });
            }
          }
        }
      }
    }

    // Fallback parser: for synthetic mock buffers or non-standard replay files
    if (drivers.length === 0) {
      const extractedStrings: string[] = [];
      let curBytes: number[] = [];
      for (let i = 0; i < driverRegion.length; i++) {
        const b = driverRegion[i];
        if (b >= 32 && b <= 126) {
          curBytes.push(b);
        } else {
          if (curBytes.length >= 2) {
            extractedStrings.push(Buffer.from(curBytes).toString('utf8').trim());
          }
          curBytes = [];
        }
      }
      if (curBytes.length >= 2) {
        extractedStrings.push(Buffer.from(curBytes).toString('utf8').trim());
      }

      for (let i = 0; i < extractedStrings.length; i++) {
        const str = extractedStrings[i];
        const isDriverName = /^[A-Z][a-zA-Z\s'-]{2,28}$/.test(str) &&
          !str.includes('.SCN') &&
          !str.includes('.AIW') &&
          !str.includes('Team') &&
          !str.includes('Racing') &&
          !str.includes('WEC') &&
          !str.includes('Corsa');

        if (isDriverName && !seenNames.has(str)) {
          seenNames.add(str);
          const name = str;
          let vehicleId = '';
          let team = '';
          let carNumber = '';

          for (let j = 1; j <= 4 && i + j < extractedStrings.length; j++) {
            const cand = extractedStrings[i + j];
            if (/^\d+_[0-9A-Z_]+$/i.test(cand) || cand.includes('MUSTANG') || cand.includes('992S')) {
              if (!vehicleId) vehicleId = cand;
            } else if (cand.includes('Team') || cand.includes('Racing') || cand.includes('Corsa') || cand.includes('Lynx') || cand.includes('Porsche') || cand.includes('Garage') || cand.includes('Proton')) {
              if (!team) team = cand;
            } else if (/^\d{1,3}$/.test(cand) && !carNumber) {
              carNumber = cand;
            }
          }

          const slot = drivers.length + 1;
          const carModel = mapVehicleIdToModel(vehicleId);
          const isPlayer = Boolean(
            effectivePlayerName && (
              name.toLowerCase() === effectivePlayerName.toLowerCase() ||
              name.toLowerCase().includes(effectivePlayerName.toLowerCase())
            )
          );

          drivers.push({
            slot,
            name,
            vehicleId: vehicleId || undefined,
            carModel,
            team: team || undefined,
            carNumber: carNumber || undefined,
            isPlayer,
          });
        }
      }
    }

    return {
      filename: path.basename(filePath),
      filePath,
      fileSizeBytes: stat.size,
      mtimeMs: stat.mtime.getTime(),
      eventInfo,
      scn: scn || undefined,
      aiw: aiw || undefined,
      trackName: trackName || undefined,
      trackVersion: trackVersion || undefined,
      timeSliceCount,
      totalEvents,
      durationSec,
      startTimeSec,
      endTimeSec,
      drivers,
    };
  } finally {
    fs.closeSync(fd);
  }
}

interface RawPoint {
  sTime: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  steerYaw?: number;
  rawThrottle?: number;
  rawBrake?: number;
  tcActive?: boolean;
  absActive?: boolean;
  pitLimiter?: boolean;
  inPit?: boolean;
  isOffTrack?: boolean;
}

/**
 * Extracts downsampled 2D/3D car trajectory and live inputs from replay frames.
 */
export function extractReplayTrajectory(
  filePath: string,
  options: {
    driverSlot?: number;
    driverName?: string;
    sampleRateHz?: number;
    maxPoints?: number;
    playerName?: string;
    lapNumber?: number;
  } = {}
): ReplayTrajectoryData {
  const effectivePlayerName = options.playerName || detectPlayerName(filePath);
  const meta = parseReplayMetadata(filePath, { playerName: effectivePlayerName });
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');

  try {
    const head = Buffer.alloc(64);
    fs.readSync(fd, head, 0, 64, 0);

    const metaOffset = head.readUInt32LE(53);
    const frameStreamEnd = Math.min(metaOffset, stat.size);
    const frameStreamBytes = frameStreamEnd - 57;

    if (frameStreamBytes <= 0) {
      return {
        replayName: path.basename(filePath),
        pointsCount: 0,
        currentLap: 1,
        laps: [],
        sectors: { s1Frame: 0, s2Frame: 0 },
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
        points: [],
      };
    }

    // Target slot determination
    let targetSlot = options.driverSlot;
    if (targetSlot === undefined && options.driverName) {
      const match = meta.drivers.find(d => d.name.toLowerCase() === options.driverName?.toLowerCase());
      if (match && typeof match.slot === 'number') {
        targetSlot = match.slot;
      }
    }

    // Default to player driver (priority 1)
    if (targetSlot === undefined) {
      const player = meta.drivers.find(d =>
        d.isPlayer ||
        (effectivePlayerName && d.name.toLowerCase().includes(effectivePlayerName.toLowerCase())) ||
        (options.driverName && d.name.toLowerCase().includes(options.driverName.toLowerCase()))
      );
      if (player && typeof player.slot === 'number') {
        targetSlot = player.slot;
      }
    }

    if (targetSlot === undefined && meta.drivers.length > 0 && typeof meta.drivers[0].slot === 'number') {
      targetSlot = meta.drivers[0].slot;
    }

    const driverPoints = new Map<number, RawPoint[]>();
    const rawPts: RawPoint[] = [];

    // Sequential streaming slice parser across the full frame stream (16MB chunk buffer)
    const CHUNK_SIZE = 16 * 1024 * 1024;
    const buf = Buffer.alloc(Math.min(CHUNK_SIZE, frameStreamBytes + 16));
    let filePos = 57;
    let carryoverLen = 0;
    let isFirstChunk = true;
    let slicesFound = 0;

    while (filePos < frameStreamEnd) {
      const bytesToRead = Math.min(CHUNK_SIZE - carryoverLen, frameStreamEnd - filePos);
      if (bytesToRead <= 0) break;

      fs.readSync(fd, buf, carryoverLen, bytesToRead, filePos);
      const activeLen = carryoverLen + bytesToRead;
      filePos += bytesToRead;

      let sp = isFirstChunk ? 4 : 0;
      isFirstChunk = false;

      while (true) {
        if (sp + 6 > activeLen) break;
        const sTime = buf.readFloatLE(sp);
        const nEvents = buf.readUInt16LE(sp + 4);

        if (nEvents > 250 || sTime < 0 || sTime > 100000) {
          filePos = frameStreamEnd;
          break;
        }

        let tempSp = sp + 6;
        let canParseSlice = true;
        for (let e = 0; e < nEvents; e++) {
          if (tempSp + 4 > activeLen) { canParseSlice = false; break; }
          const h = buf.readUInt32LE(tempSp);
          const sz = (h >> 8) & 0x1ff;
          tempSp += 4 + 1 + sz;
          if (tempSp > activeLen) { canParseSlice = false; break; }
        }
        if (!canParseSlice) break;

        slicesFound++;
        let eventSp = sp + 6;
        for (let e = 0; e < nEvents; e++) {
          const h = buf.readUInt32LE(eventSp);
          const sz = (h >> 8) & 0x1ff;
          const drv = h & 0xff;

          if (sz === 65) {
            const x = buf.readFloatLE(eventSp + 5 + 41);
            const y = buf.readFloatLE(eventSp + 5 + 45);
            const z = buf.readFloatLE(eventSp + 5 + 49);
            const rotY = buf.readFloatLE(eventSp + 5 + 57);
            const raw16 = buf.readUInt16LE(eventSp + 5 + 4);
            const steer10 = raw16 & 0x3ff;
            const steerYaw = Math.round(((steer10 - 512) / 512) * 540);

            // Byte 5 is the raw 8-bit throttle pedal (1 = 0% idle/lift, 249 = 100% full throttle)
            const rawThrByte = buf[eventSp + 5 + 5];
            const rawThrottle = rawThrByte <= 1 ? 0 : Math.min(100, Math.round(((rawThrByte - 1) / 248) * 100));

            // Byte 36 is the raw brake input (0 = 0%, bits 0..5 = analog brake pressure up to 63, bit 6 = ABS active, bit 7 = TC active)
            const rawBrkByte = buf[eventSp + 5 + 36];
            const rawBrake = rawBrkByte === 0 ? 0 : Math.min(100, Math.round(((rawBrkByte & 0x3f) / 63) * 100));
            const absActive = Boolean(rawBrkByte & 0x40);
            const tcActive = Boolean(rawBrkByte & 0x80);

            // Byte 38 is vehicle status & surface/pit flags:
            // bit 0 (0x01) = off-track surface / track limit cut
            // bit 2 (0x04) = pit limiter active (holding 60 km/h)
            // bit 7 (0x80) = inside pit lane boundary
            const statusByte = buf[eventSp + 5 + 38];
            const isOffTrack = Boolean(statusByte & 0x01);
            const pitLimiter = Boolean(statusByte & 0x04);
            const inPit = Boolean(statusByte & 0x80);

            if (Math.abs(x) < 20000 && Math.abs(z) < 20000 && !isNaN(x) && !isNaN(z)) {
              if (targetSlot !== undefined) {
                if (drv === targetSlot) {
                  rawPts.push({ sTime, x, y, z, rotY, steerYaw, rawThrottle, rawBrake, tcActive, absActive, pitLimiter, inPit, isOffTrack });
                }
              } else {
                let pts = driverPoints.get(drv);
                if (!pts) {
                  pts = [];
                  driverPoints.set(drv, pts);
                }
                pts.push({ sTime, x, y, z, rotY, steerYaw, rawThrottle, rawBrake, tcActive, absActive, pitLimiter, inPit, isOffTrack });
              }
            }
          }
          eventSp += 4 + 1 + sz;
        }
        sp = eventSp;
      }

      carryoverLen = activeLen - sp;
      if (carryoverLen > 0) {
        buf.copy(buf, 0, sp, activeLen);
      }
    }

    // Fallback parser for synthetic mock test buffers or non-standard streams
    if (slicesFound === 0 || (rawPts.length === 0 && driverPoints.size === 0)) {
      const sig = Buffer.from([0x41, 0x10]);
      let scanPos = 0;
      let mockTime = 0;
      const fullBuf = Buffer.alloc(Math.min(frameStreamBytes, 10 * 1024 * 1024));
      fs.readSync(fd, fullBuf, 0, fullBuf.length, 57);

      while (scanPos < fullBuf.length - 70) {
        const idx = fullBuf.indexOf(sig, scanPos);
        if (idx === -1 || idx + 68 > fullBuf.length) break;

        if (idx > 0) {
          const slot = fullBuf[idx - 1];
          const rec = fullBuf.subarray(idx - 1, idx - 1 + 70);
          const x = rec.readFloatLE(46);
          const y = rec.readFloatLE(50);
          const z = rec.readFloatLE(54);
          const rotY = rec.readFloatLE(62);

          if (Math.abs(x) < 20000 && Math.abs(z) < 20000 && !isNaN(x) && !isNaN(z)) {
            let pts = driverPoints.get(slot);
            if (!pts) {
              pts = [];
              driverPoints.set(slot, pts);
            }
            mockTime += 0.02;
            pts.push({ sTime: mockTime, x, y, z, rotY });
          }
        }
        scanPos = idx + 2;
      }
    }

    if (rawPts.length === 0 && targetSlot !== undefined && driverPoints.has(targetSlot)) {
      rawPts.push(...driverPoints.get(targetSlot)!);
    } else if (rawPts.length === 0 && targetSlot === undefined && driverPoints.size > 0) {
      targetSlot = Array.from(driverPoints.keys())[0];
      rawPts.push(...driverPoints.get(targetSlot)!);
    }

    const maxPoints = options.maxPoints !== undefined ? options.maxPoints : 1200;

    // Filter out transmission-actuated upshift ignition cuts and downshift rev-match blips
    // to preserve true driver pedal intent in telemetry traces.
    if (rawPts.length > 2) {
      // 1. Remove downshift auto-blips: during active braking (brake > 8), throttle blips are zeroed out
      for (let i = 0; i < rawPts.length; i++) {
        const brk = rawPts[i].rawBrake ?? 0;
        const thr = rawPts[i].rawThrottle ?? 0;
        if (brk > 8 && thr > 0) {
          let preLow = false;
          for (let k = 1; k <= 6; k++) {
            if (i - k >= 0 && (rawPts[i - k].rawThrottle ?? 0) <= 15) { preLow = true; break; }
          }
          let postLow = false;
          for (let k = 1; k <= 6; k++) {
            if (i + k < rawPts.length && (rawPts[i + k].rawThrottle ?? 0) <= 15) { postLow = true; break; }
          }
          if (preLow && postLow) {
            rawPts[i].rawThrottle = 0;
          }
        }
      }

      // 2. Remove upshift cuts: brief dropouts (< 140ms / ~7 frames) when braking is 0 and surrounding throttle was high
      for (let i = 1; i < rawPts.length - 1; i++) {
        const curThr = rawPts[i].rawThrottle ?? 0;
        const curBrk = rawPts[i].rawBrake ?? 0;
        if (curThr < 70 && curBrk === 0) {
          let preIdx = -1;
          for (let k = 1; k <= 4; k++) {
            if (i - k >= 0 && (rawPts[i - k].rawThrottle ?? 0) >= 70 && (rawPts[i - k].rawBrake ?? 0) === 0) {
              preIdx = i - k;
              break;
            }
          }
          if (preIdx !== -1) {
            let postIdx = -1;
            for (let k = 1; k <= 7; k++) {
              if (i + k < rawPts.length && (rawPts[i + k].rawThrottle ?? 0) >= 70 && (rawPts[i + k].rawBrake ?? 0) === 0) {
                postIdx = i + k;
                break;
              }
            }
            if (postIdx !== -1 && postIdx - preIdx <= 7) {
              const preVal = rawPts[preIdx].rawThrottle ?? 0;
              const postVal = rawPts[postIdx].rawThrottle ?? 0;
              for (let j = preIdx + 1; j < postIdx; j++) {
                const ratio = (j - preIdx) / (postIdx - preIdx);
                rawPts[j].rawThrottle = Math.round(preVal + ratio * (postVal - preVal));
              }
              i = postIdx;
            }
          }
        }
      }
    }

    // 3. Detect laps and 3 sectors per lap
    // Compute cumulative distance along the vehicle path, ignoring teleport anomalies
    const cumDist: number[] = [0];
    for (let i = 1; i < rawPts.length; i++) {
      const d = Math.hypot(rawPts[i].x - rawPts[i - 1].x, rawPts[i].z - rawPts[i - 1].z);
      if (d < 60) {
        cumDist.push(cumDist[cumDist.length - 1] + d);
      } else {
        cumDist.push(cumDist[cumDist.length - 1]);
      }
    }

    interface DetectedLapInternal {
      lapNumber: number;
      startIdx: number;
      endIdx: number;
      lapTimeSec: number;
      lapDistMeters: number;
      s1Sec: number;
      s2Sec: number;
      s3Sec: number;
      s1Idx: number;
      s2Idx: number;
      isOutlap: boolean;
      isBest: boolean;
    }

    let detectedLaps: DetectedLapInternal[] = [];

    if (rawPts.length >= 30) {
      let refIdx = rawPts.findIndex((_, i) => cumDist[i] > 100);
      if (refIdx === -1) refIdx = 0;
      const refPt = rawPts[refIdx];
      const nextPt = rawPts[Math.min(rawPts.length - 1, refIdx + 5)];
      const refHeading = Math.atan2(nextPt.z - refPt.z, nextPt.x - refPt.x);

      const candidateCrossings: { idx: number; t: number; d: number }[] = [];
      for (let i = refIdx + 50; i < rawPts.length - 5; i++) {
        const d = Math.hypot(rawPts[i].x - refPt.x, rawPts[i].z - refPt.z);
        if (d < 25) {
          const heading = Math.atan2(rawPts[i + 5].z - rawPts[i].z, rawPts[i + 5].x - rawPts[i].x);
          const headingDiff = Math.abs(Math.atan2(Math.sin(heading - refHeading), Math.cos(heading - refHeading)));
          if (headingDiff < 0.8) {
            candidateCrossings.push({ idx: i, t: rawPts[i].sTime, d });
          }
        }
      }

      const lapCrossings: number[] = [refIdx];
      let lastCrossingTime = rawPts[refIdx].sTime;
      let curCluster: { idx: number; t: number; d: number }[] = [];

      for (const c of candidateCrossings) {
        if (c.t - lastCrossingTime > 40) {
          if (curCluster.length === 0 || c.t - curCluster[curCluster.length - 1].t < 5) {
            curCluster.push(c);
          } else {
            const best = curCluster.reduce((min, p) => (p.d < min.d ? p : min), curCluster[0]);
            lapCrossings.push(best.idx);
            lastCrossingTime = best.t;
            curCluster = [c];
          }
        }
      }
      if (curCluster.length > 0) {
        const best = curCluster.reduce((min, p) => (p.d < min.d ? p : min), curCluster[0]);
        lapCrossings.push(best.idx);
      }

      if (lapCrossings.length > 1) {
        for (let l = 0; l < lapCrossings.length - 1; l++) {
          const startIdx = lapCrossings[l];
          const endIdx = lapCrossings[l + 1];
          const lapTime = rawPts[endIdx].sTime - rawPts[startIdx].sTime;
          const lapDist = cumDist[endIdx] - cumDist[startIdx];
          const s1TargetDist = cumDist[startIdx] + lapDist * 0.3333;
          const s2TargetDist = cumDist[startIdx] + lapDist * 0.6667;
          let s1Idx = startIdx;
          while (s1Idx < endIdx && cumDist[s1Idx] < s1TargetDist) s1Idx++;
          let s2Idx = s1Idx;
          while (s2Idx < endIdx && cumDist[s2Idx] < s2TargetDist) s2Idx++;

          detectedLaps.push({
            lapNumber: l + 1,
            startIdx,
            endIdx,
            lapTimeSec: Number(lapTime.toFixed(3)),
            lapDistMeters: Math.round(lapDist),
            s1Sec: Number((rawPts[s1Idx].sTime - rawPts[startIdx].sTime).toFixed(3)),
            s2Sec: Number((rawPts[s2Idx].sTime - rawPts[s1Idx].sTime).toFixed(3)),
            s3Sec: Number((rawPts[endIdx].sTime - rawPts[s2Idx].sTime).toFixed(3)),
            s1Idx,
            s2Idx,
            isOutlap: l === 0,
            isBest: false,
          });
        }

        // Find fastest flying lap
        const flyingLaps = detectedLaps.filter(l => !l.isOutlap);
        const pool = flyingLaps.length > 0 ? flyingLaps : detectedLaps;
        let minTime = Infinity;
        let bestLapNum = pool[0]?.lapNumber;
        for (const l of pool) {
          if (l.lapTimeSec < minTime) {
            minTime = l.lapTimeSec;
            bestLapNum = l.lapNumber;
          }
        }
        detectedLaps.forEach(l => {
          if (l.lapNumber === bestLapNum) l.isBest = true;
        });
      }
    }

    if (detectedLaps.length === 0) {
      const startIdx = 0;
      const endIdx = Math.max(0, rawPts.length - 1);
      const lapDist = cumDist.length > 0 ? cumDist[endIdx] - cumDist[startIdx] : 0;
      const s1TargetDist = (cumDist[startIdx] || 0) + lapDist * 0.3333;
      const s2TargetDist = (cumDist[startIdx] || 0) + lapDist * 0.6667;
      let s1Idx = startIdx;
      while (s1Idx < endIdx && cumDist[s1Idx] < s1TargetDist) s1Idx++;
      let s2Idx = s1Idx;
      while (s2Idx < endIdx && cumDist[s2Idx] < s2TargetDist) s2Idx++;

      detectedLaps = [{
        lapNumber: 1,
        startIdx,
        endIdx,
        lapTimeSec: rawPts.length > 0 ? Number((rawPts[endIdx].sTime - rawPts[startIdx].sTime).toFixed(3)) : 0,
        lapDistMeters: Math.round(lapDist),
        s1Sec: rawPts.length > 0 ? Number((rawPts[s1Idx].sTime - rawPts[startIdx].sTime).toFixed(3)) : 0,
        s2Sec: rawPts.length > 0 ? Number((rawPts[s2Idx].sTime - rawPts[s1Idx].sTime).toFixed(3)) : 0,
        s3Sec: rawPts.length > 0 ? Number((rawPts[endIdx].sTime - rawPts[s2Idx].sTime).toFixed(3)) : 0,
        s1Idx,
        s2Idx,
        isOutlap: false,
        isBest: true,
      }];
    }

    // Select chosen lap
    let chosen = detectedLaps.find(l => l.lapNumber === options.lapNumber);
    if (!chosen) {
      chosen = detectedLaps.find(l => l.isBest) || detectedLaps[0];
    }

    // Slice raw points strictly for the chosen lap
    const lapRawPts = rawPts.slice(chosen.startIdx, chosen.endIdx + 1);
    const rawPointsCount = lapRawPts.length;
    const lapDuration = chosen.lapTimeSec || (rawPts.length > 0 ? Math.max(0.001, rawPts[chosen.endIdx].sTime - rawPts[chosen.startIdx].sTime) : 0);
    const rawSampleRateHz = lapDuration > 0 && rawPointsCount > 1
      ? Math.round((rawPointsCount - 1) / lapDuration)
      : 0;

    // Downsample chosen lap to maxPoints (e.g. 1200, 2400; if maxPoints is 0, preserve 100% full raw fidelity)
    let downsampled = lapRawPts;
    if (maxPoints > 0 && lapRawPts.length > maxPoints) {
      const step = lapRawPts.length / maxPoints;
      downsampled = [];
      for (let i = 0; i < maxPoints; i++) {
        downsampled.push(lapRawPts[Math.min(lapRawPts.length - 1, Math.floor(i * step))]);
      }
    }

    const lapSpan = Math.max(1, chosen.endIdx - chosen.startIdx);
    const s1Fraction = (chosen.s1Idx - chosen.startIdx) / lapSpan;
    const s2Fraction = (chosen.s2Idx - chosen.startIdx) / lapSpan;
    const targetFrames = downsampled.length;
    const s1Frame = Math.min(targetFrames - 1, Math.round(s1Fraction * targetFrames));
    const s2Frame = Math.min(targetFrames - 1, Math.round(s2Fraction * targetFrames));

    // Calculate speeds between points
    const rawSpeeds: number[] = [];
    for (let i = 0; i < downsampled.length; i++) {
      const cur = downsampled[i];
      let speed = 0;
      if (i > 0) {
        const prev = downsampled[i - 1];
        const dt = cur.sTime - prev.sTime;
        const dist = Math.hypot(cur.x - prev.x, cur.z - prev.z);
        if (dt > 0.005 && dist < 60) {
          speed = (dist / dt) * 3.6;
        }
      }
      rawSpeeds.push(speed);
    }

    // Smooth speed, calculate acceleration, throttle, and brake
    const finalPoints: ReplayTrajectoryPoint[] = [];
    for (let i = 0; i < downsampled.length; i++) {
      const cur = downsampled[i];
      const prevSpeed = i > 0 ? rawSpeeds[i - 1] : rawSpeeds[i];
      const curSpeed = rawSpeeds[i];
      const nextSpeed = i < downsampled.length - 1 ? rawSpeeds[i + 1] : rawSpeeds[i];
      let smoothSpeed = (prevSpeed + curSpeed + nextSpeed) / 3;

      if (smoothSpeed < 1.5) smoothSpeed = 0;
      if (smoothSpeed > 380) smoothSpeed = 0;

      let accel = 0;
      if (i > 0 && i < downsampled.length - 1) {
        const dt = downsampled[i + 1].sTime - downsampled[i - 1].sTime;
        if (dt > 0.01) {
          accel = ((rawSpeeds[i + 1] - rawSpeeds[i - 1]) / 3.6) / dt; // m/s^2
        }
      }

      // Physics-informed vehicle dynamics estimation
      // Aerodynamic drag increases with v^2, naturally reducing net vehicle acceleration at high speeds.
      // Total engine force required = inertial acceleration + aero drag resistance.
      const vKmh = smoothSpeed;
      const aDrag = 0.00042 * (vKmh * vKmh); // m/s^2 drag deceleration
      const effectiveEngineAccel = accel + aDrag;

      // Use raw replay telemetry if available; otherwise fall back to physics estimation
      let throttle = cur.rawThrottle ?? 0;
      let brake = cur.rawBrake ?? 0;

      if (cur.rawThrottle === undefined && cur.rawBrake === undefined && smoothSpeed >= 1.0) {
        if (accel < -0.8) {
          // Hard braking zone
          throttle = 0;
          brake = Math.min(100, Math.max(0, Math.round(((-accel) / 10.0) * 100)));
        } else if (accel < -0.2) {
          // Coasting / lift-off phase before braking
          throttle = 0;
          brake = Math.min(25, Math.max(0, Math.round(((-accel) / 1.0) * 25)));
        } else if (effectiveEngineAccel > 0.4) {
          // Active acceleration phase
          const steerAngle = Math.abs(cur.steerYaw ?? 0);
          if (steerAngle < 25 && accel > 0.12) {
            // Accelerating down a straight in a race car is 100% full throttle
            throttle = 100;
          } else {
            // Corner exit or partial throttle modulation
            const expectedMaxA = Math.max(1.8, 3.8 - (vKmh / 200));
            throttle = Math.min(100, Math.max(20, Math.round((effectiveEngineAccel / expectedMaxA) * 100)));
          }
        } else {
          // Holding steady speed / corner balancing
          throttle = Math.min(30, Math.max(5, Math.round(smoothSpeed / 10)));
        }
      }

      const rpm = smoothSpeed < 1 ? 950 : Math.min(8800, Math.max(2500, Math.round(3000 + (smoothSpeed % 45) * 120)));

      // Detect unnatural teleports, returns to garage, and resets
      let isTeleport = false;
      if (i > 0) {
        const prev = downsampled[i - 1];
        const dist = Math.hypot(cur.x - prev.x, cur.z - prev.z);
        const dt = cur.sTime - prev.sTime;
        const impliedSpeed = dt > 0.001 ? (dist / dt) * 3.6 : 0;
        if (dist > 85 || impliedSpeed > 420 || (dist > 25 && prevSpeed === 0 && curSpeed === 0)) {
          isTeleport = true;
        }
      }

      const inGarage = smoothSpeed < 1;

      finalPoints.push({
        x: Number(cur.x.toFixed(2)),
        y: Number(cur.y.toFixed(2)),
        z: Number(cur.z.toFixed(2)),
        rotY: Number(cur.rotY.toFixed(3)),
        speedKmh: Math.round(smoothSpeed),
        throttle,
        brake,
        steerYaw: cur.steerYaw ?? 0,
        rpm,
        inPit: cur.inPit,
        isOffTrack: cur.isOffTrack,
        inGarage,
        isTeleport,
        timeSec: Number(cur.sTime.toFixed(2)),
        tcActive: cur.tcActive,
        absActive: cur.absActive,
        pitLimiter: cur.pitLimiter,
      });
    }

    // Calculate track bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of finalPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    if (!isFinite(minX)) {
      minX = 0; maxX = 0; minZ = 0; maxZ = 0;
    }

    const matchedDriver = meta.drivers.find(d => d.slot === targetSlot);
    const driverName = matchedDriver?.name || (targetSlot !== undefined ? `Driver ${targetSlot}` : undefined);

    const lapsSummary: ReplayLapSummary[] = detectedLaps.map(l => ({
      lapNumber: l.lapNumber,
      lapTimeSec: l.lapTimeSec,
      lapDistMeters: l.lapDistMeters,
      s1Sec: l.s1Sec,
      s2Sec: l.s2Sec,
      s3Sec: l.s3Sec,
      isOutlap: l.isOutlap,
      isBest: l.isBest,
      startFrame: 0,
      endFrame: targetFrames,
    }));

    return {
      replayName: path.basename(filePath),
      driverSlot: targetSlot,
      driverName,
      pointsCount: finalPoints.length,
      rawPointsCount,
      rawSampleRateHz,
      maxPoints: options.maxPoints,
      isFullResolution: finalPoints.length >= rawPointsCount,
      currentLap: chosen.lapNumber,
      laps: lapsSummary,
      sectors: {
        s1Frame,
        s2Frame,
      },
      bounds: {
        minX: Number(minX.toFixed(2)),
        maxX: Number(maxX.toFixed(2)),
        minZ: Number(minZ.toFixed(2)),
        maxZ: Number(maxZ.toFixed(2)),
        spanX: Number((maxX - minX).toFixed(2)),
        spanZ: Number((maxZ - minZ).toFixed(2)),
      },
      points: finalPoints,
    };
  } finally {
    fs.closeSync(fd);
  }
}
