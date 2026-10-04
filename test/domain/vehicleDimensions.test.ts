import { describe, it, expect } from 'vitest';
import { defaultVehicleSize, DEFAULT_CLASS_VEHICLE_SIZES, UNKNOWN_VEHICLE_SIZE } from '../../shared/domain/vehicleDimensions.js';
import { VEHICLE_CLASS_OPTIONS } from '../../shared/domain/paceCategory.js';

describe('approximate vehicle class sizes', () => {
  it('covers every selectable racing class', () => {
    for (const option of VEHICLE_CLASS_OPTIONS.filter(o=>o.id !== 'All')) {
      expect(DEFAULT_CLASS_VEHICLE_SIZES[option.id]).toBeDefined();
      expect(defaultVehicleSize(option.id).lengthM).toBeGreaterThan(defaultVehicleSize(option.id).widthM);
    }
  });
  it('uses existing class aliases and a neutral fallback for unknown identity', () => {
    expect(defaultVehicleSize('Hyper')).toEqual(defaultVehicleSize('LMH'));
    expect(defaultVehicleSize('LMDh')).toEqual(defaultVehicleSize('LMH'));
    expect(defaultVehicleSize('GT3')).toEqual(defaultVehicleSize('LMGT3'));
    expect(defaultVehicleSize('LMP2_ELMS')).toEqual(defaultVehicleSize('LMP2elms'));
    expect(defaultVehicleSize()).toEqual(UNKNOWN_VEHICLE_SIZE);
    expect(defaultVehicleSize('Unrecognised')).toEqual(UNKNOWN_VEHICLE_SIZE);
  });
});
