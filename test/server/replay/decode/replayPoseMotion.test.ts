import { describe, expect, it } from 'vitest';
import { decodeReplayPose } from '../../../../server/replay/decode/replayPose.js';

const G = 9.80665;

interface MotionCodes { accelX?: number; accelZ?: number; velocityX?: number; velocityY?: number; velocityZ?: number; yaw?: number }

/** A 65-byte pose (docs/VCR_FORMAT.md §4.1) with the given motion codes, heading and position 0. */
function pose(rotY: number, codes: MotionCodes): Buffer {
  const payload = Buffer.alloc(65);
  const write = (start: number, length: number, value: number) => {
    const bits = value < 0 ? value + 2 ** length : value;
    for (let i = 0; i < length; i++) {
      const k = start + i;
      if (Math.floor(bits / 2 ** i) % 2) payload[k >> 3] |= 1 << (k & 7);
    }
  };
  const accelZ = codes.accelZ ?? 0;
  write(24, 8, (accelZ < 0 ? accelZ + 4096 : accelZ) & 0xff);
  write(272, 4, (accelZ < 0 ? accelZ + 4096 : accelZ) >> 8);
  write(276, 12, codes.accelX ?? 0);
  write(64, 14, codes.velocityX ?? 0);
  write(78, 12, codes.velocityY ?? 0);
  write(90, 14, codes.velocityZ ?? 0);
  write(112, 9, codes.yaw ?? 0);
  payload.writeFloatLE(rotY, 57);
  return payload;
}

const decode = (payload: Buffer) => decodeReplayPose(payload, 0, 10, 9, {})!;

describe('replay pose motion (ISO 8855)', () => {
  // Heading 0: the car points to world −z, its left is world +x.
  it('reads braking as negative longitudinal G and the car moving forward', () => {
    const point = decode(pose(0, { velocityZ: -50 * 32, accelZ: 314 }));
    expect(point.velocityLon).toBe(50);
    expect(point.velocityLat).toBe(0);
    expect(point.accelLonG).toBeCloseTo(-314 / 32 / G, 3);
    expect(point.accelLonG).toBeLessThan(0);
  });

  it('reads a left turn as positive lateral G, yaw rate and left velocity', () => {
    const point = decode(pose(0, { velocityZ: -40 * 32, velocityX: 64, accelX: 480, yaw: -64 }));
    expect(point.accelLatG).toBeCloseTo(480 / 32 / G, 3);
    expect(point.accelLatG).toBeGreaterThan(0);
    expect(point.yawRateDeg).toBe(57.3);
    expect(point.velocityLat).toBe(2);
  });

  it('turns the world frame with the heading', () => {
    // Heading π/2: forward is world −x, left is world −z.
    const point = decode(pose(Math.PI / 2, { velocityX: -30 * 32, accelZ: -160 }));
    expect(point.velocityLon).toBe(30);
    expect(point.accelLatG).toBeCloseTo(160 / 32 / G, 3);
    expect(point.accelLonG).toBe(0);
  });

  it('keeps every recorded code: rotating back with the stored heading gives them exactly', () => {
    const rotY = 1.2345;
    const forward = [-Math.sin(rotY), -Math.cos(rotY)], left = [Math.cos(rotY), -Math.sin(rotY)];
    for (const codes of [
      { accelX: 1203, accelZ: -1777, velocityX: 2311, velocityZ: -5002, yaw: 201 },
      { accelX: -2047, accelZ: 2047, velocityX: -8191, velocityZ: 8191, yaw: -256 },
      { accelX: 3, accelZ: -1, velocityX: 1, velocityZ: -2, yaw: 1 },
    ]) {
      const point = decode(pose(rotY, codes));
      const back = (lon: number, lat: number, axis: 0 | 1) => lon * forward[axis] + lat * left[axis];
      expect(Math.round(back(point.accelLonG!, point.accelLatG!, 0) * G * 32)).toBe(codes.accelX);
      expect(Math.round(back(point.accelLonG!, point.accelLatG!, 1) * G * 32)).toBe(codes.accelZ);
      expect(Math.round(back(point.velocityLon!, point.velocityLat!, 0) * 32)).toBe(codes.velocityX);
      expect(Math.round(back(point.velocityLon!, point.velocityLat!, 1) * 32)).toBe(codes.velocityZ);
      expect(Math.round((-point.yawRateDeg! * Math.PI / 180) * 64)).toBe(codes.yaw);
    }
  });

  it('has no velocity on a pose without one', () => {
    const point = decode(pose(0, {}));
    expect(point.velocityLon).toBeUndefined();
    expect(point.speedKmhRaw).toBeUndefined();
    expect(point.accelLonG).toBe(0);
  });
});
