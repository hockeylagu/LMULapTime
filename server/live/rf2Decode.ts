import type { LiveCarReading } from '../../shared/domain/live/liveCarCondition.js';
import type { LiveScoringReading, LiveVehicleReading } from '../../shared/domain/live/liveLifecycle.js';
import type { LivePedalSample } from '../../shared/types/live.js';
import type { LivePitState } from '../../shared/types/liveStrategy.js';
import { knownCarClass } from '../../shared/domain/vehicleMapping.js';
import { MAX_MAPPED_VEHICLES, SCORING, SCORING_BUFFER, SCORING_INFO, TELEMETRY, VEHICLE_SCORING, VEHICLE_TELEMETRY, WHEEL } from './rf2Layout.js';
import type { MappedBuffer } from './sharedMemory.js';

/** What a coherent read needs from a mapping. */
export type FrameSource = Pick<MappedBuffer, 'readU32' | 'read' | 'readInto'>;

/** A frame's outcome: nothing new, a write caught half done on every attempt, or the decoded value. */
export type FrameRead<T> = { status: 'unchanged' } | { status: 'torn' } | { status: 'ok'; version: number; value: T };

const READ_ATTEMPTS = 3;
const SCORING_HEADER_BYTES = SCORING.vehicles;
// A mapping owns its scratch storage. Decoded objects never expose it, so retained readings
// survive subsequent polls, retries and reconnects without copying entire frames again.
const scoringCopies = new WeakMap<FrameSource, Buffer>();
const telemetryCopies = new WeakMap<FrameSource, Buffer>();
const UNCHANGED = { status: 'unchanged' } as const;
const TORN = { status: 'torn' } as const;

function cString(buffer: Buffer, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && buffer[end] !== 0) end++;
  return buffer.toString('utf8', offset, end);
}

/**
 * LMU's `mPitState` as LMU's REST names the same moments (three stops, Silverstone 2026-10-25): 1 request, 2 entering,
 * 4 while the car stands in the box (rF2's "exiting"; 3 never came), then 0 down the pit lane, where REST says exiting
 * until the car leaves the pits (also out of the garage).
 */
function pitState(raw: number, inPits: boolean): LivePitState {
  if (raw === 1) return 'request';
  if (raw === 2) return 'entering';
  if (raw === 3 || raw === 4) return 'stopped';
  return inPits ? 'exiting' : 'none';
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

function decodeVehicle(buffer: Buffer, base: number): LiveVehicleReading {
  const at = VEHICLE_SCORING.offsets;
  const double = (name: string): number => buffer.readDoubleLE(base + at[name]);
  const driverName = cString(buffer, base + at.driverName, 32);
  return {
    upgradePackHex: buffer.toString('hex', base + at.upgradePack, base + at.upgradePack + 16),
    id: buffer.readInt32LE(base + at.id),
    ...(driverName ? { driverName } : {}),
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
    pitState: pitState(buffer.readUInt8(base + at.pitState), buffer.readUInt8(base + at.inPits) !== 0),
    penalties: buffer.readInt16LE(base + at.numPenalties),
  };
}

/**
 * The scoring header and info followed by the vehicles that were copied, at their buffer offsets.
 * The player is the vehicle with `isPlayer` set, the leader the one in place 1.
 * Resolves overall and player-class leaders independently using canonical class aliases (`knownCarClass`);
 * class pace supplies the player's distance horizon, with overall flag timing preserved.
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
  let classLeaderBase = -1;
  let classLeaderPlace = Infinity;
  let playerClassPlace = player && player.vehicleClass && player.place > 0 ? 1 : null;
  let allDriversFinished = count > 0 && count === numVehicles ? true : null;
  const playerClass = knownCarClass(player?.vehicleClass);
  for (let i = 0; i < count; i++) {
    const base = SCORING.vehicles + i * SCORING.vehicleStride;
    const status = buffer.readInt8(base + at.finishStatus);
    if (allDriversFinished && (status < 1 || status > 3)) allDriversFinished = false;
    const place = buffer.readUInt8(base + at.place);
    if (place <= 0 || !player?.vehicleClass) continue;
    const vehicleClass = cString(buffer, base + at.vehicleClass, 32);
    if (playerClass ? knownCarClass(vehicleClass) !== playerClass : vehicleClass !== player.vehicleClass) continue;
    if (playerClassPlace !== null && place < player.place) playerClassPlace++;
    if (playerClass && count === numVehicles && place < classLeaderPlace) {
      classLeaderBase = base;
      classLeaderPlace = place;
    }
  }
  if (classLeaderBase >= 0) {
    const id = buffer.readInt32LE(classLeaderBase + at.id);
    classLeader = id === player?.id ? player : id === leader?.id ? leader : decodeVehicle(buffer, classLeaderBase);
  }
  return {
    trackName: cString(buffer, info + infoAt.trackName, 64),
    playerClassPlace,
    sessionCode: buffer.readInt32LE(info + infoAt.session),
    currentEt: buffer.readDoubleLE(info + infoAt.currentET),
    endEt: buffer.readDoubleLE(info + infoAt.endET),
    numVehicles,
    allDriversFinished,
    inRealtime: buffer.readUInt8(info + infoAt.inRealtime) !== 0,
    gamePhase: buffer.readUInt8(info + infoAt.gamePhase),
    trackLength: buffer.readDoubleLE(info + infoAt.lapDist),
    trackTempC: buffer.readDoubleLE(info + infoAt.trackTemp),
    raining: clamp01(buffer.readDoubleLE(info + infoAt.raining)),
    avgPathWetness: clamp01(buffer.readDoubleLE(info + infoAt.avgPathWetness)),
    maxPathWetness: Number.isFinite(buffer.readDoubleLE(info + infoAt.maxPathWetness))
      ? clamp01(buffer.readDoubleLE(info + infoAt.maxPathWetness)) : undefined,
    minPathWetness: Number.isFinite(buffer.readDoubleLE(info + infoAt.minPathWetness))
      ? clamp01(buffer.readDoubleLE(info + infoAt.minPathWetness)) : undefined,
    trackGripLevel: buffer.readUInt8(info + infoAt.trackGripLevel),
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
  const motorMapMax = slot.readUInt8(at.motorMapMax);
  const motorState = slot.readUInt8(at.electricBoostMotorState);
  return {
    fuelLiters: finite(slot.readDoubleLE(at.fuel)),
    fuelCapacityLiters: finite(slot.readDoubleLE(at.fuelCapacity)),
    dentSeverity: Array.from({ length: 8 }, (_, index) => slot.readUInt8(at.dentSeverity + index)),
    detached: slot.readUInt8(at.detached) !== 0,
    wheels: [0, 1, 2, 3].map(index => ({ flat: wheel(index, 'flat'), detached: wheel(index, 'detached') })),
    lastImpactEt: finite(slot.readDoubleLE(at.lastImpactET)),
    tread: [0, 1, 2, 3].map(index => clamp01(slot.readDoubleLE(at.wheels + index * WHEEL.size + WHEEL.offsets.wear))),
    compound: cString(slot, at.frontTireCompoundName, 18).trim(),
    virtualEnergy: finite(slot.readFloatLE(at.virtualEnergy)),
    // Hybrid when the map range or the motor state says so (state 0 is unavailable; a GT3 is not checked yet).
    ...(motorMapMax > 0 || motorState !== 0 ? { hybrid: {
      batteryChargeFraction: finite(slot.readDoubleLE(at.batteryChargeFraction)), soc: finite(slot.readFloatLE(at.soc)),
      motorMap: slot.readUInt8(at.motorMap), motorMapMax, motorState, regen: finite(slot.readFloatLE(at.regen)),
    } } : {}),
  };
}

export interface PedalSlot {
  id: number; sample: LivePedalSample; tyreSurfaceAvgC: number | null; car: LiveCarReading | null;
}

/** Takes the player's coherent slot for durable capture; `checkpoint` is set on the car cadence. */
export interface CaptureSink {
  add(slot: Buffer, checkpoint: boolean): void;
}

/** One telemetry vehicle slot (VEHICLE_TELEMETRY.size bytes): its id, the driver's unfiltered pedals at its session time, the tyre surface temperature and the car. */
export function decodePedalSlot(slot: Buffer, car = true): PedalSlot {
  const at = VEHICLE_TELEMETRY.offsets;
  return {
    id: slot.readInt32LE(at.id),
    tyreSurfaceAvgC: tyreSurfaceAverage(slot),
    car: car ? decodeCar(slot) : null,
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
    if (version === lastVersion) return UNCHANGED;
    if (source.readU32(versionEnd) !== version) continue;
    const value = copy();
    if (source.readU32(versionEnd) === version && source.readU32(versionBegin) === version) return { status: 'ok', version, value };
  }
  return TORN;
}

export function readScoringFrame(source: FrameSource, lastVersion: number | null): FrameRead<LiveScoringReading> {
  let buffer = scoringCopies.get(source);
  if (!buffer) { buffer = Buffer.allocUnsafe(SCORING_BUFFER.size); scoringCopies.set(source, buffer); }
  const target = buffer;
  const result = readCoherent(source, SCORING.versionBegin, SCORING.versionEnd, lastVersion, () => {
    source.readInto(0, target, 0, SCORING_HEADER_BYTES);
    const count = Math.max(0, Math.min(target.readInt32LE(SCORING.info + SCORING_INFO.offsets.numVehicles), MAX_MAPPED_VEHICLES));
    if (count > 0) source.readInto(SCORING.vehicles, target, SCORING.vehicles, count * SCORING.vehicleStride);
  });
  return result.status === 'ok' ? { status: 'ok', version: result.version, value: decodeScoring(target) } : result;
}

/**
 * The player's pedal sample, tyre temperature and car; `slot` is where the player was found, to look there first next time.
 * A missing player gives a null sample and car. The coherent slot also goes to `capture`, when given.
 */
export function readPedalFrame(source: FrameSource, playerId: number, lastVersion: number | null,
  slotHint: number, capture: CaptureSink | null = null, car = true): FrameRead<{ slot: number; sample: LivePedalSample | null; tyreSurfaceAvgC: number | null; car: LiveCarReading | null }> {
  let buffer = telemetryCopies.get(source);
  if (!buffer) { buffer = Buffer.allocUnsafe(TELEMETRY.vehicleStride); telemetryCopies.set(source, buffer); }
  const target = buffer;
  const result = readCoherent(source, TELEMETRY.versionBegin, TELEMETRY.versionEnd, lastVersion, () => {
    const count = Math.max(0, Math.min(source.readU32(TELEMETRY.numVehicles) | 0, MAX_MAPPED_VEHICLES));
    let found = -1;
    if (slotHint >= 0 && slotHint < count
      && (source.readU32(TELEMETRY.vehicles + slotHint * TELEMETRY.vehicleStride) | 0) === playerId) found = slotHint;
    for (let slot = 0; found < 0 && slot < count; slot++) {
      if (slot === slotHint) continue;
      if ((source.readU32(TELEMETRY.vehicles + slot * TELEMETRY.vehicleStride) | 0) === playerId) found = slot;
    }
    if (found >= 0) source.readInto(TELEMETRY.vehicles + found * TELEMETRY.vehicleStride, target, 0, TELEMETRY.vehicleStride);
    return found;
  });
  if (result.status !== 'ok') return result;
  // Decode only the accepted snapshot. Torn attempts never allocate domain objects or capture rows.
  const decoded = result.value >= 0 ? decodePedalSlot(target, car) : null;
  if (decoded) capture?.add(target, car);
  return { status: 'ok', version: result.version, value: {
    slot: result.value, sample: decoded?.sample ?? null, tyreSurfaceAvgC: decoded?.tyreSurfaceAvgC ?? null,
    car: decoded?.car ?? null,
  } };
}
