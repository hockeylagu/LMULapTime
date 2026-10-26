import { describe, expect, it } from 'vitest';
import {
  defineStruct, SCORING, SCORING_BUFFER, SCORING_INFO, TELEMETRY, TELEMETRY_BUFFER, VEHICLE_SCORING, VEHICLE_TELEMETRY, WHEEL,
} from '../../../server/live/rf2Layout.js';

describe('rF2 shared memory layout', () => {
  it('computes the sizes the plugin publishes, so a shifted field cannot go unnoticed', () => {
    expect(WHEEL.size).toBe(260);
    expect(VEHICLE_TELEMETRY.size).toBe(1888);
    expect(VEHICLE_SCORING.size).toBe(584);
    expect(SCORING_INFO.size).toBe(548);
    expect(TELEMETRY_BUFFER.size).toBe(241680);
    expect(SCORING_BUFFER.size).toBe(75312);
  });

  it('places the fields the live reader uses', () => {
    expect(SCORING.info).toBe(12);
    expect(SCORING.vehicles).toBe(12 + 548);
    expect(SCORING_INFO.offsets.session).toBe(64);
    expect(SCORING_INFO.offsets.numVehicles).toBe(104);
    expect(SCORING_INFO.offsets.gamePhase).toBe(108);
    expect(SCORING_INFO.offsets.inRealtime).toBe(115);
    expect(VEHICLE_SCORING.offsets.isPlayer).toBe(4 + 32 + 64 + 4 + 11 * 8 + 4);
    expect(TELEMETRY.numVehicles).toBe(12);
    expect(TELEMETRY.vehicles).toBe(16);
    expect(VEHICLE_TELEMETRY.offsets.elapsedTime).toBe(12);
  });

  it('follows LMU InternalsPlugin.hpp past the rF2 fields: deltaBest before the battery, then LMU energy fields', () => {
    const at = VEHICLE_TELEMETRY.offsets;
    expect(at.deltaBest).toBe(696);
    expect(at.batteryChargeFraction).toBe(704);
    expect(at.electricBoostMotorState).toBe(744);
    expect(at.virtualEnergy).toBe(776);
    expect(at.wheels).toBe(848);
    expect(VEHICLE_SCORING.offsets.pitState).toBe(VEHICLE_SCORING.offsets.headlights + 1);
  });

  it('aligns to at most four bytes (Pack = 4) and rejects duplicate names', () => {
    const layout = defineStruct([['a', 'u8'], ['b', 'f64'], ['c', 'u16']]);
    expect(layout.offsets).toEqual({ a: 0, b: 4, c: 12 });
    expect(layout.size).toBe(16);
    expect(() => defineStruct([['a', 'u8'], ['a', 'u8']])).toThrow('Duplicate');
  });
});
