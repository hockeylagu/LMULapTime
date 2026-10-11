import { describe, it, expect } from 'vitest';
import { defaultVehicleSize, DEFAULT_CLASS_VEHICLE_SIZES, UNKNOWN_VEHICLE_SIZE } from '../../shared/domain/vehicleDimensions.js';
import { VEHICLE_CLASS_OPTIONS } from '../../shared/domain/vehicleMapping.js';

describe('approximate vehicle class sizes', () => {
  it('covers every selectable racing class', () => {
    for (const option of VEHICLE_CLASS_OPTIONS.filter(o=>o.id !== 'All')) {
      expect(DEFAULT_CLASS_VEHICLE_SIZES[option.id]).toBeDefined();
      expect(defaultVehicleSize(option.id).lengthM).toBeGreaterThan(defaultVehicleSize(option.id).widthM);
    }
  });
  it('uses canonical classes and a neutral size for unknown identity', () => {
    expect(defaultVehicleSize('Hyper')).toEqual(DEFAULT_CLASS_VEHICLE_SIZES.Hyper);
    expect(defaultVehicleSize('LMH')).toEqual(UNKNOWN_VEHICLE_SIZE);
    expect(defaultVehicleSize()).toEqual(UNKNOWN_VEHICLE_SIZE);
    expect(defaultVehicleSize('Unrecognised')).toEqual(UNKNOWN_VEHICLE_SIZE);
  });
});
