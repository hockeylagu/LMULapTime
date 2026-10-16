import type { LiveScoringReading } from '../../shared/domain/live/liveLifecycle.js';
import type { LivePedalSample } from '../../shared/types/live.js';
import { MAX_MAPPED_VEHICLES, SCORING, SCORING_INFO, TELEMETRY, VEHICLE_SCORING, VEHICLE_TELEMETRY } from './rf2Layout.js';
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

/**
 * The scoring header and info followed by the vehicles that were copied, at their buffer offsets.
 * The player is the vehicle with `isPlayer` set.
 */
export function decodeScoring(buffer: Buffer): LiveScoringReading {
  const info = SCORING.info;
  const infoAt = SCORING_INFO.offsets;
  const numVehicles = buffer.readInt32LE(info + infoAt.numVehicles);
  const copied = Math.floor((buffer.length - SCORING.vehicles) / SCORING.vehicleStride);
  const count = Math.max(0, Math.min(numVehicles, MAX_MAPPED_VEHICLES, copied));
  const at = VEHICLE_SCORING.offsets;
  let player: LiveScoringReading['player'] = null;
  for (let i = 0; i < count && !player; i++) {
    const base = SCORING.vehicles + i * SCORING.vehicleStride;
    if (buffer.readUInt8(base + at.isPlayer) === 0) continue;
    player = {
      id: buffer.readInt32LE(base + at.id),
      place: buffer.readUInt8(base + at.place),
      totalLaps: buffer.readInt16LE(base + at.totalLaps),
      vehicleName: cString(buffer, base + at.vehicleName, 64),
      vehicleClass: cString(buffer, base + at.vehicleClass, 32),
    };
  }
  return {
    trackName: cString(buffer, info + infoAt.trackName, 64),
    sessionCode: buffer.readInt32LE(info + infoAt.session),
    currentEt: buffer.readDoubleLE(info + infoAt.currentET),
    endEt: buffer.readDoubleLE(info + infoAt.endET),
    maxLaps: buffer.readInt32LE(info + infoAt.maxLaps),
    numVehicles,
    inRealtime: buffer.readUInt8(info + infoAt.inRealtime) !== 0,
    gamePhase: buffer.readUInt8(info + infoAt.gamePhase),
    player,
  };
}

/** One telemetry vehicle slot (VEHICLE_TELEMETRY.size bytes): its id and the driver's unfiltered pedals at its session time. */
export function decodePedalSlot(slot: Buffer): { id: number; sample: LivePedalSample } {
  const at = VEHICLE_TELEMETRY.offsets;
  return {
    id: slot.readInt32LE(at.id),
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

/** The player's pedal sample; `slot` is where the player was found, to look there first next time. A missing player gives a null sample. */
export function readPedalFrame(source: FrameSource, playerId: number, lastVersion: number | null,
  slotHint: number): FrameRead<{ slot: number; sample: LivePedalSample | null }> {
  return readCoherent(source, TELEMETRY.versionBegin, TELEMETRY.versionEnd, lastVersion, () => {
    const count = Math.max(0, Math.min(source.readU32(TELEMETRY.numVehicles) | 0, MAX_MAPPED_VEHICLES));
    const slotOffset = (slot: number): number => TELEMETRY.vehicles + slot * TELEMETRY.vehicleStride;
    const candidates = slotHint >= 0 && slotHint < count ? [slotHint] : [];
    for (let slot = 0; slot < count; slot++) if (slot !== slotHint) candidates.push(slot);
    for (const slot of candidates) {
      if ((source.readU32(slotOffset(slot)) | 0) !== playerId) continue;
      return { slot, sample: decodePedalSlot(source.read(slotOffset(slot), TELEMETRY.vehicleStride)).sample };
    }
    return { slot: -1, sample: null };
  });
}
