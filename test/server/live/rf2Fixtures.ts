/** Synthetic rF2 shared memory buffers built with the computed layout. */
import { SCORING, SCORING_BUFFER, SCORING_INFO, TELEMETRY, TELEMETRY_BUFFER, VEHICLE_SCORING, VEHICLE_TELEMETRY, WHEEL } from '../../../server/live/rf2Layout.js';
import type { FrameSource } from '../../../server/live/rf2Decode.js';

/** Optional scoring fields, by their `VEHICLE_SCORING` names (doubles, except the integers below). */
export interface ScoringVehicle {
  id: number; isPlayer: boolean; place: number; totalLaps: number; name: string; className: string;
  doubles?: Record<string, number>;
  /** `sector`, `finishStatus` (i8), `countLapFlag`, `inPits` (u8). */
  bytes?: { sector?: number; finishStatus?: number; countLapFlag?: number; inPits?: number };
  lapsBehindLeader?: number;
  /** `bestLapSector1` and `bestLapSector2` (f32). */
  floats?: { bestLapSector1?: number; bestLapSector2?: number };
}

export interface ScoringHeader { inRealtime?: boolean; currentEt?: number; phase?: number; trackTemp?: number; raining?: number; avgPathWetness?: number; lapDist?: number }

export function scoringBuffer(version: number, vehicles: ScoringVehicle[], info: ScoringHeader = {}): Buffer {
  const buffer = Buffer.alloc(SCORING_BUFFER.size);
  buffer.writeUInt32LE(version, SCORING.versionBegin);
  buffer.writeUInt32LE(version, SCORING.versionEnd);
  const at = SCORING_INFO.offsets;
  buffer.write('Circuit de la Sarthe', SCORING.info + at.trackName, 'utf8');
  buffer.writeInt32LE(10, SCORING.info + at.session);
  buffer.writeDoubleLE(info.currentEt ?? 321.5, SCORING.info + at.currentET);
  buffer.writeDoubleLE(3600, SCORING.info + at.endET);
  buffer.writeInt32LE(2147483647, SCORING.info + at.maxLaps);
  buffer.writeInt32LE(vehicles.length, SCORING.info + at.numVehicles);
  buffer.writeDoubleLE(info.lapDist ?? 13_626, SCORING.info + at.lapDist);
  buffer.writeDoubleLE(info.trackTemp ?? 31.5, SCORING.info + at.trackTemp);
  buffer.writeDoubleLE(info.raining ?? 0, SCORING.info + at.raining);
  buffer.writeDoubleLE(info.avgPathWetness ?? 0, SCORING.info + at.avgPathWetness);
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
    for (const [name, value] of Object.entries(vehicle.doubles ?? {})) buffer.writeDoubleLE(value, base + v[name]);
    for (const [name, value] of Object.entries(vehicle.floats ?? {})) buffer.writeFloatLE(value, base + v[name]);
    const small = vehicle.bytes ?? {};
    buffer.writeInt8(small.sector ?? 1, base + v.sector);
    buffer.writeInt8(small.finishStatus ?? 0, base + v.finishStatus);
    buffer.writeUInt8(small.countLapFlag ?? 2, base + v.countLapFlag);
    buffer.writeUInt8(small.inPits ?? 0, base + v.inPits);
    buffer.writeInt32LE(vehicle.lapsBehindLeader ?? 0, base + v.lapsBehindLeader);
  });
  return buffer;
}

export function telemetryBuffer(version: number, slots: Array<{ id: number; et: number; throttle: number; brake: number; tyreKelvin?: number }>): Buffer {
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
    for (let wheel = 0; wheel < 4; wheel++) {
      for (let part = 0; part < 3; part++) {
        buffer.writeDoubleLE(slot.tyreKelvin ?? 0, base + t.wheels + wheel * WHEEL.size + WHEEL.offsets.temperature + part * 8);
      }
    }
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
    readInto: (offset: number, target: Buffer, targetOffset: number, length: number) => {
      fake.copies++; buffer().copy(target, targetOffset, offset, offset + length);
    },
  };
  return fake;
}
