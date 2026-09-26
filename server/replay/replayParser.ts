import fs from 'fs';
import path from 'path';
import {
  ReplayMetadata,
  ReplayDriverEntry,
  ReplayEventInfo,
  ReplayTrajectoryData,
  ReplayTrajectoryPoint,
} from '../core/types.js';
import {
  mapVehicleIdToModel,
  mapVehicleIdToClass,
} from '../../shared/domain/vehicleMapping.js';

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

export type {
  ReplayParsingStage,
  ReplayStreamProgress,
  ReplayProgressCallback,
  ReplayLogOptions,
} from './replayProgress.js';

export interface ParseReplayMetadataOptions {
  playerName?: string;
  verbose?: boolean;
}

/**
 * Parses replay header and extracts metadata block, driver roster, and session info.
 * Seeks directly to metadataOffset for sub-5ms performance.
 */
export function parseReplayMetadata(
  filePath: string,
  options?: ParseReplayMetadataOptions
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

    const baseName = path.basename(filePath);
    const filenameMatch = baseName.match(/^(.+?)\s+([PQR]\d+)\b/i);
    const filenameTrack = filenameMatch ? filenameMatch[1].trim() : '';

    const metadataResult: ReplayMetadata = {
      filename: baseName,
      filePath,
      fileSizeBytes: stat.size,
      mtimeMs: stat.mtime.getTime(),
      eventInfo,
      sessionType,
      privateSession,
      scn: scn || undefined,
      sceneDesc: scn ? scn.replace(/\.scn$/i, '').trim() : undefined,
      aiw: aiw || undefined,
      trackName: trackName || undefined,
      trackCourse: filenameTrack || undefined,
      displayTrack: filenameTrack || trackName || undefined,
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

    if (options?.verbose) {
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
      const streamMb = (metaOffset / (1024 * 1024)).toFixed(1);
      const displayTrack = metadataResult.displayTrack || metadataResult.trackName || 'Unknown Track';
      console.log(
        `[VCR Parser] [1/6] Container: ${baseName} (size: ${sizeMb} MB, format: 0x80000008, stream: ${streamMb} MB, metaOffset: 0x${metaOffset.toString(16)})`
      );
      console.log(
        `[VCR Parser] [2/6] Metadata: Track "${displayTrack}" (${metadataResult.sceneDesc || 'N/A'}), Session: ${sessionType || 'Session'}, Duration: ${durationSec.toFixed(1)}s, Slices: ${timeSliceCount.toLocaleString()}, Drivers: ${drivers.length} | Target: "${playerDriver?.name || 'Player'}" (slot ${playerDriver?.slot ?? 'auto'})`
      );
    }

    return metadataResult;
  } finally {
    fs.closeSync(fd);
  }
}


/**
 * Downsamples an already-extracted full-resolution trajectory to at most `maxPoints`
 * points, without touching the source .Vcr file. Used to serve cached (DB-backed)
 * full-resolution trajectories at whatever resolution the caller requested.
 */
export function downsampleReplayTrajectory(full: ReplayTrajectoryData, maxPoints: number | undefined): ReplayTrajectoryData {
  if (!maxPoints || maxPoints <= 0 || full.points.length <= maxPoints) {
    return full;
  }

  const points = full.points;
  const step = points.length / maxPoints;
  const sampled: ReplayTrajectoryPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.min(points.length - 1, Math.floor(i * step))]);
  }

  const s1Frac = full.sectors ? full.sectors.s1Frame / points.length : 0;
  const s2Frac = full.sectors ? full.sectors.s2Frame / points.length : 0;

  return {
    ...full,
    points: sampled,
    pointsCount: sampled.length,
    rawPointsCount: full.rawPointsCount || full.points.length,
    maxPoints,
    isFullResolution: false,
    sectors: {
      s1Frame: Math.min(sampled.length - 1, Math.round(s1Frac * sampled.length)),
      s2Frame: Math.min(sampled.length - 1, Math.round(s2Frac * sampled.length)),
    },
  };
}
