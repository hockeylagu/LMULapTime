import type { RawTrajectoryPoint } from './replayLapBuilder.js';
import { roundFixed } from './replayLapPoints.js';

/** Per-car values of other events (opcodes 51, 138, 143, 144) held until the car's next change. */
export type ReplayPoseState = Pick<RawTrajectoryPoint,
  'brakeTemps' | 'wheelLoads' | 'tireSlideSpeeds' | 'virtualEnergy' | 'rainIntensity' | 'ambientTemp' | 'tireCompoundIndices'>;

/** Engine speed field (pose bits 50..63) to rpm: n / 7 rad/s. */
const RPM_PER_UNIT = 60 / (14 * Math.PI);

function signed(low: number, high: number): number {
  const value = low | (high << 8);
  return value & 0x8000 ? value - 0x10000 : value;
}

function packetSpeed(payload: Buffer, offset: number): number | undefined {
  const b0 = payload[offset], b1 = payload[offset + 1], b2 = payload[offset + 2], b3 = payload[offset + 3], b4 = payload[offset + 4];
  if ((b0 | b1 | b2 | b3 | b4) === 0) return undefined;
  const high1 = (b1 & 0x20) ? (b1 & 0x3f) + 192 : b1 & 0x3f;
  const low2 = (b1 >> 6) + ((b2 & 0x3f) << 2);
  const high2 = (b2 >> 6) + ((b3 & 1) << 2) + ((b3 & 2) ? 248 : 0);
  const low3 = ((b3 & 0xfc) >> 2) + ((b4 & 3) << 6);
  const high3 = (b4 & 0x80) ? (b4 >> 2) + 192 : b4 >> 2;
  const speed = Math.hypot(3.6 * signed(b0, high1) / 32, 3.6 * signed(low2, high2) / 20, 3.6 * signed(low3, high3) / 32);
  return isFinite(speed) ? speed : undefined;
}

/**
 * The four wheels of a pose (bytes 16..33, docs/VCR_FORMAT.md §4.1): angular speed in rad/s, negative when the wheel turns
 * backwards, and suspension deflection in metres.
 */
function poseWheels(payload: Buffer, offset: number): { speeds: [number, number, number, number]; deflections: [number, number, number, number] } {
  const nibbles = payload.readUInt16LE(offset + 32);
  const speeds: [number, number, number, number] = [0, 0, 0, 0];
  const deflections: [number, number, number, number] = [0, 0, 0, 0];
  for (let wheel = 0; wheel < 4; wheel++) {
    const word = payload.readUInt32LE(offset + 16 + wheel * 4);
    const value = (word & 0x3ffff) | (((nibbles >> (wheel * 4)) & 15) << 18);
    const slowSpeed = (value >> 13) & 255;
    const speed = slowSpeed === 255 ? (value & 0x1fff) / 16 : slowSpeed / 16;
    speeds[wheel] = (value >> 21) & 1 ? -speed : speed;
    deflections[wheel] = ((word | 0) >> 18) / 2048;
  }
  return { speeds, deflections };
}

/** Same canonical pose decoding for direct requests and packets routed by a shared scan. */
export function decodeReplayPose(payload: Buffer, offset: number, sTime: number, opcode: number, state: ReplayPoseState): RawTrajectoryPoint | undefined {
  const x = payload.readFloatLE(offset + 41), y = payload.readFloatLE(offset + 45), z = payload.readFloatLE(offset + 49);
  if (!(Math.abs(x) < 20000 && Math.abs(z) < 20000 && !isNaN(x) && !isNaN(z))) return undefined;
  const steer10 = payload.readUInt16LE(offset + 4) & 0x3ff;
  const throttle = (payload.readUInt16LE(offset + 5) >> 3) & 63;
  const brake = payload[offset + 36], status = payload[offset + 38];
  const engineSpeed = payload.readUInt16LE(offset + 6) >> 2;
  const wheels = poseWheels(payload, offset);
  return {
    sTime, x, y, z,
    rotX: payload.readFloatLE(offset + 53), rotY: payload.readFloatLE(offset + 57), rotZ: payload.readFloatLE(offset + 61),
    steerYaw: roundFixed((512 - steer10) / 512, 4),
    rawThrottle: Math.round((throttle / 63) * 100),
    rawBrake: Math.min(100, Math.round(((brake & 0x3f) / 63) * 100)),
    tcActive: Boolean(brake & 0x80), absActive: Boolean(brake & 0x40), pitLimiter: Boolean(status & 0x04),
    headlights: Boolean(payload[offset + 2] & 0x10),
    gearRaw: opcode >= 7 && opcode <= 17 ? opcode - 8 : undefined,
    speedKmhRaw: packetSpeed(payload, offset + 8),
    engineRpm: Math.round(engineSpeed * RPM_PER_UNIT),
    wheelAngularSpeeds: wheels.speeds,
    suspensionDeflections: wheels.deflections,
    brakeTemps: state.brakeTemps ? [...state.brakeTemps] : undefined,
    wheelLoads: state.wheelLoads ? [...state.wheelLoads] : undefined,
    tireSlideSpeeds: state.tireSlideSpeeds ? [...state.tireSlideSpeeds] : undefined,
    virtualEnergy: state.virtualEnergy, rainIntensity: state.rainIntensity, ambientTemp: state.ambientTemp,
    tireCompoundIndices: state.tireCompoundIndices,
  };
}
