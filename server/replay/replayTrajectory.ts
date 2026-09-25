import fs from 'fs';
import path from 'path';
import {
  ReplayTrajectoryData,
  ReplayTrajectoryPoint,
  ReplayPenaltyEvent,
  ReplayPitEvent,
  ReplayFlagEvent,
  ReplayStandingsSnapshot,
} from '../core/types.js';
import { detectPlayerName, parseReplayMetadata } from './replayParser.js';
import {
  RawTrajectoryPoint,
  VcrTimingEvent,
  DetectedLapInternal,
  detectLapsFromTelemetry,
  isTimeInIntervals,
} from './replayLapBuilder.js';
import {
  ReplayProgressTracker,
  ReplayProgressCallback,
  ReplayLogOptions,
} from './replayProgress.js';

export interface ExtractReplayTrajectoryOptions extends ReplayLogOptions {
  driverSlot?: number;
  driverName?: string;
  maxPoints?: number;
  playerName?: string;
  lapNumber?: number;
  // When true, finalizes every detected lap for the target driver in this same file
  // scan and attaches them all as `allLapsData`, so callers (e.g. the eager replay
  // cache sync) can persist the whole driver's laps from a single binary pass.
  allLaps?: boolean;
  onProgress?: ReplayProgressCallback;
}

function decodePacketSpeedKmh(payload: Buffer, offset: number): number | undefined {
  const b0 = payload[offset];
  const b1 = payload[offset + 1];
  const b2 = payload[offset + 2];
  const b3 = payload[offset + 3];
  const b4 = payload[offset + 4];
  if ((b0 | b1 | b2 | b3 | b4) === 0) return undefined;

  const readSigned16 = (low: number, high: number): number => {
    const value = low | (high << 8);
    return value & 0x8000 ? value - 0x10000 : value;
  };

  const high1 = (b1 & 0x20) ? (b1 & 0x3f) + 192 : b1 & 0x3f;
  const velocity1 = 3.6 * readSigned16(b0, high1) / 32;

  const low2 = (b1 >> 6) + ((b2 & 0x3f) << 2);
  const high2 = (b2 >> 6) + ((b3 & 1) << 2) + ((b3 & 2) ? 248 : 0);
  const velocity2 = 3.6 * readSigned16(low2, high2) / 20;

  const low3 = ((b3 & 0xfc) >> 2) + ((b4 & 3) << 6);
  const high3 = (b4 & 0x80) ? (b4 >> 2) + 192 : b4 >> 2;
  const velocity3 = 3.6 * readSigned16(low3, high3) / 32;
  const speed = Math.hypot(velocity1, velocity2, velocity3);
  return isFinite(speed) ? speed : undefined;
}

/**
 * Extracts downsampled 2D/3D car trajectory and live inputs from replay frames.
 */
export function extractReplayTrajectory(
  filePath: string,
  options: ExtractReplayTrajectoryOptions = {}
): ReplayTrajectoryData {
  const startTimeMs = Date.now();
  const filename = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const totalFileSize = stat.size;

  const fd = fs.openSync(filePath, 'r');

  try {
    const head = Buffer.alloc(64);
    fs.readSync(fd, head, 0, 64, 0);

    const irsr = head.subarray(45, 49).toString('ascii');
    if (irsr !== 'IRSR') {
      throw new Error(`Invalid LMU replay file: missing IRSR magic tag in ${filePath}`);
    }

    const metaOffset = head.readUInt32LE(53);
    const frameStreamEnd = Math.min(metaOffset, stat.size);
    const frameStreamBytes = Math.max(0, frameStreamEnd - 57);

    // Stage 1: Container & Header Verification
    const tracker = new ReplayProgressTracker(frameStreamBytes || totalFileSize, options.onProgress, options);
    tracker.report('header', 5, { bytesProcessed: 64 });

    if (!options.silent) {
      const sizeMb = (totalFileSize / (1024 * 1024)).toFixed(1);
      const streamMb = (frameStreamBytes / (1024 * 1024)).toFixed(1);
      console.log(
        `[VCR Parser] [1/6] Container: ${filename} (size: ${sizeMb} MB, format: 0x80000008, stream: ${streamMb} MB, metaOffset: 0x${metaOffset.toString(16)})`
      );
    }

    if (frameStreamBytes <= 0) {
      return {
        replayName: filename,
        pointsCount: 0,
        currentLap: 1,
        laps: [],
        sectors: { s1Frame: 0, s2Frame: 0 },
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
        points: [],
      };
    }

    // Stage 2: Metadata Block & Driver Roster
    tracker.report('metadata', 10);
    const effectivePlayerName = options.playerName || detectPlayerName(filePath);
    const meta = parseReplayMetadata(filePath, { playerName: effectivePlayerName });

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

    const matchedDriver = meta.drivers.find(d => d.slot === targetSlot);
    const driverName = matchedDriver?.name || (targetSlot !== undefined ? `Driver ${targetSlot}` : undefined);
    const carDesc = matchedDriver?.carModel || matchedDriver?.vehicleId || 'Unknown Car';

    if (!options.silent) {
      const displayTrack = meta.displayTrack || meta.trackName || 'Unknown Track';
      const scene = meta.sceneDesc || 'N/A';
      const session = meta.sessionType || 'Session';
      const duration = meta.durationSec > 0 ? `${meta.durationSec.toFixed(1)}s` : 'N/A';
      const slices = meta.timeSliceCount > 0 ? meta.timeSliceCount.toLocaleString() : 'N/A';
      console.log(
        `[VCR Parser] [2/6] Metadata: Track "${displayTrack}" (${scene}), Session: ${session}, Duration: ${duration}, Slices: ${slices}, Drivers: ${meta.drivers.length} | Target: "${driverName || 'Player'}" (slot ${targetSlot ?? 'auto'}, ${carDesc})`
      );
    }

    // Stage 3: Frame Stream Preparation
    tracker.report('stream_init', 15);
    if (!options.silent) {
      const streamMb = (frameStreamBytes / (1024 * 1024)).toFixed(1);
      console.log(
        `[VCR Parser] [3/6] Stream Init: Target slot ${targetSlot ?? 'auto'} ("${driverName || 'Player'}"), scanning ${streamMb} MB frame stream...`
      );
    }

    const driverPoints = new Map<number, RawTrajectoryPoint[]>();
    const rawPts: RawTrajectoryPoint[] = [];
    const vcrTimingEvents: VcrTimingEvent[] = [];
    const replayPenalties: ReplayPenaltyEvent[] = [];
    const replayPitEvents: ReplayPitEvent[] = [];
    const replayFlagEvents: ReplayFlagEvent[] = [];
    const standingsHistory: ReplayStandingsSnapshot[] = [];
    const driverWheelTelemetry = new Map<number, {
      wheelSpeeds?: [number, number, number, number];
      brakeTemps?: [number, number, number, number];
    }>();

    // Sequential streaming slice parser across the full frame stream (16MB chunk buffer)
    const CHUNK_SIZE = 16 * 1024 * 1024;
    const buf = Buffer.alloc(Math.min(CHUNK_SIZE, frameStreamBytes + 16));
    let filePos = 57;
    let carryoverLen = 0;
    let isFirstChunk = true;
    let slicesFound = 0;
    let lastSTime = 0;

    const driverNameMap = new Map<number, string>();
    for (const d of meta.drivers) {
      if (typeof d.slot === 'number') {
        driverNameMap.set(d.slot, d.name);
      }
    }
    const driverFuel = new Map<number, number>();

    // Stage 4: Streaming Binary Decode
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
        lastSTime = sTime;
        let eventSp = sp + 6;
        for (let e = 0; e < nEvents; e++) {
          const h = buf.readUInt32LE(eventSp);
          const sz = (h >>> 8) & 0x1ff;
          const drv = h & 0xff;
          const evClass = (h >>> 29);
          const evType = (h >>> 17) & 0x3f;

          if (sz === 65 && evType >= 7 && evType <= 15) {
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

              const info2 = buf.readUInt32LE(eventSp + 5 + 4);
              const detachablePartState = info2 & 0x3ff;

              const raw16 = buf.readUInt16LE(eventSp + 5 + 4);
              const steer10 = raw16 & 0x3ff;
              const steerYaw = parseFloat(((steer10 - 512) / 512).toFixed(4));

              // Byte 5 is raw 8-bit throttle pedal (1 = 0% idle/lift, 249 = 100% full throttle)
              const rawThrByte = buf[eventSp + 5 + 5];
              const rawThrottle = rawThrByte <= 1 ? 0 : Math.min(100, Math.round(((rawThrByte - 1) / 248) * 100));

              // Byte 36 is raw brake input (0 = 0%, bits 0..5 = pressure, bit 6 = ABS, bit 7 = TC)
              const rawBrkByte = buf[eventSp + 5 + 36];
              const rawBrake = rawBrkByte === 0 ? 0 : Math.min(100, Math.round(((rawBrkByte & 0x3f) / 63) * 100));
              const absActive = Boolean(rawBrkByte & 0x40);
              const tcActive = Boolean(rawBrkByte & 0x80);

              // Byte 38 is status & surface flags (bit 0 = off-track, bit 2 = pit limiter)
              const statusByte = buf[eventSp + 5 + 38];
              const isOffTrack = Boolean(statusByte & 0x01);
              const pitLimiter = Boolean(statusByte & 0x04);
              const info1 = buf.readUInt32LE(eventSp + 5);
              const inPit = Boolean(info1 & (1 << 17));
              const speedKmhRaw = decodePacketSpeedKmh(buf, eventSp + 5 + 8);

              // Engine RPM: 10-bit field spanning byte 6 bit 5 through byte 7 bit 6
              const rpmRaw10 = (buf.readUInt16LE(eventSp + 5 + 6) >>> 5) & 0x3ff;
              const engineRpm = rpmRaw10 < 1023 ? Math.round(rpmRaw10 * 10.9228) : undefined;

              // Gear: evType ranges 7-15, mapping to gear = evType - 8
              const gearRaw = evType >= 7 && evType <= 15 ? evType - 8 : undefined;

              const latestWheel = driverWheelTelemetry.get(drv);

              const pt: RawTrajectoryPoint = {
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
                gearRaw,
                speedKmhRaw,
                detachablePartState,
                engineRpm,
                wheelSpeeds: latestWheel?.wheelSpeeds ? [...latestWheel.wheelSpeeds] : undefined,
                brakeTemps: latestWheel?.brakeTemps ? [...latestWheel.brakeTemps] : undefined,
                fuel: driverFuel.get(drv),
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
          } else if ((evClass === 3 || evClass === 6 || evClass === 7) && evType === 6 &&
                     (sz === 18 || sz === 21) && eventSp + 5 + 9 <= activeLen) {
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
          } else if (evClass === 3 && evType === 10 && sz === 3 && eventSp + 5 + sz <= activeLen) {
            const FLAG_NAMES: Record<number, string> = {
              0: 'Green', 1: 'Local Yellow', 2: 'Double Yellow', 3: 'Full Course Yellow',
              4: 'Safety Car', 5: 'Safety Car In This Lap', 6: 'Virtual Safety Car', 7: 'Red', 8: 'Checkered',
            };
            const flagState = buf[eventSp + 5];
            const sectorMask = buf[eventSp + 5 + 1];
            const driverFlag = buf[eventSp + 5 + 2];
            replayFlagEvents.push({
              timeSec: Number(sTime.toFixed(2)),
              flagState,
              flagName: FLAG_NAMES[flagState] || `Unknown (${flagState})`,
              sectorMask,
              driverSlot: drv,
              driverFlag,
            });
          } else if (evType === 48 && (evClass === 3 || evClass === 6 || evClass === 7) && sz === 41 && eventSp + 5 + sz <= activeLen) {
            const count = buf[eventSp + 5];
            if (count > 0 && count <= 20 && 21 + count <= sz) {
              const order: number[] = [];
              for (let i = 0; i < count; i++) {
                order.push(buf[eventSp + 5 + 21 + i]);
              }
              standingsHistory.push({ timeSec: Number(sTime.toFixed(2)), order });
            }
          } else if (((evType === 2 && (evClass === 0 || evClass === 1 || evClass === 5)) && sz >= 1 && sz <= 16 && eventSp + 5 + sz <= activeLen) ||
                     (evType === 49 && (evClass === 2 || evClass === 7) && sz === 1 && eventSp + 5 + sz <= activeLen)) {
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
                let fuelAddedLiters: number | undefined;
                if (pCode === 37 && sz >= 6) {
                  const candidateFuel = buf.readFloatLE(eventSp + 5 + 2);
                  if (isFinite(candidateFuel) && candidateFuel > 0 && candidateFuel < 150) {
                    details = `Fuel: ${candidateFuel.toFixed(1)}L`;
                    fuelAddedLiters = Number(candidateFuel.toFixed(1));
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
                  fuelAddedLiters,
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
          } else if (evType === 15 && (sz === 24 || sz === 37) && eventSp + 5 + 24 <= activeLen) {
            const rawBrakeTemp = buf[eventSp + 5 + 23];
            const brakeTempC = Math.round(Math.max(20, (rawBrakeTemp - 51) * 5.86 + 29));
            let wheelState = driverWheelTelemetry.get(drv);
            if (!wheelState) {
              wheelState = {};
              driverWheelTelemetry.set(drv, wheelState);
            }
            wheelState.brakeTemps = [
              brakeTempC,
              brakeTempC,
              Math.round(brakeTempC * 0.88),
              Math.round(brakeTempC * 0.88),
            ];
          } else if (evType === 51 && sz === 3 && eventSp + 5 + sz <= activeLen) {
            const b0 = buf[eventSp + 5];
            const b1 = buf[eventSp + 5 + 1];
            if (b0 > 0 || b1 === 0) {
              const fuelPct = Number(((b0 / 255) * 100).toFixed(1));
              driverFuel.set(drv, fuelPct);
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

      // Progression update (mapped to 15% - 85% range)
      const bytesDone = filePos - 57;
      const streamFraction = frameStreamBytes > 0 ? Math.min(1, bytesDone / frameStreamBytes) : 1;
      const streamPercent = 15 + Math.round(streamFraction * 70);
      const lapsCount = vcrTimingEvents.filter(e => (targetSlot === undefined || e.drv === targetSlot) && e.sector === 0).length;

      tracker.report('stream_decoding', streamPercent, {
        bytesProcessed: bytesDone,
        slicesParsed: slicesFound,
        currentTimeSec: lastSTime,
        lapsDetected: lapsCount,
      });
    }

    if (rawPts.length === 0 && targetSlot !== undefined && driverPoints.has(targetSlot)) {
      rawPts.push(...driverPoints.get(targetSlot)!);
    } else if (rawPts.length === 0 && targetSlot === undefined && driverPoints.size > 0) {
      targetSlot = Array.from(driverPoints.keys())[0];
      rawPts.push(...driverPoints.get(targetSlot)!);
    }

    const maxPoints = options.maxPoints !== undefined ? options.maxPoints : 1200;

    // Stage 5: Lap Classification & Split Timing Correlation
    tracker.report('lap_analysis', 88);
    const lapAnalysis = detectLapsFromTelemetry(rawPts, vcrTimingEvents, targetSlot, replayPitEvents, maxPoints);
    const { detectedLaps, garageIntervals, pitIntervals, lapsSummary } = lapAnalysis;

    if (!options.silent) {
      const cleanFlying = detectedLaps.filter(l => l.isValid && !l.isOutlap);
      const outLaps = detectedLaps.filter(l => l.isOutlap);
      const best = detectedLaps.find(l => l.isBest);
      const bestStr = best
        ? `Best: Lap ${best.lapNumber} (${best.lapTimeSec.toFixed(3)}s [S1: ${best.s1Sec}s, S2: ${best.s2Sec}s, S3: ${best.s3Sec}s])`
        : 'Best: N/A';
      console.log(
        `[VCR Parser] [5/6] Lap Analysis: ${detectedLaps.length} laps detected (${cleanFlying.length} flying, ${outLaps.length} out-laps) | ${bestStr}`
      );
    }

    // Stage 6: Trajectory Downsampling & Finalization
    tracker.report('downsampling', 95);

    function buildLapResult(chosenLap: DetectedLapInternal): ReplayTrajectoryData {
      const lapRawPts = rawPts.slice(chosenLap.startIdx, chosenLap.endIdx + 1);
      const rawPointsCount = lapRawPts.length;
      const lapDuration = chosenLap.lapTimeSec || (rawPts.length > 0 ? Math.max(0.001, rawPts[chosenLap.endIdx].sTime - rawPts[chosenLap.startIdx].sTime) : 0);
      const rawSampleRateHz = lapDuration > 0 && rawPointsCount > 1
        ? Math.round((rawPointsCount - 1) / lapDuration)
        : 0;

      let downsampled = lapRawPts;
      if (maxPoints > 0 && lapRawPts.length > maxPoints) {
        const step = lapRawPts.length / maxPoints;
        downsampled = [];
        for (let i = 0; i < maxPoints; i++) {
          downsampled.push(lapRawPts[Math.min(lapRawPts.length - 1, Math.floor(i * step))]);
        }
      }

      const lapSpan = Math.max(1, chosenLap.endIdx - chosenLap.startIdx);
      const s1Fraction = (chosenLap.s1Idx - chosenLap.startIdx) / lapSpan;
      const s2Fraction = (chosenLap.s2Idx - chosenLap.startIdx) / lapSpan;
      const targetFrames = downsampled.length;
      const s1Frame = Math.min(targetFrames - 1, Math.round(s1Fraction * targetFrames));
      const s2Frame = Math.min(targetFrames - 1, Math.round(s2Fraction * targetFrames));

      const MAX_PLAUSIBLE_SPEED_KMH = 400;
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
        const packetSpeed = downsampled[i].speedKmhRaw;
        rawSpeeds.push(packetSpeed !== undefined && packetSpeed <= MAX_PLAUSIBLE_SPEED_KMH ? packetSpeed : speed);
      }

      const finalPoints: ReplayTrajectoryPoint[] = [];
      for (let i = 0; i < downsampled.length; i++) {
        const cur = downsampled[i];
        const rawSpeed = rawSpeeds[i];
        const inGarage = isTimeInIntervals(cur.sTime, garageIntervals) ||
          (garageIntervals.length === 0 && Boolean(cur.inPit) && rawSpeed < 1);
        const inPit = Boolean(cur.inPit) || isTimeInIntervals(cur.sTime, pitIntervals);

        finalPoints.push({
          x: Number(cur.x.toFixed(2)),
          y: Number(cur.y.toFixed(2)),
          z: Number(cur.z.toFixed(2)),
          rotX: cur.rotX,
          rotY: Number(cur.rotY.toFixed(3)),
          rotZ: cur.rotZ,
          speedKmh: Math.round(rawSpeed),
          throttle: cur.rawThrottle ?? 0,
          brake: cur.rawBrake ?? 0,
          steerYaw: cur.steerYaw ?? 0,
          gear: cur.gearRaw,
          inPit,
          isOffTrack: cur.isOffTrack,
          inGarage,
          isTeleport: false,
          timeSec: Number(cur.sTime.toFixed(2)),
          tcActive: cur.tcActive,
          absActive: cur.absActive,
          pitLimiter: cur.pitLimiter,
          detachablePartState: cur.detachablePartState,
          engineRpm: cur.engineRpm,
          wheelSpeeds: cur.wheelSpeeds,
          brakeTemps: cur.brakeTemps,
          fuel: cur.fuel,
        });
      }

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

      return {
        replayName: filename,
        driverSlot: targetSlot,
        driverName,
        pointsCount: finalPoints.length,
        rawPointsCount,
        rawSampleRateHz,
        maxPoints: options.maxPoints,
        isFullResolution: finalPoints.length >= rawPointsCount,
        currentLap: chosenLap.lapNumber,
        laps: lapsSummary,
        sectors: { s1Frame, s2Frame },
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
        flagEvents: replayFlagEvents.length > 0 ? replayFlagEvents : undefined,
        standingsHistory: standingsHistory.length > 0 ? standingsHistory : undefined,
        sessionRunningOrder: standingsHistory.length > 0 ? standingsHistory[standingsHistory.length - 1].order : undefined,
        wheelTelemetryAvailable: Boolean(finalPoints.some(p => p.wheelSpeeds !== undefined || p.brakeTemps !== undefined)),
        energyTelemetryAvailable: Boolean(finalPoints.some(p => p.fuel !== undefined)),
      };
    }

    let chosen = detectedLaps.find(l => l.lapNumber === options.lapNumber);
    if (!chosen) {
      chosen = detectedLaps.find(l => l.isBest) || detectedLaps[0];
    }

    const allLapsData = options.allLaps ? detectedLaps.map(l => buildLapResult(l)) : undefined;
    const result = allLapsData
      ? allLapsData.find(r => r.currentLap === chosen!.lapNumber)!
      : buildLapResult(chosen);

    if (allLapsData) {
      result.allLapsData = allLapsData;
    }

    tracker.report('downsampling', 100);

    if (!options.silent) {
      const elapsedMs = Date.now() - startTimeMs;
      const wheels = result.wheelTelemetryAvailable ? 'yes' : 'no';
      const energy = result.energyTelemetryAvailable ? 'yes' : 'no';
      console.log(
        `[VCR Parser] [6/6] Finalized: Lap ${result.currentLap} downsampled to ${result.pointsCount} pts (raw: ${result.rawPointsCount} @ ${result.rawSampleRateHz}Hz) | Bounds: ${result.bounds.spanX}m x ${result.bounds.spanZ}m | Telemetry: wheels=${wheels}, energy=${energy} (${elapsedMs}ms)`
      );
    }

    return result;
  } finally {
    fs.closeSync(fd);
  }
}
