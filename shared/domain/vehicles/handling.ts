import type { SetupSteeringCalibration, VehicleDataRecord, VehicleHandlingCalibration } from '../../types/dataPlugin.js';

/** Historical approximate calibration, retained when no verified car data is installed. */
export const DEFAULT_VEHICLE_HANDLING: Readonly<VehicleHandlingCalibration> = {
  wheelbaseM: 2.7,
  steeringRatio: 11,
  steeringWheelRangeDeg: 540,
  wheelbaseSource: 'fallback',
  steeringSource: 'fallback',
};

/** The car's calibration; a run's own steering lock (`setup`, DuckDB laps) replaces the plugin's default steering. */
export function resolveVehicleHandling(vehicle?: VehicleDataRecord, setup?: SetupSteeringCalibration): VehicleHandlingCalibration {
  const data = vehicle?.handling;
  const hasWheelbase = data?.wheelbaseM !== undefined;
  // Ratio and range form one calibration. Never combine one supplied value with a guessed other half.
  const hasSteering = data?.steeringRatio !== undefined && data.defaultSteeringWheelRangeDeg !== undefined;
  const steering = setup
    ? { ...setup, steeringSource: 'setup' as const }
    : {
        steeringRatio: hasSteering ? data.steeringRatio! : DEFAULT_VEHICLE_HANDLING.steeringRatio,
        steeringWheelRangeDeg: hasSteering ? data.defaultSteeringWheelRangeDeg! : DEFAULT_VEHICLE_HANDLING.steeringWheelRangeDeg,
        steeringSource: hasSteering ? 'plugin-default' as const : 'fallback' as const,
      };
  return {
    wheelbaseM: hasWheelbase ? data.wheelbaseM! : DEFAULT_VEHICLE_HANDLING.wheelbaseM,
    wheelbaseSource: hasWheelbase ? 'plugin' : 'fallback',
    ...steering,
  };
}
