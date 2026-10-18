import type { LiveCarReading } from '../../shared/domain/live/liveCarCondition.js';
import type { LiveScoringReading, LiveVehicleReading } from '../../shared/domain/live/liveLifecycle.js';
import type { LivePedalSample } from '../../shared/types/live.js';
import type { LiveCaptureSample } from '../../shared/types/liveCapture.js';
import { decodeLiveCaptureSample } from './capture/decode.js';
import { knownCarClass } from '../../shared/domain/vehicleMapping.js';
import { MAX_MAPPED_VEHICLES, SCORING, SCORING_INFO, TELEMETRY, VEHICLE_SCORING, VEHICLE_TELEMETRY, WHEEL } from './rf2Layout.js';
import type { MappedBuffer } from './sharedMemory.js';

/** What a coherent read needs from a mapping. */
export type FrameSource = Pick<MappedBuffer, 'readU32' | 'read'>;

/** A frame's outcome: nothing new, a write caught half done on every attempt, or the decoded value. */
export type FrameRead<T> = { status: 'unchanged' } | { status: 'torn' } | { status: 'ok'; version: number; value: T };

const READ_ATTEMPTS = 3;
const SCORING_HEADER_BYTES = SCORING.vehicles;

function cString(buffer: Buffer, offset: number, length: number): string {
  const field = buffer.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.toString('utf8', 0, end < 0 ? length : end);
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

function decodeVehicle(buffer: Buffer, base: number): LiveVehicleReading {
  const at = VEHICLE_SCORING.offsets;
  const double = (name: string): number => buffer.readDoubleLE(base + at[name]);
  return {
    id: buffer.readInt32LE(base + at.id),
    ...(cString(buffer, base + at.driverName, 32) ? { driverName: cString(buffer, base + at.driverName, 32) } : {}),
    place: buffer.readUInt8(base + at.place),
    totalLaps: buffer.readInt16LE(base + at.totalLaps),
    vehicleName: cString(buffer, base + at.vehicleName, 64),
    vehicleClass: cString(buffer, base + at.vehicleClass, 32),
    lapDist: double('lapDist'),
    sector: buffer.readInt8(base + at.sector),
    lastLapTime: double('lastLapTime'),
    bestLapTime: double('bestLapTime'),
    lastSector1: double('lastSector1'),
    lastSector2: double('lastSector2'),
    bestSector1: double('bestSector1'),
    bestSector2: double('bestSector2'),
    curSector1: double('curSector1'),
    curSector2: double('curSector2'),
    bestLapSector1: buffer.readFloatLE(base + at.bestLapSector1),
    bestLapSector2: buffer.readFloatLE(base + at.bestLapSector2),
    lapStartEt: double('lapStartET'),
    timeIntoLap: double('timeIntoLap'),
    estimatedLapTime: double('estimatedLapTime'),
    inPits: buffer.readUInt8(base + at.inPits) !== 0,
    countLapFlag: buffer.readUInt8(base + at.countLapFlag),
    lapsBehindLeader: buffer.readInt32LE(base + at.lapsBehindLeader),
    finishStatus: buffer.readInt8(base + at.finishStatus),
    pitStops: buffer.readInt16LE(base + at.numPitstops),
  };
}

/**
 * The scoring header and info followed by the vehicles that were copied, at their buffer offsets.
 * The player is the vehicle with `isPlayer` set, the leader the one in place 1.
 */
export function decodeScoring(buffer: Buffer): LiveScoringReading {
  const info = SCORING.info;
  const infoAt = SCORING_INFO.offsets;
  const numVehicles = buffer.readInt32LE(info + infoAt.numVehicles);
  const copied = Math.floor((buffer.length - SCORING.vehicles) / SCORING.vehicleStride);
  const count = Math.max(0, Math.min(numVehicles, MAX_MAPPED_VEHICLES, copied));
  const at = VEHICLE_SCORING.offsets;
  let player: LiveVehicleReading | null = null;
  let leader: LiveVehicleReading | null = null;
  for (let i = 0; i < count && !(player && leader); i++) {
    const base = SCORING.vehicles + i * SCORING.vehicleStride;
    const isPlayer = !player && buffer.readUInt8(base + at.isPlayer) !== 0;
    const isLeader = !leader && buffer.readUInt8(base + at.place) === 1;
    if (!isPlayer && !isLeader) continue;
    const vehicle = decodeVehicle(buffer, base);
    if (isPlayer) player = vehicle;
    if (isLeader) leader = vehicle;
  }
  let classLeader: LiveVehicleReading | null = null;
  const playerClass = knownCarClass(player?.vehicleClass);
  if (playerClass && count === numVehicles) {
    for (let i = 0; i < count; i++) {
      const base = SCORING.vehicles + i * SCORING.vehicleStride;
      const place = buffer.readUInt8(base + at.place);
      if (place > 0 && (!classLeader || place < classLeader.place)
        && knownCarClass(cString(buffer, base + at.vehicleClass, 32)) === playerClass) classLeader = decodeVehicle(buffer, base);
    }
  }
  return {
    trackName: cString(buffer, info + infoAt.trackName, 64),
    playerClassPlace: player && player.vehicleClass && player.place > 0
      ? 1 + Array.from({ length: count }, (_, i) => SCORING.vehicles + i * SCORING.vehicleStride).filter(base =>
        (playerClass ? knownCarClass(cString(buffer, base + at.vehicleClass, 32)) === playerClass : cString(buffer, base + at.vehicleClass, 32) === player.vehicleClass)
        && buffer.readUInt8(base + at.place) > 0 && buffer.readUInt8(base + at.place) < player.place).length
      : null,
    sessionCode: buffer.readInt32LE(info + infoAt.session),
    currentEt: buffer.readDoubleLE(info + infoAt.currentET),
    endEt: buffer.readDoubleLE(info + infoAt.endET),
    numVehicles,
    allDriversFinished: count > 0 && count === numVehicles
      ? Array.from({ length: count }, (_, i) => buffer.readInt8(SCORING.vehicles + i * SCORING.vehicleStride + at.finishStatus)).every(status => status >= 1 && status <= 3)
      : null,
    inRealtime: buffer.readUInt8(info + infoAt.inRealtime) !== 0,
    gamePhase: buffer.readUInt8(info + infoAt.gamePhase),
    trackLength: buffer.readDoubleLE(info + infoAt.lapDist),
    trackTempC: buffer.readDoubleLE(info + infoAt.trackTemp),
    raining: clamp01(buffer.readDoubleLE(info + infoAt.raining)),
    avgPathWetness: clamp01(buffer.readDoubleLE(info + infoAt.avgPathWetness)),
    maxPathWetness: Number.isFinite(buffer.readDoubleLE(info + infoAt.maxPathWetness))
      ? clamp01(buffer.readDoubleLE(info + infoAt.maxPathWetness)) : undefined,
    player,
    leader,
    classLeader,
  };
}

const KELVIN = 273.15;

/** Mean tyre surface temperature of the four wheels (left, centre, right each), degrees Celsius; null when the game reports none. */
function tyreSurfaceAverage(slot: Buffer): number | null {
  const wheels = VEHICLE_TELEMETRY.offsets.wheels;
  let sum = 0;
  for (let wheel = 0; wheel < 4; wheel++) {
    for (let part = 0; part < 3; part++) {
      sum += slot.readDoubleLE(wheels + wheel * WHEEL.size + WHEEL.offsets.temperature + part * 8);
    }
  }
  const average = sum / 12 - KELVIN;
  return Number.isFinite(average) && average > -KELVIN + 1 ? Math.round(average * 10) / 10 : null;
}

/** Fuel, damage flags and compound of one telemetry vehicle slot. */
function decodeCar(slot: Buffer): LiveCarReading {
  const at = VEHICLE_TELEMETRY.offsets;
  const wheel = (index: number, field: string): boolean => slot.readUInt8(at.wheels + index * WHEEL.size + WHEEL.offsets[field]) !== 0;
  const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
  return {
    fuelLiters: finite(slot.readDoubleLE(at.fuel)),
    fuelCapacityLiters: finite(slot.readDoubleLE(at.fuelCapacity)),
    dentSeverity: Array.from({ length: 8 }, (_, index) => slot.readUInt8(at.dentSeverity + index)),
    detached: slot.readUInt8(at.detached) !== 0,
    wheels: [0, 1, 2, 3].map(index => ({ flat: wheel(index, 'flat'), detached: wheel(index, 'detached') })),
    lastImpactEt: finite(slot.readDoubleLE(at.lastImpactET)),
    compound: cString(slot, at.frontTireCompoundName, 18).trim(),
  };
}

export interface PedalSlot {
  id: number; sample: LivePedalSample; tyreSurfaceAvgC: number | null; car: LiveCarReading;
  capture?: LiveCaptureSample | null;
}

/** One telemetry vehicle slot (VEHICLE_TELEMETRY.size bytes): its id, the driver's unfiltered pedals at its session time, the tyre surface temperature and the car. */
export function decodePedalSlot(slot: Buffer, capture = false): PedalSlot {
  const at = VEHICLE_TELEMETRY.offsets;
  return {
    id: slot.readInt32LE(at.id),
    tyreSurfaceAvgC: tyreSurfaceAverage(slot),
    car: decodeCar(slot),
    ...(capture ? { capture: decodeLiveCaptureSample(slot) } : {}),
    sample: {
      t: slot.readDoubleLE(at.elapsedTime),
      throttle: clamp01(slot.readDoubleLE(at.unfilteredThrottle)),
      brake: clamp01(slot.readDoubleLE(at.unfilteredBrake)),
    },
  };
}

/**
 * Runs `copy` between two checks of the plugin's version counters: the writer raises the begin
 * counter before and the end counter after an update, so a copy is coherent only when both stand
 * at the same value before and after it. A torn copy is retried; a buffer still at `lastVersion` is skipped.
 */
function readCoherent<T>(source: FrameSource, versionBegin: number, versionEnd: number, lastVersion: number | null,
  copy: () => T): FrameRead<T> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    const version = source.readU32(versionBegin);
    if (version === lastVersion) return { status: 'unchanged' };
    if (source.readU32(versionEnd) !== version) continue;
    const value = copy();
    if (source.readU32(versionEnd) === version && source.readU32(versionBegin) === version) return { status: 'ok', version, value };
  }
  return { status: 'torn' };
}

export function readScoringFrame(source: FrameSource, lastVersion: number | null): FrameRead<LiveScoringReading> {
  return readCoherent(source, SCORING.versionBegin, SCORING.versionEnd, lastVersion, () => {
    const header = source.read(0, SCORING_HEADER_BYTES);
    const count = Math.max(0, Math.min(header.readInt32LE(SCORING.info + SCORING_INFO.offsets.numVehicles), MAX_MAPPED_VEHICLES));
    const vehicles = count > 0 ? source.read(SCORING.vehicles, count * SCORING.vehicleStride) : Buffer.alloc(0);
    return decodeScoring(Buffer.concat([header, vehicles]));
  });
}

/** The player's pedal sample, tyre temperature and car; `slot` is where the player was found, to look there first next time. A missing player gives a null sample and car. */
export function readPedalFrame(source: FrameSource, playerId: number, lastVersion: number | null,
  slotHint: number, capture = false): FrameRead<{ slot: number; sample: LivePedalSample | null; tyreSurfaceAvgC: number | null; car: LiveCarReading | null; capture?: LiveCaptureSample | null }> {
  return readCoherent(source, TELEMETRY.versionBegin, TELEMETRY.versionEnd, lastVersion, () => {
    const count = Math.max(0, Math.min(source.readU32(TELEMETRY.numVehicles) | 0, MAX_MAPPED_VEHICLES));
    const slotOffset = (slot: number): number => TELEMETRY.vehicles + slot * TELEMETRY.vehicleStride;
    const candidates = slotHint >= 0 && slotHint < count ? [slotHint] : [];
    for (let slot = 0; slot < count; slot++) if (slot !== slotHint) candidates.push(slot);
    for (const slot of candidates) {
      if ((source.readU32(slotOffset(slot)) | 0) !== playerId) continue;
      const decoded = decodePedalSlot(source.read(slotOffset(slot), TELEMETRY.vehicleStride), capture);
      return { slot, sample: decoded.sample, tyreSurfaceAvgC: decoded.tyreSurfaceAvgC, car: decoded.car,
        ...(capture ? { capture: decoded.capture } : {}) };
    }
    return { slot: -1, sample: null, tyreSurfaceAvgC: null, car: null };
  });
}
