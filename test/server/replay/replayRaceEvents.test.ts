import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractReplayTrajectory } from '../../../server/replay/replayTrajectory.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

function contactPayload(magnitude: number, otherParty: number): Buffer {
  const payload = Buffer.alloc(33);
  payload.writeFloatLE(magnitude, 8);
  payload[32] = otherParty;
  return payload;
}

// Header class bits 29-31: bit 29 flags a race replay, the class proper is bits 30-31. Practice and
// qualifying replays send the same packets with bit 29 clear (class 0 is raw 0, race raw 1).
const rawClass = (maskedClass: number, race: boolean): number => (maskedClass << 1) | (race ? 1 : 0);

describe.each([
  { session: 'race', race: true },
  { session: 'practice', race: false },
])('replay $session packets - Virtual Energy (0/51), tyre compound (0/16), contact (0/17)', ({ race }) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-vcr-session-events-'));

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeReplay = (name: string): string => {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [
        { name: 'Samuel Lague', vehicleId: '21_26_AFCO95641716', team: 'Vista AF Corsa', carNumber: '21' },
        { name: 'Test Rival', vehicleId: '32_26_WRT_83524148', team: 'Team WRT', carNumber: '32' },
      ],
      slices: [
        {
          sTime: 10.0, driverSlot: 1, x: 10, y: 0, z: 10,
          rawEvents: [
            { evClass: rawClass(0, race), evType: 51, slot: 1, payload: Buffer.from([153, 0, 0]) },
            { evClass: rawClass(0, race), evType: 16, slot: 1, payload: Buffer.from([0, 0, 0, 0]) },
          ],
        },
        {
          sTime: 10.1, driverSlot: 1, x: 20, y: 0, z: 20,
          rawEvents: [
            { evClass: rawClass(0, race), evType: 17, slot: 1, payload: contactPayload(273.86, 112) },
            { evClass: rawClass(0, race), evType: 17, slot: 1, payload: contactPayload(95.48, 0) },
          ],
        },
        {
          sTime: 10.2, driverSlot: 1, x: 30, y: 0, z: 30,
          rawEvents: [
            { evClass: rawClass(0, race), evType: 51, slot: 1, payload: Buffer.from([152, 0, 0]) },
            { evClass: rawClass(0, race), evType: 16, slot: 1, payload: Buffer.from([1, 1, 0, 1]) },
          ],
        },
        { sTime: 10.3, driverSlot: 1, x: 40, y: 0, z: 40 },
      ],
    }));
    return filePath;
  };

  it('stores byte 0 of 1/51 as Virtual Energy percent, never as fuel', () => {
    const traj = extractReplayTrajectory(writeReplay('ve.vcr'), { driverSlot: 1, maxPoints: 0 });
    // The pose is written before the slice's other events, so a value shows from the next pose on.
    expect(traj.points[0].virtualEnergy).toBeUndefined();
    expect(traj.points[1].virtualEnergy).toBe(60);
    expect(traj.points[3].virtualEnergy).toBeCloseTo(59.6, 1);
    expect(traj.points.every(p => p.fuel === undefined)).toBe(true);
    expect(traj.energyTelemetryAvailable).toBe(true);
  });

  it('reports no Virtual Energy for a car whose 1/51 packet stays at zero (no VE system, e.g. GTE)', () => {
    const filePath = path.join(tempDir, 'gte.vcr');
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      slices: [0, 1, 2].map(i => ({
        sTime: 10 + i / 10, driverSlot: 1, x: i * 10, y: 0, z: i * 10,
        rawEvents: [{ evClass: rawClass(0, race), evType: 51, slot: 1, payload: Buffer.from([0, 0, 0]) }],
      })),
    }));
    const traj = extractReplayTrajectory(filePath, { driverSlot: 1, maxPoints: 0 });
    expect(traj.points.every(p => p.virtualEnergy === undefined)).toBe(true);
    expect(traj.energyTelemetryAvailable).toBe(false);
  });

  it('decodes per-wheel tyre compound indices [FL, FR, RL, RR] and keeps the latest per driver', () => {
    const traj = extractReplayTrajectory(writeReplay('compound.vcr'), { driverSlot: 1, maxPoints: 0 });
    expect(traj.points[1].tireCompoundIndices).toEqual([0, 0, 0, 0]);
    expect(traj.points[3].tireCompoundIndices).toEqual([1, 1, 0, 1]);
    expect(traj.tireCompounds).toEqual([1, 1, 0, 1]);
  });

  it('decodes contacts with impact magnitude and the other car or object', () => {
    const traj = extractReplayTrajectory(writeReplay('contact.vcr'), { driverSlot: 1, maxPoints: 0 });
    expect(traj.contacts).toHaveLength(2);
    const [wall, car] = traj.contacts!;
    expect(wall).toMatchObject({ driverSlot: 1, timeSec: 10.1, impactMagnitude: 273.86, otherParty: 112, otherPartyName: 'Immovable' });
    expect(car).toMatchObject({ driverSlot: 1, impactMagnitude: 95.48, otherParty: 0 });
  });
  it('decodes penalties issued (3/5) and served (3/7), and flags (1/10)', () => {
    const filePath = path.join(tempDir, 'penalty.vcr');
    const issued = (type: number, halfSeconds: number, text: string): Buffer => Buffer.concat([Buffer.from([type, halfSeconds]), Buffer.from(text, 'utf8')]);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      slices: [
        {
          sTime: 20.0, driverSlot: 1, x: 0, y: 0, z: 0,
          rawEvents: [
            { evClass: rawClass(3, race), evType: 5, slot: 1, payload: issued(1, 0, 'Track Limits') },
            { evClass: rawClass(3, race), evType: 5, slot: 1, payload: issued(3, 5, 'Speeding in pitlane') },
            { evClass: rawClass(1, race), evType: 10, slot: 1, payload: Buffer.from([2, 4, 0]) },
          ],
        },
        {
          sTime: 20.1, driverSlot: 1, x: 10, y: 0, z: 10,
          rawEvents: [{ evClass: rawClass(3, race), evType: 7, slot: 1, payload: Buffer.from([1]) }],
        },
        { sTime: 20.2, driverSlot: 1, x: 20, y: 0, z: 20 },
      ],
    }));
    const traj = extractReplayTrajectory(filePath, { driverSlot: 1, maxPoints: 0 });
    expect(traj.penalties).toEqual([
      { driverSlot: 1, driverName: 'Player Driver', timeSec: 20, penaltyText: 'Track Limits', penaltyType: 'Drive Thru', penaltySeconds: undefined, action: 'given' },
      { driverSlot: 1, driverName: 'Player Driver', timeSec: 20, penaltyText: 'Speeding in pitlane', penaltyType: 'Time', penaltySeconds: 10, action: 'given' },
      { driverSlot: 1, driverName: 'Player Driver', timeSec: 20.1, penaltyText: 'Served Drive Thru', penaltyType: 'Drive Thru', action: 'served' },
    ]);
    expect(traj.flagEvents).toEqual([expect.objectContaining({ flagState: 2, flagName: 'Double Yellow', sectorMask: 4, driverSlot: 1 })]);
  });
});
