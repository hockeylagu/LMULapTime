import type { RawTrajectoryPoint } from './replayLapBuilder.js';

export type ReplayPoseState = Pick<RawTrajectoryPoint, 'wheelSpeeds' | 'brakeTemps' | 'virtualEnergy' | 'rainIntensity' | 'ambientTemp' | 'tireCompoundIndices'>;

function packetSpeed(payload: Buffer, offset: number): number | undefined {
  const b0 = payload[offset], b1 = payload[offset + 1], b2 = payload[offset + 2], b3 = payload[offset + 3], b4 = payload[offset + 4];
  if ((b0 | b1 | b2 | b3 | b4) === 0) return undefined;
  const signed = (low: number, high: number): number => {
    const value = low | (high << 8);
    return value & 0x8000 ? value - 0x10000 : value;
  };
  const high1 = (b1 & 0x20) ? (b1 & 0x3f) + 192 : b1 & 0x3f;
  const low2 = (b1 >> 6) + ((b2 & 0x3f) << 2);
  const high2 = (b2 >> 6) + ((b3 & 1) << 2) + ((b3 & 2) ? 248 : 0);
  const low3 = ((b3 & 0xfc) >> 2) + ((b4 & 3) << 6);
  const high3 = (b4 & 0x80) ? (b4 >> 2) + 192 : b4 >> 2;
  const speed = Math.hypot(3.6 * signed(b0, high1) / 32, 3.6 * signed(low2, high2) / 20, 3.6 * signed(low3, high3) / 32);
  return isFinite(speed) ? speed : undefined;
}

/** Same canonical pose decoding for direct requests and packets routed by a shared scan. */
export function decodeReplayPose(payload: Buffer, offset: number, sTime: number, eventType: number, state: ReplayPoseState): RawTrajectoryPoint | undefined {
  const x = payload.readFloatLE(offset + 41), y = payload.readFloatLE(offset + 45), z = payload.readFloatLE(offset + 49);
  if (!(Math.abs(x) < 20000 && Math.abs(z) < 20000 && !isNaN(x) && !isNaN(z))) return undefined;
  const info2 = payload.readUInt32LE(offset + 4);
  const steer10 = payload.readUInt16LE(offset + 4) & 0x3ff;
  const throttle = payload[offset + 5], brake = payload[offset + 36], status = payload[offset + 38];
  const rpm = (payload.readUInt16LE(offset + 6) >>> 5) & 0x3ff;
  return {
    sTime, x, y, z,
    rotX: payload.readFloatLE(offset + 53), rotY: payload.readFloatLE(offset + 57), rotZ: payload.readFloatLE(offset + 61),
    steerYaw: parseFloat(((512 - steer10) / 512).toFixed(4)),
    rawThrottle: throttle <= 1 ? 0 : Math.min(100, Math.round(((throttle - 1) / 248) * 100)),
    rawBrake: brake === 0 ? 0 : Math.min(100, Math.round(((brake & 0x3f) / 63) * 100)),
    tcActive: Boolean(brake & 0x80), absActive: Boolean(brake & 0x40), pitLimiter: Boolean(status & 0x04),
    inPit: Boolean(payload.readUInt32LE(offset) & (1 << 17)), isOffTrack: Boolean(status & 0x01),
    gearRaw: eventType >= 7 && eventType <= 15 ? eventType - 8 : undefined,
    speedKmhRaw: packetSpeed(payload, offset + 8), detachablePartState: info2 & 0x3ff,
    engineRpm: rpm < 1023 ? Math.round(rpm * 10.9228) : undefined,
    wheelSpeeds: state.wheelSpeeds ? [...state.wheelSpeeds] : undefined,
    brakeTemps: state.brakeTemps ? [...state.brakeTemps] : undefined,
    virtualEnergy: state.virtualEnergy, rainIntensity: state.rainIntensity, ambientTemp: state.ambientTemp,
    tireCompoundIndices: state.tireCompoundIndices,
  };
}
