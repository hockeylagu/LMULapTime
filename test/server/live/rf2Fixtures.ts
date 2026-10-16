/** Synthetic rF2 shared memory buffers built with the computed layout. */
import { SCORING, SCORING_BUFFER, SCORING_INFO, TELEMETRY, TELEMETRY_BUFFER, VEHICLE_SCORING, VEHICLE_TELEMETRY } from '../../../server/live/rf2Layout.js';
import type { FrameSource } from '../../../server/live/rf2Decode.js';

export interface ScoringVehicle { id: number; isPlayer: boolean; place: number; totalLaps: number; name: string; className: string }

export function scoringBuffer(version: number, vehicles: ScoringVehicle[], info: { inRealtime?: boolean; phase?: number } = {}): Buffer {
  const buffer = Buffer.alloc(SCORING_BUFFER.size);
  buffer.writeUInt32LE(version, SCORING.versionBegin);
  buffer.writeUInt32LE(version, SCORING.versionEnd);
  const at = SCORING_INFO.offsets;
  buffer.write('Circuit de la Sarthe', SCORING.info + at.trackName, 'utf8');
  buffer.writeInt32LE(10, SCORING.info + at.session);
  buffer.writeDoubleLE(321.5, SCORING.info + at.currentET);
  buffer.writeDoubleLE(3600, SCORING.info + at.endET);
  buffer.writeInt32LE(2147483647, SCORING.info + at.maxLaps);
  buffer.writeInt32LE(vehicles.length, SCORING.info + at.numVehicles);
  buffer.writeUInt8(info.phase ?? 5, SCORING.info + at.gamePhase);
  buffer.writeUInt8(info.inRealtime === false ? 0 : 1, SCORING.info + at.inRealtime);
  const v = VEHICLE_SCORING.offsets;
  vehicles.forEach((vehicle, i) => {
    const base = SCORING.vehicles + i * SCORING.vehicleStride;
    buffer.writeInt32LE(vehicle.id, base + v.id);
    buffer.write(vehicle.name, base + v.vehicleName, 'utf8');
    buffer.write(vehicle.className, base + v.vehicleClass, 'utf8');
    buffer.writeInt16LE(vehicle.totalLaps, base + v.totalLaps);
    buffer.writeUInt8(vehicle.isPlayer ? 1 : 0, base + v.isPlayer);
    buffer.writeUInt8(vehicle.place, base + v.place);
  });
  return buffer;
}

export function telemetryBuffer(version: number, slots: Array<{ id: number; et: number; throttle: number; brake: number }>): Buffer {
  const buffer = Buffer.alloc(TELEMETRY_BUFFER.size);
  buffer.writeUInt32LE(version, TELEMETRY.versionBegin);
  buffer.writeUInt32LE(version, TELEMETRY.versionEnd);
  buffer.writeInt32LE(slots.length, TELEMETRY.numVehicles);
  const t = VEHICLE_TELEMETRY.offsets;
  slots.forEach((slot, i) => {
    const base = TELEMETRY.vehicles + i * TELEMETRY.vehicleStride;
    buffer.writeInt32LE(slot.id, base + t.id);
    buffer.writeDoubleLE(slot.et, base + t.elapsedTime);
    buffer.writeDoubleLE(slot.throttle, base + t.unfilteredThrottle);
    buffer.writeDoubleLE(slot.brake, base + t.unfilteredBrake);
  });
  return buffer;
}

/** A mapping over a buffer; `onRead` runs before each counter read, to simulate the writer. */
export function source(buffer: () => Buffer, onRead: (reads: number) => void = () => undefined): FrameSource & { reads: number; copies: number } {
  const fake = {
    reads: 0,
    copies: 0,
    readU32: (offset: number) => { onRead(fake.reads++); return buffer().readUInt32LE(offset); },
    read: (offset: number, length: number) => { fake.copies++; return Buffer.from(buffer().subarray(offset, offset + length)); },
  };
  return fake;
}
