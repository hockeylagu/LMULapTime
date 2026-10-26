import type { VehicleDataRecord, VehicleHandlingCalibration } from '../../types/dataPlugin.js';

/** Historical approximate calibration, retained when no verified car data is installed. */
export const DEFAULT_VEHICLE_HANDLING: Readonly<VehicleHandlingCalibration> = {
  wheelbaseM: 2.7,
  steeringRatio: 11,
  steeringWheelRangeDeg: 540,
  wheelbaseSource: 'fallback',
  steeringSource: 'fallback',
};

export function resolveVehicleHandling(vehicle?: VehicleDataRecord): VehicleHandlingCalibration {
  const data = vehicle?.handling;
  const hasWheelbase = data?.wheelbaseM !== undefined;
  // Ratio and range form one calibration. Never combine one supplied value with a guessed other half.
  const hasSteering = data?.steeringRatio !== undefined && data.defaultSteeringWheelRangeDeg !== undefined;
  return {
    wheelbaseM: hasWheelbase ? data.wheelbaseM! : DEFAULT_VEHICLE_HANDLING.wheelbaseM,
    steeringRatio: hasSteering ? data.steeringRatio! : DEFAULT_VEHICLE_HANDLING.steeringRatio,
    steeringWheelRangeDeg: hasSteering ? data.defaultSteeringWheelRangeDeg! : DEFAULT_VEHICLE_HANDLING.steeringWheelRangeDeg,
    wheelbaseSource: hasWheelbase ? 'plugin' : 'fallback',
    steeringSource: hasSteering ? 'plugin-default' : 'fallback',
  };
}
