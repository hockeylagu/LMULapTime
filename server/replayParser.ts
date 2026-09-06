import fs from 'fs';
import path from 'path';
import {
  ReplayMetadata,
  ReplayDriverEntry,
  ReplayTrajectoryData,
  ReplayTrajectoryPoint,
  ReplayEventInfo,
  ReplayLapSummary,
  ReplayPenaltyEvent,
  ReplayPitEvent,
} from './types.js';

// Friendly car name mapping from known LMU skin/vehicle ID tokens
// NOTE: Specific tokens (RSR, 499P, DSTATI) must be checked BEFORE generic substrings
// (911, 296) to prevent false matches on vehicle IDs like "911_RSR".
export function mapVehicleIdToModel(vehicleId?: string): string {
  if (!vehicleId) return 'Unknown Vehicle';
  const v = vehicleId.toUpperCase();

  // --- GTE: specific tokens first to avoid being swallowed by generic GT3 checks ---
  if (v.includes('DSTATI')) return 'Aston Martin Vantage AMR';
  if (v.includes('RSR') || v.includes('REXY')) return 'Porsche 911 RSR-19';
  if (v.includes('KESSEL') || v.includes('488')) return 'Ferrari 488 GTE EVO';

  // --- GT3 ---
  if (v.includes('AFCO') || v.includes('296')) return 'Ferrari 296 GT3';
  if (v.includes('WRT') || v.includes('M4')) return 'BMW M4 GT3';
  if (v.includes('MUSTANG')) return 'Ford Mustang GT3';
  if (v.includes('GCHAL')) return 'McLaren 720S GT3 Evo';
  if (v.includes('GARA') || v.includes('720S')) return 'McLaren 720S GT3 Evo';
  if (v.includes('MANT') || v.includes('911')) return 'Porsche 911 GT3 R';
  if (v.includes('IRON') || v.includes('HURACAN')) return 'Lamborghini Huracan GT3 Evo2';
  if (v.includes('PROT')) return 'Ford Mustang GT3';
  if (v.includes('TFSP') || v.includes('CORVETTE')) return 'Corvette Z06 GT3.R';
  if (v.includes('AKKO') || v.includes('LEXUS')) return 'Lexus RC F GT3';
  if (v.includes('AMG') || v.includes('MERCEDES')) return 'Mercedes-AMG GT3';
  if (v.includes('THOR') || v.includes('VANTAGE')) return 'Aston Martin Vantage GT3';

  // --- Hypercar / LMH / LMDh ---
  if (v.includes('499P')) return 'Ferrari 499P';
  if (v.includes('963')) return 'Porsche 963';
  if (v.includes('WTR') || v.includes('V-SERIES') || v.includes('CADILLAC') || v.includes('CADIL') || v.includes('VLMDH')) return 'Cadillac V-Series.R';
  if (v.includes('GR010') || v.includes('TR010') || v.includes('TOYOTA')) return 'Toyota GR010 Hybrid';
  if (v.includes('9X8') || v.includes('PEUGEOT') || v.includes('PEUG')) return 'Peugeot 9X8';
  if (v.includes('A424') || v.includes('ALPINE') || v.includes('ALPI')) return 'Alpine A424';
  if (v.includes('SC63') || v.includes('LAMBORGHINI')) return 'Lamborghini SC63';
  if (v.includes('ISOTTA')) return 'Isotta Fraschini Tipo 6';
  if (v.includes('BMW_HY') || v.includes('M_HYBRID') || v.includes('BMWMH')) return 'BMW M Hybrid V8';
  if (v.includes('VALKYRIE') || v.includes('THO7') || v.includes('007_')) return 'Aston Martin Valkyrie LMH';
  if (v.includes('GENESIS') || v.includes('GENE') || v.includes('GMR001')) return 'Genesis GMR001 Hypercar';

  // --- LMP3 ---
  if (v.includes('GINETTA') || v.includes('G61')) return 'Ginetta G61-LT-P325 Evo';
  if (v.includes('DUQUEINE') || v.includes('D09') || v.includes('D08')) return 'Duqueine D09 P3';
  if (v.includes('LIGIER') || v.includes('JSP')) return 'Ligier JS P325';
  if (v.includes('ADESS') || v.includes('AD25')) return 'ADESS AD25 LMP3';

  // --- LMP2 ---
  if (v.includes('ORECA') || v.includes('VECTOR') || v.includes('DKR') || v.includes('LMP2') || v.includes('07_LMP2')) return 'Oreca 07 LMP2';
  if (v.includes('992S') || v.includes('SAFETY')) return 'Porsche 992 (Safety Car)';
  return vehicleId;
}

export function mapVehicleIdToClass(vehicleId?: string, carModel?: string): string {
  const model = carModel || mapVehicleIdToModel(vehicleId);
  const combined = `${vehicleId || ''} ${model}`.toUpperCase();

  // GTE
  if (
    combined.includes('GTE') ||
    combined.includes('DSTATI') ||
    combined.includes('KESSEL') ||
    combined.includes('RSR') ||
    combined.includes('REXY') ||
    combined.includes('488')
  ) {
    return 'GTE';
  }

  // GT3 / LMGT3
  if (
    combined.includes('GT3') ||
    combined.includes('AFCO') ||
    combined.includes('296') ||
    combined.includes('WRT') ||
    combined.includes('M4') ||
    combined.includes('MUSTANG') ||
    combined.includes('PROT') ||
    combined.includes('VANTAGE') ||
    combined.includes('MANT') ||
    combined.includes('911') ||
    combined.includes('GARA') ||
    combined.includes('720S') ||
    combined.includes('GCHAL') ||
    combined.includes('HURACAN') ||
    combined.includes('IRON') ||
    combined.includes('CORVETTE') ||
    combined.includes('TFSP') ||
    combined.includes('LEXUS') ||
    combined.includes('AKKO') ||
    combined.includes('AMG')
  ) {
    return 'LMGT3';
  }

  // Hypercar / LMH / LMDh
  if (
    combined.includes('499P') ||
    combined.includes('963') ||
    combined.includes('CADILLAC') ||
    combined.includes('CADIL') ||
    combined.includes('V-SERIES') ||
    combined.includes('VLMDH') ||
    combined.includes('WTR') ||
    combined.includes('TOYOTA') ||
    combined.includes('GR010') ||
    combined.includes('TR010') ||
    combined.includes('PEUGEOT') ||
    combined.includes('PEUG') ||
    combined.includes('9X8') ||
    combined.includes('ALPINE') ||
    combined.includes('ALPI') ||
    combined.includes('A424') ||
    combined.includes('SC63') ||
    combined.includes('ISOTTA') ||
    combined.includes('M HYBRID') ||
    combined.includes('BMW_HY') ||
    combined.includes('BMWMH') ||
    combined.includes('VALKYRIE') ||
    combined.includes('THO7') ||
    combined.includes('007_') ||
    combined.includes('GENESIS') ||
    combined.includes('GENE') ||
    combined.includes('GMR001') ||
    combined.includes('HYPER') ||
    combined.includes('LMH') ||
    combined.includes('LMDH')
  ) {
    return 'LMH';
  }

  // LMP3
  if (
    combined.includes('LMP3') ||
    combined.includes('GINETTA') ||
    combined.includes('G61') ||
    combined.includes('DUQUEINE') ||
    combined.includes('D09') ||
    combined.includes('D08') ||
    combined.includes('LIGIER') ||
    combined.includes('JSP') ||
    combined.includes('ADESS') ||
    combined.includes('AD25')
  ) {
    return 'LMP3';
  }

  // LMP2
  if (
    combined.includes('ORECA') ||
    combined.includes('LMP2') ||
    combined.includes('VECTOR') ||
    combined.includes('DKR')
  ) {
    return combined.includes('ELMS') ? 'LMP2elms' : 'LMP2';
  }

  if (combined.includes('992S') || combined.includes('SAFETY')) {
    return 'Safety Car';
  }

  return '';
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
  const detectedName = detectPlayerName(filePath);
  const effectivePlayerName = options?.playerName || detectedName;
  const stat = fs.statSync(filePath);

  if (stat.size < 64) {
    throw new Error(`Invalid LMU replay file: file too small (${stat.size} bytes) in ${filePath}`);
  }

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
      if (l === 0 || l > 65536 || off + l > meta.length) return '';
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
    const modUid = readStr4();
    const trackPath = readStr4();

    // Decode session info configuration byte (if available right after trackPath)
    let sessionType: string | undefined = undefined;
    let privateSession: boolean | undefined = undefined;
    if (off + 2 <= meta.length) {
      const sessionByte = meta[off + 1];
      const sessionCode = sessionByte & 0x0f;
      privateSession = Boolean((sessionByte >> 7) & 1);
      const SESSION_TYPE_MAP: Record<number, string> = {
        0: 'Test Day',
        1: 'Practice',
        2: 'Practice',
        3: 'Practice',
        4: 'Practice',
        5: 'Qualifying',
        6: 'Qualifying',
        7: 'Qualifying',
        8: 'Qualifying',
        9: 'Warmup',
        10: 'Race',
        11: 'Race',
        12: 'Race',
        13: 'Race',
      };
      if (SESSION_TYPE_MAP[sessionCode]) {
        sessionType = SESSION_TYPE_MAP[sessionCode];
      }
    }

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
      const rawStart = trailer.readFloatLE(12);
      const rawEnd = trailer.readFloatLE(16);
      startTimeSec = isFinite(rawStart) ? rawStart : 0;
      endTimeSec = isFinite(rawEnd) ? rawEnd : 0;
      if (endTimeSec > startTimeSec) {
        durationSec = endTimeSec - startTimeSec;
      }
    }

    function readPStr(buf: Buffer, offset: number): { str: string; nextOffset: number } {
      if (offset >= buf.length) return { str: '', nextOffset: offset };
      const len = buf[offset];
      if (offset + 1 + len > buf.length) return { str: '', nextOffset: offset + 1 };
      const str = buf.toString('utf8', offset + 1, offset + 1 + len).trim();
      return { str, nextOffset: offset + 1 + len };
    }

    // Driver extraction
    const drivers: ReplayDriverEntry[] = [];

    // Method 1: Deterministic Structured Driver Table
    // In LMU/rF2 metadata, after the 69-byte session configuration/conditions block,
    // there is a 4-byte Int32LE total driver count, followed by sequential driver records.
    if (off + 69 + 4 < meta.length) {
      const numDriversOffset = off + 69;
      const numDrivers = meta.readInt32LE(numDriversOffset);
      if (numDrivers >= 1 && numDrivers <= 128) {
        let dOff = numDriversOffset + 4;
        let curSlot = meta[dOff];
        dOff += 1;
        let validStructuredDrivers = true;
        const structDrivers: ReplayDriverEntry[] = [];

        for (let d = 0; d < numDrivers; d++) {
          if (dOff >= meta.length) { validStructuredDrivers = false; break; }
          const sName = readPStr(meta, dOff); dOff = sName.nextOffset;
          const sVeh = readPStr(meta, dOff); dOff = sVeh.nextOffset;
          const sLiv = readPStr(meta, dOff); dOff = sLiv.nextOffset;
          const sTeam = readPStr(meta, dOff); dOff = sTeam.nextOffset;
          const sCarNum = readPStr(meta, dOff); dOff = sCarNum.nextOffset;

          if (!sName.str || dOff + 24 > meta.length) {
            validStructuredDrivers = false;
            break;
          }

          const fixed = meta.subarray(dOff, dOff + 24);
          dOff += 24;
          const rawEntry = fixed.readFloatLE(16);
          const rawExit = fixed.readFloatLE(20);
          const entryTime = isFinite(rawEntry) && rawEntry >= 0 && rawEntry < 1e8 ? Number(rawEntry.toFixed(2)) : undefined;
          const exitTime = isFinite(rawExit) && rawExit >= 0 && rawExit < 1e8 ? Number(rawExit.toFixed(2)) : undefined;

          const isPlayer = Boolean(
            effectivePlayerName && (
              sName.str.toLowerCase() === effectivePlayerName.toLowerCase() ||
              sName.str.toLowerCase().includes(effectivePlayerName.toLowerCase())
            )
          );

          const carModel = mapVehicleIdToModel(sVeh.str);
          const carClass = mapVehicleIdToClass(sVeh.str, carModel);

          structDrivers.push({
            slot: curSlot,
            name: sName.str,
            vehicleId: sVeh.str || undefined,
            carModel,
            carClass: carClass || undefined,
            livery: sLiv.str || undefined,
            team: sTeam.str || undefined,
            carNumber: sCarNum.str || undefined,
            entryTime,
            exitTime,
            isPlayer,
          });

          if (d < numDrivers - 1) {
            if (dOff + 4 > meta.length) { validStructuredDrivers = false; break; }
            dOff += 2; // skip index
            curSlot = meta.readUInt16BE(dOff);
            dOff += 2; // read next slot
          }
        }

        if (validStructuredDrivers && structDrivers.length === numDrivers) {
          drivers.push(...structDrivers);
        }
      }
    }

    // Method 2: Binary scan for LMU driver records (fallback if structured table missing or damaged)
    if (drivers.length === 0) {
      const driverRegion = meta.subarray(off, meta.length >= 28 ? meta.length - 28 : meta.length);
      const seenSlots = new Set<number>();
      const seenNames = new Set<string>();

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

                const carModel = mapVehicleIdToModel(sVehicle.str);
                const carClass = mapVehicleIdToClass(sVehicle.str, carModel);

                drivers.push({
                  slot,
                  name: str,
                  vehicleId: sVehicle.str || undefined,
                  carModel,
                  carClass: carClass || undefined,
                  livery: sLivery.str || undefined,
                  team: sTeam.str || undefined,
                  carNumber: sCarNum.str || undefined,
                  isPlayer,
                });
              }
            }
          }
        }
      }
    }

    if (effectivePlayerName && drivers.length > 0) {
      const explicitName = options?.playerName?.trim().toLowerCase();
      // Reuse the cached detectedName instead of re-reading settings.json from disk
      const profileName = !explicitName ? detectedName?.trim().toLowerCase() : undefined;
      const targetLower = explicitName || profileName || effectivePlayerName.trim().toLowerCase();

      // 1. Exact match with target name
      let bestMatch = drivers.find(d => d.name.toLowerCase() === targetLower);

      // 2. Substring match with target name
      if (!bestMatch) {
        const matched = drivers.filter(d => d.name.toLowerCase().includes(targetLower));
        if (matched.length > 0) {
          // If multiple candidates match (e.g. "Samuel Dominguez" vs "Samuel Lague" with target "samuel"),
          // check if settings profileName matches one of them (reuse cached detectedName)
          const envProfile = detectedName?.trim().toLowerCase();
          bestMatch = matched.find(d => envProfile && d.name.toLowerCase() === envProfile)
            || matched.find(d => envProfile && d.name.toLowerCase().includes(envProfile))
            || matched.find(d => new RegExp(`\\b${targetLower}\\b`, 'i').test(d.name))
            || matched[0];
        }
      }

      drivers.forEach(d => {
        d.isPlayer = Boolean(bestMatch && d.slot === bestMatch.slot && d.name === bestMatch.name);
      });
    }

    const playerDriver = drivers.find(d => d.isPlayer) || drivers[0];
    const replayCarClass = playerDriver?.carClass;
    const replayCarModel = playerDriver?.carModel;

    return {
      filename: path.basename(filePath),
      filePath,
      fileSizeBytes: stat.size,
      mtimeMs: stat.mtime.getTime(),
      eventInfo,
      sessionType,
      privateSession,
      scn: scn || undefined,
      aiw: aiw || undefined,
      trackName: trackName || undefined,
      trackVersion: trackVersion || undefined,
      modUid: modUid || undefined,
      trackPath: trackPath || undefined,
      timeSliceCount,
      totalEvents,
      durationSec,
      startTimeSec,
      endTimeSec,
      drivers,
      carClass: replayCarClass,
      carModel: replayCarModel,
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
  rotX?: number;
  rotY: number;
  rotZ?: number;
  steerYaw?: number;
  rawThrottle?: number;
  rawBrake?: number;
  tcActive?: boolean;
  absActive?: boolean;
  pitLimiter?: boolean;
  inPit?: boolean;
  isOffTrack?: boolean;
  physicsRpm?: number;
  gearRaw?: number;
  detachablePartState?: number;
  tireTemps?: [number, number, number, number];
  tireWear?: [number, number, number, number];
  brakeTemps?: [number, number, number, number];
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
    sessionLaps?: Array<{
      lapNum?: number;
      lapNumber?: number;
      lapTime?: number | null;
      lapTimeSec?: number | null;
      elapsedSeconds?: number | null;
      s1?: number | null;
      s2?: number | null;
      s3?: number | null;
      isValid?: boolean;
      isOutLap?: boolean;
    }>;
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
      let player = meta.drivers.find(d => d.isPlayer);
      if (!player && effectivePlayerName) {
        player = meta.drivers.find(d => d.name.toLowerCase() === effectivePlayerName.toLowerCase());
      }
      if (!player) {
        player = meta.drivers.find(d =>
          (effectivePlayerName && d.name.toLowerCase().includes(effectivePlayerName.toLowerCase())) ||
          (options.driverName && d.name.toLowerCase().includes(options.driverName.toLowerCase()))
        );
      }
      if (player && typeof player.slot === 'number') {
        targetSlot = player.slot;
      }
    }

    if (targetSlot === undefined && meta.drivers.length > 0 && typeof meta.drivers[0].slot === 'number') {
      targetSlot = meta.drivers[0].slot;
    }

    const driverPoints = new Map<number, RawPoint[]>();
    const rawPts: RawPoint[] = [];
    const vcrTimingEvents: Array<{ sTime: number; drv: number; splitSec: number; sector: number; lapIdx: number }> = [];
    const replayPenalties: ReplayPenaltyEvent[] = [];
    const replayPitEvents: ReplayPitEvent[] = [];
    const driverWheelTelemetry = new Map<number, {
      tireTemps?: [number, number, number, number];
      tireWear?: [number, number, number, number];
      brakeTemps?: [number, number, number, number];
    }>();

    // Sequential streaming slice parser across the full frame stream (16MB chunk buffer)
    const CHUNK_SIZE = 16 * 1024 * 1024;
    const buf = Buffer.alloc(Math.min(CHUNK_SIZE, frameStreamBytes + 16));
    let filePos = 57;
    let carryoverLen = 0;
    let isFirstChunk = true;
    let slicesFound = 0;

    const driverNameMap = new Map<number, string>();
    for (const d of meta.drivers) {
      if (typeof d.slot === 'number') {
        driverNameMap.set(d.slot, d.name);
      }
    }

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
          const sz = (h >>> 8) & 0x1ff;
          const drv = h & 0xff;
          const evClass = (h >>> 29);
          const evType = (h >>> 17) & 0x3f;

          if (sz === 65) {
            if (targetSlot !== undefined && drv !== targetSlot) {
              eventSp += 4 + 1 + sz;
              continue;
            }

            const x = buf.readFloatLE(eventSp + 5 + 41);
            const y = buf.readFloatLE(eventSp + 5 + 45);
            const z = buf.readFloatLE(eventSp + 5 + 49);

            if (Math.abs(x) < 20000 && Math.abs(z) < 20000 && !isNaN(x) && !isNaN(z)) {
              const rotX = buf.readFloatLE(eventSp + 5 + 53);
              const rotY = buf.readFloatLE(eventSp + 5 + 57);
              const rotZ = buf.readFloatLE(eventSp + 5 + 61);

              const info1 = buf.readUInt32LE(eventSp + 5);
              const info2 = buf.readUInt32LE(eventSp + 5 + 4);

              const rawRpm = (info1 >>> 18);
              const physicsRpm = rawRpm > 0 && rawRpm <= 16383 ? rawRpm : undefined;
              const detachablePartState = info2 & 0x3ff;

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
              const latestWheel = driverWheelTelemetry.get(drv);

              // Gear is encoded directly in the event header's type field (confirmed via the
              // rF2ReplayOffice reference tool source): evType ranges 7-15 for vehicle pose
              // events, mapping to gear = evType - 8 (7 => reverse (-1), 8 => neutral, 9-15 =>
              // gears 1-7). Available for every driver, not just the local player. The
              // reference tool gates this on evClass === 0, but current LMU replay format
              // versions use evClass === 1 for these same vehicle pose events.
              const gearRaw = evType >= 7 && evType <= 15 ? evType - 8 : undefined;

              const pt: RawPoint = {
                sTime,
                x,
                y,
                z,
                rotX: Number(rotX.toFixed(3)),
                rotY,
                rotZ: Number(rotZ.toFixed(3)),
                steerYaw,
                rawThrottle,
                rawBrake,
                tcActive,
                absActive,
                pitLimiter,
                inPit,
                isOffTrack,
                physicsRpm,
                gearRaw,
                detachablePartState,
                tireTemps: latestWheel?.tireTemps ? [...latestWheel.tireTemps] : undefined,
                tireWear: latestWheel?.tireWear ? [...latestWheel.tireWear] : undefined,
                brakeTemps: latestWheel?.brakeTemps ? [...latestWheel.brakeTemps] : undefined,
              };

              if (targetSlot !== undefined) {
                rawPts.push(pt);
              } else {
                let pts = driverPoints.get(drv);
                if (!pts) {
                  pts = [];
                  driverPoints.set(drv, pts);
                }
                pts.push(pt);
              }
            }
          } else if ((sz === 21 || sz === 18 || (evClass === 6 && evType === 6 && sz >= 9)) && eventSp + 5 + 9 <= activeLen) {
            const splitSec = buf.readFloatLE(eventSp + 5);
            const sec = buf[eventSp + 5 + 8] & 3;
            const lapIdx = buf[eventSp + 5 + 8] >> 2;
            vcrTimingEvents.push({ sTime, drv, splitSec, sector: sec, lapIdx });
          } else if (evClass === 2 && (evType === 5 || evType === 7 || evType === 8) && eventSp + 5 + sz <= activeLen) {
            const drvName = driverNameMap.get(drv);
            if (evType === 5 && sz > 3) {
              const pText = buf.subarray(eventSp + 5 + 3, eventSp + 5 + sz).toString('utf8').replace(/\0.*$/, '').trim();
              replayPenalties.push({
                driverSlot: drv,
                driverName: drvName,
                timeSec: Number(sTime.toFixed(2)),
                penaltyText: pText || 'Penalty',
                action: 'given',
              });
            } else if (evType === 7) {
              const pType = buf[eventSp + 5] === 0 ? 'Stop/Go' : 'Drive Thru';
              replayPenalties.push({
                driverSlot: drv,
                driverName: drvName,
                timeSec: Number(sTime.toFixed(2)),
                penaltyText: `Served ${pType}`,
                penaltyType: pType,
                action: 'served',
              });
            } else if (evType === 8) {
              replayPenalties.push({
                driverSlot: drv,
                driverName: drvName,
                timeSec: Number(sTime.toFixed(2)),
                penaltyText: 'Penalty removed by admin',
                action: 'removed',
              });
            }
          } else if (((evClass === 5 || (evType === 2 && evClass !== 2)) && sz >= 1 && sz <= 16 && eventSp + 5 + sz <= activeLen) ||
                     (evType === 49 && sz === 1 && eventSp + 5 + sz <= activeLen)) {
            const pCode = buf[eventSp + 5];
            const drvName = driverNameMap.get(drv);
            const PIT_CODE_MAP: Record<number, { action: string; isGarage?: boolean }> = {
              16: { action: 'exited garage', isGarage: true },
              18: { action: 'stopped in pit stall', isGarage: false },
              20: { action: 'service started', isGarage: false },
              21: { action: 'returned to garage', isGarage: true },
              32: { action: 'exited pit lane', isGarage: false },
              33: { action: 'requested pit', isGarage: false },
              34: { action: 'entered pit lane', isGarage: false },
              35: { action: 'on jacks', isGarage: false },
              36: { action: 'on jacks', isGarage: false },
              37: { action: 'service complete', isGarage: false },
            };

            if (evType === 49) {
              if (pCode === 3) {
                replayPitEvents.push({
                  driverSlot: drv,
                  driverName: drvName,
                  timeSec: Number(sTime.toFixed(2)),
                  code: 49,
                  action: 'entered pit / garage',
                  isGarage: true,
                });
              }
            } else {
              const pitCodeEntry = PIT_CODE_MAP[pCode];
              if (pitCodeEntry) {
                let details: string | undefined;
                if (pCode === 37 && sz >= 6) {
                  const candidateFuel = buf.readFloatLE(eventSp + 5 + 2);
                  if (isFinite(candidateFuel) && candidateFuel > 0 && candidateFuel < 150) {
                    details = `Fuel: ${candidateFuel.toFixed(1)}L`;
                  }
                }
                replayPitEvents.push({
                  driverSlot: drv,
                  driverName: drvName,
                  timeSec: Number(sTime.toFixed(2)),
                  code: pCode,
                  action: pitCodeEntry.action,
                  isGarage: pitCodeEntry.isGarage,
                  details,
                });
              } else {
                replayPitEvents.push({
                  driverSlot: drv,
                  driverName: drvName,
                  timeSec: Number(sTime.toFixed(2)),
                  code: pCode,
                  action: `pit action ${pCode}`,
                });
              }
            }
          } else if (evType === 15 && (sz === 24 || sz === 37) && eventSp + 5 + sz <= activeLen) {
            // Live 4-Wheel Telemetry (Class 0/1 Type 15): Tire temperatures, dynamic wear counters, brake rotor temps
            // Corner ordering: [FL, FR, RL, RR]
            const flTemp = buf.readUInt16LE(eventSp + 5 + 2);
            const frTemp = buf.readUInt16LE(eventSp + 5 + 6);
            const rlTemp = buf.readUInt16LE(eventSp + 5 + 10);
            const rrTemp = buf.readUInt16LE(eventSp + 5 + 14);

            let brakeTemps: [number, number, number, number] | undefined = undefined;
            if (sz === 37) {
              const flBrake = buf.readUInt16LE(eventSp + 5 + 24);
              const frBrake = buf.readUInt16LE(eventSp + 5 + 26);
              const rlBrake = buf.readUInt16LE(eventSp + 5 + 28);
              const rrBrake = buf.readUInt16LE(eventSp + 5 + 30);
              if (flBrake > 0 || frBrake > 0 || rlBrake > 0 || rrBrake > 0) {
                brakeTemps = [flBrake, frBrake, rlBrake, rrBrake];
              }
            }

            // Dynamic tire wear counters in bytes 19..22 (0-255 wear indicator scale)
            const flWear = buf[eventSp + 5 + 19];
            const frWear = buf[eventSp + 5 + 20];
            const rlWear = buf[eventSp + 5 + 21];
            const rrWear = buf[eventSp + 5 + 22];

            driverWheelTelemetry.set(drv, {
              tireTemps: [flTemp, frTemp, rlTemp, rrTemp],
              tireWear: [flWear, frWear, rlWear, rrWear],
              brakeTemps,
            });
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
      if (d < 200) {
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
      isValid?: boolean;
    }

    let detectedLaps: DetectedLapInternal[] = [];

    // 1. Authoritative VCR timing packets (Class 6 / 3, Type 6, sz === 21) from simulation timing loops
    const targetTimings = targetSlot !== undefined ? vcrTimingEvents.filter(e => e.drv === targetSlot) : [];
    const finishTimings = targetTimings.filter(e => e.sector === 0).sort((a, b) => a.lapIdx - b.lapIdx);

    if (finishTimings.length >= 1 && rawPts.length >= 2) {
      function findClosestIdx(sTime: number): number {
        let low = 0, high = rawPts.length - 1;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (rawPts[mid].sTime < sTime) low = mid + 1;
          else high = mid - 1;
        }
        if (low >= rawPts.length) return rawPts.length - 1;
        if (low === 0) return 0;
        return Math.abs(rawPts[low].sTime - sTime) < Math.abs(rawPts[low - 1].sTime - sTime) ? low : low - 1;
      }

      for (let i = 0; i < finishTimings.length; i++) {
        const ft = finishTimings[i];
        const lapNum = ft.lapIdx + 1;
        const finishTime = ft.sTime;
        const startTime = i === 0
          ? (ft.splitSec > 0 ? ft.sTime - ft.splitSec : rawPts[0].sTime)
          : finishTimings[i - 1].sTime;
        const lapTimeSec = ft.splitSec > 0 ? Number(ft.splitSec.toFixed(3)) : Number((finishTime - startTime).toFixed(3));

        const startIdx = findClosestIdx(startTime);
        const endIdx = findClosestIdx(finishTime);
        const lapDist = cumDist[endIdx] - cumDist[startIdx];

        const s1Ev = targetTimings.find(e => e.lapIdx === ft.lapIdx && e.sector === 1);
        const s2Ev = targetTimings.find(e => e.lapIdx === ft.lapIdx && e.sector === 2);

        // Skip aborted/incomplete session flush events (e.g. session end flush where splitSec is <= 0 and lap was not completed)
        if (ft.splitSec <= 0 && (!s1Ev || lapTimeSec < 20) && i > 0) {
          continue;
        }
        let s1Sec: number;
        let s2Sec: number;
        let s3Sec: number;
        let s1Idx = startIdx;
        let s2Idx = startIdx;

        const isValidSplit = (v?: number) => typeof v === 'number' && isFinite(v) && v > 0 && v < 1800;

        if (s1Ev && isValidSplit(s1Ev.splitSec)) {
          s1Sec = Number(s1Ev.splitSec.toFixed(3));
          s1Idx = findClosestIdx(s1Ev.sTime);
        } else if (s1Ev && s1Ev.sTime > startTime && (s1Ev.sTime - startTime) < lapTimeSec) {
          s1Idx = findClosestIdx(s1Ev.sTime);
          s1Sec = Number((s1Ev.sTime - startTime).toFixed(3));
        } else {
          const s1TargetDist = cumDist[startIdx] + lapDist * 0.3333;
          while (s1Idx < endIdx && cumDist[s1Idx] < s1TargetDist) s1Idx++;
          s1Sec = Number((rawPts[s1Idx].sTime - rawPts[startIdx].sTime).toFixed(3));
        }

        if (s1Ev && s2Ev && isValidSplit(s1Ev.splitSec) && isValidSplit(s2Ev.splitSec) && s2Ev.splitSec > s1Ev.splitSec && (s2Ev.splitSec - s1Ev.splitSec) < lapTimeSec) {
          s2Sec = Number((s2Ev.splitSec - s1Ev.splitSec).toFixed(3));
          s2Idx = findClosestIdx(s2Ev.sTime);
        } else if (s2Ev && s1Ev && s2Ev.sTime > s1Ev.sTime && (s2Ev.sTime - s1Ev.sTime) < lapTimeSec) {
          s2Idx = findClosestIdx(s2Ev.sTime);
          s2Sec = Number((s2Ev.sTime - s1Ev.sTime).toFixed(3));
        } else if (s2Ev && s2Ev.sTime > startTime && (s2Ev.sTime - startTime) < lapTimeSec && (s2Ev.sTime - startTime) > s1Sec) {
          s2Idx = findClosestIdx(s2Ev.sTime);
          s2Sec = Number((s2Ev.sTime - startTime - s1Sec).toFixed(3));
        } else {
          s2Idx = s1Idx;
          const s2TargetDist = cumDist[startIdx] + lapDist * 0.6667;
          while (s2Idx < endIdx && cumDist[s2Idx] < s2TargetDist) s2Idx++;
          s2Sec = Number((rawPts[s2Idx].sTime - rawPts[s1Idx].sTime).toFixed(3));
        }

        if (s2Ev && isValidSplit(ft.splitSec) && isValidSplit(s2Ev.splitSec) && ft.splitSec > s2Ev.splitSec && (ft.splitSec - s2Ev.splitSec) < lapTimeSec) {
          s3Sec = Number((ft.splitSec - s2Ev.splitSec).toFixed(3));
        } else if (s2Ev && finishTime > s2Ev.sTime && (finishTime - s2Ev.sTime) < lapTimeSec) {
          s3Sec = Number((finishTime - s2Ev.sTime).toFixed(3));
        } else if (lapTimeSec > s1Sec + s2Sec && (lapTimeSec - s1Sec - s2Sec) > 0) {
          s3Sec = Number((lapTimeSec - s1Sec - s2Sec).toFixed(3));
        } else {
          s3Sec = Number((rawPts[endIdx].sTime - rawPts[s2Idx].sTime).toFixed(3));
        }

        const isValid = ft.splitSec > 0;
        const isOutlap = i === 0 || (startIdx >= 0 && Boolean(rawPts[startIdx]?.pitLimiter));

        detectedLaps.push({
          lapNumber: lapNum,
          startIdx,
          endIdx,
          lapTimeSec,
          lapDistMeters: Math.round(lapDist),
          s1Sec,
          s2Sec,
          s3Sec,
          s1Idx,
          s2Idx,
          isOutlap,
          isBest: false,
          isValid,
        });
      }

      // If vehicle continued on track after last finish event and completed sectors, capture final in-progress lap
      if (finishTimings.length > 0 && rawPts.length > 0) {
        const lastFt = finishTimings[finishTimings.length - 1];
        const lastStartIdx = findClosestIdx(lastFt.sTime);
        const finalIdx = rawPts.length - 1;
        const inProgressDist = cumDist[finalIdx] - cumDist[lastStartIdx];
        const inProgressTime = rawPts[finalIdx].sTime - lastFt.sTime;

        if (inProgressTime > 15 && inProgressDist > 600) {
          const s1Ev = targetTimings.find(e => e.lapIdx === lastFt.lapIdx + 1 && e.sector === 1);
          const s2Ev = targetTimings.find(e => e.lapIdx === lastFt.lapIdx + 1 && e.sector === 2);
          let s1Sec = 0;
          let s2Sec = 0;
          let s3Sec = 0;
          let s1Idx = lastStartIdx;
          let s2Idx = lastStartIdx;

          if (s1Ev && s1Ev.splitSec > 0) {
            s1Sec = Number(s1Ev.splitSec.toFixed(3));
            s1Idx = findClosestIdx(s1Ev.sTime);
          } else if (s1Ev && s1Ev.sTime > lastFt.sTime) {
            s1Idx = findClosestIdx(s1Ev.sTime);
            s1Sec = Number((s1Ev.sTime - lastFt.sTime).toFixed(3));
          } else {
            const s1TargetDist = cumDist[lastStartIdx] + inProgressDist * 0.3333;
            while (s1Idx < finalIdx && cumDist[s1Idx] < s1TargetDist) s1Idx++;
            s1Sec = Number((rawPts[s1Idx].sTime - lastFt.sTime).toFixed(3));
          }

          if (s2Ev && s1Ev && s2Ev.splitSec > s1Ev.splitSec && s1Ev.splitSec > 0) {
            s2Sec = Number((s2Ev.splitSec - s1Ev.splitSec).toFixed(3));
            s2Idx = findClosestIdx(s2Ev.sTime);
          } else if (s2Ev && s1Ev && s2Ev.sTime > s1Ev.sTime) {
            s2Idx = findClosestIdx(s2Ev.sTime);
            s2Sec = Number((s2Ev.sTime - s1Ev.sTime).toFixed(3));
          } else {
            s2Idx = s1Idx;
            const s2TargetDist = cumDist[lastStartIdx] + inProgressDist * 0.6667;
            while (s2Idx < finalIdx && cumDist[s2Idx] < s2TargetDist) s2Idx++;
            s2Sec = Number((rawPts[s2Idx].sTime - rawPts[s1Idx].sTime).toFixed(3));
          }

          s3Sec = Number((rawPts[finalIdx].sTime - rawPts[s2Idx].sTime).toFixed(3));

          detectedLaps.push({
            lapNumber: lastFt.lapIdx + 2,
            startIdx: lastStartIdx,
            endIdx: finalIdx,
            lapTimeSec: Number(inProgressTime.toFixed(3)),
            lapDistMeters: Math.round(inProgressDist),
            s1Sec,
            s2Sec,
            s3Sec,
            s1Idx,
            s2Idx,
            isOutlap: Boolean(rawPts[lastStartIdx]?.pitLimiter || rawPts[lastStartIdx]?.inPit),
            isBest: false,
            isValid: false,
          });
        }
      }

      const validLaps = detectedLaps.filter(l => l.isValid && l.lapTimeSec > 30);
      const validFlying = validLaps.filter(l => !l.isOutlap);
      const fallbackFlying = detectedLaps.filter(l => !l.isOutlap && l.lapTimeSec > 30);
      const pool = validFlying.length > 0
        ? validFlying
        : (validLaps.length > 0
            ? validLaps
            : (fallbackFlying.length > 0 ? fallbackFlying : detectedLaps));
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

    // Calculate speeds between points, capping at realistic maximum to prevent
    // anomalous position jumps from creating spikes in the smoothed speed trace.
    const MAX_PLAUSIBLE_SPEED_KMH = 400; // No LMU car exceeds ~370 km/h
    const rawSpeeds: number[] = [];
    for (let i = 0; i < downsampled.length; i++) {
      const cur = downsampled[i];
      let speed = 0;
      if (i > 0) {
        const prev = downsampled[i - 1];
        const dt = cur.sTime - prev.sTime;
        const dist = Math.hypot(cur.x - prev.x, cur.z - prev.z);
        if (dt > 0.005 && dist < 60) {
          speed = Math.min((dist / dt) * 3.6, MAX_PLAUSIBLE_SPEED_KMH);
        }
      }
      rawSpeeds.push(speed);
    }

    // Build garage and pit intervals for the target vehicle to accurately determine inGarage and inPit states
    const targetPitEvents = targetSlot !== undefined ? replayPitEvents.filter(e => e.driverSlot === targetSlot) : [];
    const garageIntervals: Array<{ start: number; end: number }> = [];
    const pitIntervals: Array<{ start: number; end: number }> = [];

    // Check if vehicle started in the garage (prior to first garage exit event)
    const firstGarageExit = targetPitEvents.find(e => e.code === 16);
    if (firstGarageExit && firstGarageExit.timeSec > 0) {
      garageIntervals.push({ start: 0, end: firstGarageExit.timeSec });
    }

    for (let p = 0; p < targetPitEvents.length; p++) {
      const ev = targetPitEvents[p];
      // Garage returns (code 21 or code 49)
      if (ev.code === 21 || ev.code === 49) {
        const nextExit = targetPitEvents.slice(p + 1).find(e => e.code === 16);
        garageIntervals.push({
          start: ev.timeSec,
          end: nextExit ? nextExit.timeSec : Infinity,
        });
      }
      // Pit lane entries (code 34)
      if (ev.code === 34) {
        const nextPitExit = targetPitEvents.slice(p + 1).find(e => e.code === 32);
        pitIntervals.push({
          start: ev.timeSec,
          end: nextPitExit ? nextPitExit.timeSec : ev.timeSec + 120,
        });
      }
    }

    function isTimeInIntervals(t: number, intervals: Array<{ start: number; end: number }>): boolean {
      for (const inv of intervals) {
        if (t >= inv.start && t <= inv.end) return true;
      }
      return false;
    }

    // Smooth speed over a 3-frame window (kept as its own array so gear detection below
    // can look across multiple frames without recomputing it inline).
    const smoothedSpeeds: number[] = [];
    for (let i = 0; i < downsampled.length; i++) {
      const prevSpeed = i > 0 ? rawSpeeds[i - 1] : rawSpeeds[i];
      const curSpeed = rawSpeeds[i];
      const nextSpeed = i < downsampled.length - 1 ? rawSpeeds[i + 1] : rawSpeeds[i];
      let s = (prevSpeed + curSpeed + nextSpeed) / 3;
      if (s < 1.5) s = 0; // remove sensor noise for stationary vehicles
      smoothedSpeeds.push(s);
    }

    // Gear is read directly from each point's authoritative gearRaw (evType - 8, see above),
    // available for every driver. Carry the last known value forward for the rare frame
    // where evType falls outside the known 7-15 range.
    const finalGears: number[] = [];
    let curGear = 1;
    for (let i = 0; i < downsampled.length; i++) {
      if (downsampled[i].gearRaw !== undefined) {
        curGear = downsampled[i].gearRaw!;
      }
      finalGears.push(curGear);
    }
    // The transmission passes through neutral (gear 0) for a few frames during every real
    // shift (clutch/dog-ring disengagement). Bridge these short neutral gaps directly to
    // the new gear so the displayed value jumps straight from the old gear to the new one
    // instead of visibly dipping to neutral. Long neutral stretches (e.g. parked/coasting)
    // are left untouched.
    const NEUTRAL_MAX_FRAMES = 6;
    for (let i = 0; i < finalGears.length; i++) {
      if (finalGears[i] !== 0) continue;
      let j = i;
      while (j < finalGears.length && finalGears[j] === 0) j++;
      const beforeGear = i > 0 ? finalGears[i - 1] : undefined;
      const afterGear = j < finalGears.length ? finalGears[j] : undefined;
      if (j - i <= NEUTRAL_MAX_FRAMES && beforeGear && afterGear) {
        for (let k = i; k < j; k++) finalGears[k] = afterGear;
      }
      i = j;
    }
    // Filter momentary 1-frame shift anomalies
    for (let i = 1; i < finalGears.length - 1; i++) {
      if (finalGears[i] !== finalGears[i - 1] && finalGears[i - 1] === finalGears[i + 1]) {
        finalGears[i] = finalGears[i - 1];
      }
    }

    // Smooth speed, calculate acceleration, throttle, and brake
    const finalPoints: ReplayTrajectoryPoint[] = [];
    for (let i = 0; i < downsampled.length; i++) {
      const cur = downsampled[i];
      const prevSpeed = i > 0 ? rawSpeeds[i - 1] : rawSpeeds[i];
      const curSpeed = rawSpeeds[i];
      const nextSpeed = i < downsampled.length - 1 ? rawSpeeds[i + 1] : rawSpeeds[i];
      let smoothSpeed = (prevSpeed + curSpeed + nextSpeed) / 3;

      // Remove sensor noise for stationary vehicles; negative speeds are guarded
      if (smoothSpeed < 1.5) smoothSpeed = 0;

      const throttle = cur.rawThrottle ?? 0;
      const brake = cur.rawBrake ?? 0;

      const rpm = cur.physicsRpm !== undefined
        ? cur.physicsRpm
        : (smoothSpeed < 1 ? 950 : Math.min(8800, Math.max(2500, Math.round(3000 + (smoothSpeed % 45) * 120))));


      // True garage state based on simulation events; fallback to stationary in pit
      const inGarage = isTimeInIntervals(cur.sTime, garageIntervals) ||
        (garageIntervals.length === 0 && Boolean(cur.inPit) && smoothSpeed < 1);
      const inPit = Boolean(cur.inPit) || isTimeInIntervals(cur.sTime, pitIntervals) || inGarage;

      finalPoints.push({
        x: Number(cur.x.toFixed(2)),
        y: Number(cur.y.toFixed(2)),
        z: Number(cur.z.toFixed(2)),
        rotX: cur.rotX,
        rotY: Number(cur.rotY.toFixed(3)),
        rotZ: cur.rotZ,
        speedKmh: Math.round(smoothSpeed),
        throttle,
        brake,
        steerYaw: cur.steerYaw ?? 0,
        rpm,
        gear: finalGears[i],
        inPit,
        isOffTrack: cur.isOffTrack,
        inGarage,
        isTeleport: false,
        timeSec: Number(cur.sTime.toFixed(2)),
        tcActive: cur.tcActive,
        absActive: cur.absActive,
        pitLimiter: cur.pitLimiter,
        detachablePartState: cur.detachablePartState,
        tireTemps: cur.tireTemps,
        tireWear: cur.tireWear,
        brakeTemps: cur.brakeTemps,
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
      isValid: l.isValid ?? !l.isOutlap,
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
      penalties: replayPenalties.length > 0 ? replayPenalties : undefined,
      pitEvents: replayPitEvents.length > 0 ? replayPitEvents : undefined,
      wheelTelemetryAvailable: Boolean(finalPoints.some(p => p.tireTemps !== undefined)),
    };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Fast direct extractor for 100% official lap summaries and sector splits
 * streaming Class 6 Type 6 simulation timing events.
 */
export function extractReplayLapSummaries(
  filePath: string,
  options: {
    driverSlot?: number;
    driverName?: string;
    playerName?: string;
  } = {}
): ReplayLapSummary[] {
  const traj = extractReplayTrajectory(filePath, {
    driverSlot: options.driverSlot,
    driverName: options.driverName,
    playerName: options.playerName,
    maxPoints: 10,
  });
  return traj.laps || [];
}

/**
 * Extracts pit stop and garage events for a replay session.
 */
export function extractReplayPitEvents(
  filePath: string,
  options: {
    driverSlot?: number;
    driverName?: string;
    playerName?: string;
  } = {}
): ReplayPitEvent[] {
  const traj = extractReplayTrajectory(filePath, {
    driverSlot: options.driverSlot,
    driverName: options.driverName,
    playerName: options.playerName,
    maxPoints: 10,
  });
  if (options.driverSlot !== undefined) {
    return (traj.pitEvents || []).filter(e => e.driverSlot === options.driverSlot);
  }
  return traj.pitEvents || [];
}
