import fs from 'fs';
import path from 'path';
import { ReplayDriverSamples } from './replayDriverSamples.js';
import { decodeReplayPose } from './replayPose.js';
import { finalizeReplayDriver } from './replayTrajectoryFinalizer.js';
import {
  ReplayTrajectoryData,
  ReplayPenaltyEvent,
  ReplayContactEvent,
  ReplayPitEvent,
  ReplayFlagEvent,
  ReplayStandingsSnapshot,
  ReplayLapSummary,
  ReplayWeatherEvent,
} from '../../core/types.js';
import { detectPlayerName, parseReplayMetadata, resolveReplayPrimarySlot } from './replayParser.js';
import {
  RawTrajectoryPoint,
  VcrTimingEvent,
} from './replayLapBuilder.js';
import {
  ReplayProgressTracker,
  ReplayProgressCallback,
  ReplayLogOptions,
} from '../replayProgress.js';

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

// Class 0 Type 17 contact, byte +32: values below ~105 are the other car's slot, these are objects.
const CONTACT_OBJECT_NAMES: Record<number, string> = {
  105: 'Cone',
  106: 'Post',
  107: 'Sign',
  108: 'Wheel',
  109: 'Wing',
  112: 'Immovable',
};

// Class 3 Types 5 / 7 penalty issued / served, byte +0.
const PENALTY_TYPE_NAMES: Record<number, string> = {
  0: 'Stop/Go',
  1: 'Drive Thru',
  3: 'Time',
};

/**
 * Extracts downsampled 2D/3D car trajectory and live inputs from replay frames.
 */
export function extractReplayTrajectory(
  filePath: string,
  options: ExtractReplayTrajectoryOptions = {}
): ReplayTrajectoryData {
  const extraction = extractReplayDriverTrajectories(filePath, options);
  try {
    const first = extraction.next();
    if (first.done) throw new Error('Replay decoder produced no driver result');
    return first.value;
  } finally {
    extraction.return();
  }
}

export interface ExtractReplayDriversOptions extends ExtractReplayTrajectoryOptions {
  driverSlots?: readonly number[];
  includePrimary?: boolean;
  onDriverError?: (driverSlot: number | undefined, error: unknown) => void;
  onLapResult?: (lap: ReplayTrajectoryData) => ReplayTrajectoryData;
}

/** Traverses the source stream once, then finalizes one driver at a time from bounded disk staging. */
export function* extractReplayDriverTrajectories(
  filePath: string,
  options: ExtractReplayDriversOptions = {}
): Generator<ReplayTrajectoryData, void, void> {
  const filename = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const totalFileSize = stat.size;

  const fd = fs.openSync(filePath, 'r');
  let samples: ReplayDriverSamples | undefined;

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

    if (frameStreamBytes <= 0 && !options.driverSlots) {
      yield {
        replayName: filename,
        pointsCount: 0,
        currentLap: 1,
        laps: [],
        sectors: { s1Frame: 0, s2Frame: 0 },
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
        points: [],
      };
      return;
    }

    // Stage 2: Metadata Block & Driver Roster
    const effectivePlayerName = options.playerName || detectPlayerName(filePath);
    const meta = parseReplayMetadata(filePath, { playerName: effectivePlayerName });

    // Target slot determination
    let targetSlot = options.driverSlot;
    if (targetSlot === undefined && options.driverName) {
      const target = options.driverName.trim().toLowerCase();
      const matches = meta.drivers.filter(d => d.name.trim().toLowerCase() === target);
      if (matches.length === 1 && typeof matches[0].slot === 'number') targetSlot = matches[0].slot;
    }

    // Resolve a default from unique player identity; explicit requests retain their own slot/name.
    if (targetSlot === undefined && options.driverSlot === undefined && !options.driverName) {
      targetSlot = resolveReplayPrimarySlot(meta, effectivePlayerName);
    }
    if (options.driverName && targetSlot === undefined) throw new Error(`Replay driver "${options.driverName}" is unavailable`);
    if (targetSlot === undefined && (!options.driverSlots || options.includePrimary)) {
      throw new Error('Replay primary driver is unavailable; select an explicit driver');
    }
    if (!options.driverSlots && options.driverSlot !== undefined && !meta.drivers.some(driver => driver.slot === options.driverSlot)) {
      throw new Error(`Replay driver slot ${options.driverSlot} is unavailable`);
    }

    const targets = options.driverSlots
      ? [...new Set([...(options.includePrimary ? [targetSlot] : []), ...options.driverSlots])]
      : [targetSlot];
    const requestedSlots = options.driverSlots ? new Set(options.driverSlots) : undefined;
    if (requestedSlots && options.includePrimary && targetSlot !== undefined) requestedSlots.add(targetSlot);
    if (requestedSlots) samples = new ReplayDriverSamples();

    const matchedDriver = meta.drivers.find(d => d.slot === targetSlot);
    tracker.report('metadata', 10, { driverSlot: targetSlot });
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
    const replayContacts: ReplayContactEvent[] = [];
    const replayPitEvents: ReplayPitEvent[] = [];
    const replayFlagEvents: ReplayFlagEvent[] = [];
    const standingsHistory: ReplayStandingsSnapshot[] = [];
    const replayWeatherEvents: ReplayWeatherEvent[] = [];
    let currentAmbientTemp: number | undefined = undefined;
    let currentRainIntensity: number | undefined = undefined;
    let maxSessionRain = 0;
    const driverWheelTelemetry = new Map<number, {
      wheelSpeeds?: [number, number, number, number];
      brakeTemps?: [number, number, number, number];
    }>();
    const driverVirtualEnergy = new Map<number, number>();
    const driverTireCompounds = new Map<number, [number, number, number, number]>();

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

        // A 9-bit payload length cannot exceed 511 bytes (+4 header, +1 padding).
        // Most slices therefore fit without a preliminary header walk. Near the buffer
        // boundary, verify the whole slice before committing any events so carryover
        // never duplicates points, timing events or state updates.
        if (sp + 6 + nEvents * 516 > activeLen) {
          let tempSp = sp + 6;
          let canParseSlice = true;
          for (let e = 0; e < nEvents; e++) {
            if (tempSp + 4 > activeLen) { canParseSlice = false; break; }
            const h = buf.readUInt32LE(tempSp);
            const sz = (h >>> 8) & 0x1ff;
            tempSp += 4 + 1 + sz;
            if (tempSp > activeLen) { canParseSlice = false; break; }
          }
          if (!canParseSlice) break;
        }

        slicesFound++;
        lastSTime = sTime;
        let eventSp = sp + 6;
        for (let e = 0; e < nEvents; e++) {
          const h = buf.readUInt32LE(eventSp);
          const sz = (h >>> 8) & 0x1ff;
          const drv = h & 0xff;
          // Bit 29 only flags a race replay: practice / qualifying send the same packets with it clear.
          const evClass = (h >>> 30);
          const rawClass = (h >>> 29);
          const evType = (h >>> 17) & 0x3f;

          // Only the chosen driver's pose and channel state feed its trajectories.
          // Scoring, weather, contacts and other replay-wide events remain unfiltered.
          if ((requestedSlots ? !requestedSlots.has(drv) : targetSlot !== undefined && drv !== targetSlot) && (
            (sz === 65 && evType >= 7 && evType <= 15)
            || (evType === 15 && (sz === 24 || sz === 37))
            || (evClass === 0 && evType === 51 && sz === 3)
            || (evClass === 0 && evType === 16 && sz === 4)
          )) {
            eventSp += 4 + 1 + sz;
            continue;
          }

          if (sz === 65 && evType >= 7 && evType <= 15) {
            const latestWheel = driverWheelTelemetry.get(drv);
            const state = {
              wheelSpeeds: latestWheel?.wheelSpeeds,
              brakeTemps: latestWheel?.brakeTemps,
              virtualEnergy: driverVirtualEnergy.get(drv),
              rainIntensity: currentRainIntensity,
              ambientTemp: currentAmbientTemp,
              tireCompoundIndices: driverTireCompounds.get(drv),
            };
            if (samples) {
              samples.append(drv, sTime, evType, buf, eventSp + 5, state);
            } else {
              const point = decodeReplayPose(buf, eventSp + 5, sTime, evType, state);
              if (point && targetSlot !== undefined) rawPts.push(point);
              else if (point) {
                let points = driverPoints.get(drv);
                if (!points) { points = []; driverPoints.set(drv, points); }
                points.push(point);
              }
            }
          } else if (evClass === 3 && evType === 6 &&
                     (sz === 18 || sz === 21) && eventSp + 5 + 9 <= activeLen) {
            const splitSec = buf.readFloatLE(eventSp + 5);
            const sec = buf[eventSp + 5 + 8] & 3;
            const lapIdx = buf[eventSp + 5 + 8] >> 2;
            vcrTimingEvents.push({ sTime, drv, splitSec, sector: sec, lapIdx });
          } else if (evClass === 3 && ((evType === 5 && sz >= 2) || (evType === 7 && sz === 1)) && eventSp + 5 + sz <= activeLen) {
            // Type 5 issued: +0 penalty type, +1 seconds / 2, reason text from +2. Type 7 served: +0 type.
            // Penalties handed out in a burst at the start and disqualifications are not in the replay.
            const pType = PENALTY_TYPE_NAMES[buf[eventSp + 5]] ?? `Type ${buf[eventSp + 5]}`;
            if (evType === 5) {
              const pSeconds = buf[eventSp + 5 + 1] * 2;
              const pText = buf.subarray(eventSp + 5 + 2, eventSp + 5 + sz).toString('utf8').replace(/\0.*$/, '').trim();
              replayPenalties.push({
                driverSlot: drv,
                driverName: driverNameMap.get(drv),
                timeSec: Number(sTime.toFixed(4)),
                penaltyText: pText || 'Penalty',
                penaltyType: pType,
                penaltySeconds: pSeconds > 0 ? pSeconds : undefined,
                action: 'given',
              });
            } else {
              replayPenalties.push({
                driverSlot: drv,
                driverName: driverNameMap.get(drv),
                timeSec: Number(sTime.toFixed(4)),
                penaltyText: `Served ${pType}`,
                penaltyType: pType,
                action: 'served',
              });
            }
          } else if (evClass === 1 && evType === 10 && sz === 3 && eventSp + 5 + sz <= activeLen) {
            const FLAG_NAMES: Record<number, string> = {
              0: 'Green', 1: 'Local Yellow', 2: 'Double Yellow', 3: 'Full Course Yellow',
              4: 'Safety Car', 5: 'Safety Car In This Lap', 6: 'Virtual Safety Car', 7: 'Red', 8: 'Checkered',
            };
            const flagState = buf[eventSp + 5];
            const sectorMask = buf[eventSp + 5 + 1];
            const driverFlag = buf[eventSp + 5 + 2];
            replayFlagEvents.push({
              timeSec: Number(sTime.toFixed(4)),
              flagState,
              flagName: FLAG_NAMES[flagState] || `Unknown (${flagState})`,
              sectorMask,
              driverSlot: drv,
              driverFlag,
            });
          } else if (evType === 48 && evClass === 3 && sz >= 22 && eventSp + 5 + sz <= activeLen) {
            const count = buf[eventSp + 5];
            if (count > 0 && 21 + count <= sz) {
              const order: number[] = [];
              for (let i = 0; i < count; i++) {
                order.push(buf[eventSp + 5 + 21 + i]);
              }
              standingsHistory.push({ timeSec: Number(sTime.toFixed(4)), order });
            }
          } else if (evClass === 0 && evType === 10 && sz === 80 && eventSp + 5 + 78 <= activeLen) {
            const rawTemp = buf[eventSp + 5 + 38];
            const ambientTempC = Number((rawTemp / 8 + 5.9).toFixed(1));
            let maxRainChannel = 0;
            for (let ch = 42; ch < 78; ch += 4) {
              const r = buf[eventSp + 5 + ch];
              if (r > maxRainChannel) maxRainChannel = r;
            }
            currentAmbientTemp = ambientTempC;
            currentRainIntensity = maxRainChannel;
            if (maxRainChannel > maxSessionRain) {
              maxSessionRain = maxRainChannel;
            }
            replayWeatherEvents.push({
              timeSec: Number(sTime.toFixed(4)),
              ambientTemp: ambientTempC,
              rainIntensity: maxRainChannel,
              rainPercent: Math.round((maxRainChannel / 255) * 100),
            });
          } else if (evClass === 0 && evType === 16 && sz === 4 && eventSp + 5 + 4 <= activeLen) {
            driverTireCompounds.set(drv, [
              buf[eventSp + 5],
              buf[eventSp + 5 + 1],
              buf[eventSp + 5 + 2],
              buf[eventSp + 5 + 3],
            ]);
          } else if (evClass === 0 && evType === 17 && sz === 33 && eventSp + 5 + 33 <= activeLen) {
            const impactMagnitude = buf.readFloatLE(eventSp + 5 + 8);
            const otherParty = buf[eventSp + 5 + 32];
            const otherPartyName = CONTACT_OBJECT_NAMES[otherParty] ?? driverNameMap.get(otherParty);
            replayContacts.push({
              driverSlot: drv,
              driverName: driverNameMap.get(drv),
              timeSec: Number(sTime.toFixed(4)),
              impactMagnitude: Number(impactMagnitude.toFixed(2)),
              otherParty,
              otherPartyName,
            });
          } else if (((evType === 2 && evClass === 0) && sz >= 1 && sz <= 16 && eventSp + 5 + sz <= activeLen) ||
                     (evType === 49 && (rawClass === 2 || rawClass === 7) && sz === 1 && eventSp + 5 + sz <= activeLen)) {
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
                  timeSec: Number(sTime.toFixed(4)),
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
                  timeSec: Number(sTime.toFixed(4)),
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
                  timeSec: Number(sTime.toFixed(4)),
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
          } else if (evClass === 0 && evType === 51 && sz === 3 && eventSp + 5 + sz <= activeLen) {
            const b0 = buf[eventSp + 5];
            const b1 = buf[eventSp + 5 + 1];
            // Cars without a Virtual Energy system (e.g. GTE) send this packet as all zeros for the
            // whole session: a car only has VE once it has reported a non-zero value (VE starts full).
            if (b0 > 0 || (b1 === 0 && driverVirtualEnergy.has(drv))) {
              const vePct = Number((b0 / 2.55).toFixed(1));
              driverVirtualEnergy.set(drv, vePct);
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

      samples?.flush();

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

    samples?.flush();
    if (samples) tracker.report('lap_analysis', 85, { temporaryBytes: samples.allocatedBytes });
    for (const driverSlot of targets) {
      try {
        const targetSlot = driverSlot;
        if (targetSlot !== undefined && !meta.drivers.some(driver => driver.slot === targetSlot)) {
          throw new Error(`Replay driver slot ${targetSlot} is unavailable`);
        }
        const driverName = meta.drivers.find(driver => driver.slot === targetSlot)?.name
          || (targetSlot !== undefined ? `Driver ${targetSlot}` : undefined);
        const context = {
          filename, driverSlot: targetSlot, driverName, timings: vcrTimingEvents,
          events: { penalties: replayPenalties, contacts: replayContacts, pitEvents: replayPitEvents,
            flagEvents: replayFlagEvents, standingsHistory, weatherEvents: replayWeatherEvents },
          maxSessionRain, currentAmbientTemp, tireCompounds: targetSlot !== undefined ? driverTireCompounds.get(targetSlot) : undefined,
        };
        const result = finalizeReplayDriver(samples ? samples.read(targetSlot) : rawPts, context, options, options.onLapResult);
        if (!result) throw new Error('Replay decoder produced no driver result');
        yield result;
      } catch (error) {
        if (!options.onDriverError) throw error;
        options.onDriverError(driverSlot, error);
      }
    }
  } finally {
    samples?.close();
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
