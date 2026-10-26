import { describe, expect, it } from 'vitest';
import { DEFAULT_VEHICLE_HANDLING, resolveVehicleHandling } from '../../../shared/domain/vehicles/handling.js';
import type { VehicleDataRecord } from '../../../shared/types/dataPlugin.js';

const vehicle: VehicleDataRecord = { id: 'test', model: 'Test', carClass: 'GT3', vehicleIds: ['TEST'] };

describe('vehicle handling calibration', () => {
  it('retains approximate defaults without a plugin or with a legacy geometry-only record', () => {
    expect(resolveVehicleHandling()).toEqual(DEFAULT_VEHICLE_HANDLING);
    expect(resolveVehicleHandling({ ...vehicle, dimensions: { lengthM: 5, widthM: 2 } })).toEqual(DEFAULT_VEHICLE_HANDLING);
  });

  it('uses exact-car plugin defaults and falls back independently for unavailable fields', () => {
    expect(resolveVehicleHandling({ ...vehicle, handling: { wheelbaseM: 3.1 } })).toEqual({
      ...DEFAULT_VEHICLE_HANDLING, wheelbaseM: 3.1, wheelbaseSource: 'plugin',
    });
    expect(resolveVehicleHandling({ ...vehicle, handling: {
      wheelbaseM: 3.1, steeringRatio: 12, defaultSteeringWheelRangeDeg: 480, defaultSteeringLockDeg: 20,
    } })).toEqual({ wheelbaseM: 3.1, steeringRatio: 12, steeringWheelRangeDeg: 480,
      wheelbaseSource: 'plugin', steeringSource: 'plugin-default',
    });
    expect(resolveVehicleHandling({ ...vehicle, handling: { steeringRatio: 12 } }).steeringSource).toBe('fallback');
  });
});
