/**
 * Byte layout of the rFactor 2 shared memory plugin buffers (v3.x) with Pack = 4
 * (every member aligns to at most 4 bytes). A wrong or missing field shifts every later offset,
 * so the struct sizes are asserted against the plugin's published sizes in test/server/live/rf2Layout.test.ts.
 */

export type Rf2Primitive = 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'u32' | 'f32' | 'f64';

export interface StructLayout {
  readonly size: number;
  readonly align: number;
  /** Offset of each field from the start of the struct. */
  readonly offsets: Readonly<Record<string, number>>;
}

/** name, type (a primitive or a nested struct), element count for an array. */
type FieldSpec = readonly [name: string, type: Rf2Primitive | StructLayout, count?: number];

const PRIMITIVE_SIZE: Readonly<Record<Rf2Primitive, number>> = { i8: 1, u8: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, f64: 8 };
const MAX_PACK = 4;

const alignUp = (value: number, align: number): number => Math.ceil(value / align) * align;

export function defineStruct(fields: readonly FieldSpec[]): StructLayout {
  const offsets: Record<string, number> = {};
  let offset = 0;
  let structAlign = 1;
  for (const [name, type, count = 1] of fields) {
    if (name in offsets) throw new Error(`Duplicate field ${name}`);
    const size = typeof type === 'string' ? PRIMITIVE_SIZE[type] : type.size;
    const align = typeof type === 'string' ? Math.min(size, MAX_PACK) : type.align;
    offset = alignUp(offset, align);
    offsets[name] = offset;
    offset += size * count;
    structAlign = Math.max(structAlign, align);
  }
  return { size: alignUp(offset, structAlign), align: structAlign, offsets };
}

const bytes = (name: string, count: number): FieldSpec => [name, 'u8', count];
const doubles = (...names: string[]): FieldSpec[] => names.map(name => [name, 'f64'] as const);

export const VEC3 = defineStruct(doubles('x', 'y', 'z'));

export const WHEEL = defineStruct([
  ...doubles('suspensionDeflection', 'rideHeight', 'suspForce', 'brakeTemp', 'brakePressure',
    'rotation', 'lateralPatchVel', 'longitudinalPatchVel', 'lateralGroundVel', 'longitudinalGroundVel',
    'camber', 'lateralForce', 'longitudinalForce', 'tireLoad', 'gripFract', 'pressure'),
  ['temperature', 'f64', 3],
  ...doubles('wear'),
  bytes('terrainName', 16),
  ['surfaceType', 'u8'], ['flat', 'u8'], ['detached', 'u8'], ['staticUndeflectedRadius', 'u8'],
  ...doubles('verticalTireDeflection', 'wheelYLocation', 'toe', 'tireCarcassTemperature'),
  ['tireInnerLayerTemperature', 'f64', 3],
  bytes('expansion', 24),
]);

export const VEHICLE_TELEMETRY = defineStruct([
  ['id', 'i32'],
  ...doubles('deltaTime', 'elapsedTime'),
  ['lapNumber', 'i32'],
  ...doubles('lapStartET'),
  bytes('vehicleName', 64), bytes('trackName', 64),
  ['pos', VEC3], ['localVel', VEC3], ['localAccel', VEC3], ['ori', VEC3, 3], ['localRot', VEC3], ['localRotAccel', VEC3],
  ['gear', 'i32'],
  ...doubles('engineRPM', 'engineWaterTemp', 'engineOilTemp', 'clutchRPM',
    'unfilteredThrottle', 'unfilteredBrake', 'unfilteredSteering', 'unfilteredClutch',
    'filteredThrottle', 'filteredBrake', 'filteredSteering', 'filteredClutch',
    'steeringShaftTorque', 'front3rdDeflection', 'rear3rdDeflection',
    'frontWingHeight', 'frontRideHeight', 'rearRideHeight', 'drag', 'frontDownforce', 'rearDownforce',
    'fuel', 'engineMaxRPM'),
  ['scheduledStops', 'u8'], ['overheating', 'u8'], ['detached', 'u8'], ['headlights', 'u8'],
  bytes('dentSeverity', 8),
  ...doubles('lastImpactET', 'lastImpactMagnitude'),
  ['lastImpactPos', VEC3],
  ...doubles('engineTorque'),
  ['currentSector', 'i32'],
  ['speedLimiter', 'u8'], ['maxGears', 'u8'], ['frontTireCompoundIndex', 'u8'], ['rearTireCompoundIndex', 'u8'],
  ...doubles('fuelCapacity'),
  ['frontFlapActivated', 'u8'], ['rearFlapActivated', 'u8'], ['rearFlapLegalStatus', 'u8'], ['ignitionStarter', 'u8'],
  bytes('frontTireCompoundName', 18), bytes('rearTireCompoundName', 18),
  ['speedLimiterAvailable', 'u8'], ['antiStallActivated', 'u8'],
  bytes('unused', 2),
  ['visualSteeringWheelRange', 'f32'],
  ...doubles('rearBrakeBias', 'turboBoostPressure'),
  ['physicsToGraphicsOffset', 'f32', 3],
  ['physicalSteeringWheelRange', 'f32'],
  ...doubles('batteryChargeFraction', 'electricBoostMotorTorque', 'electricBoostMotorRPM',
    'electricBoostMotorTemperature', 'electricBoostWaterTemperature'),
  ['electricBoostMotorState', 'u8'],
  bytes('expansion', 111),
  ['wheels', WHEEL, 4],
]);

export const VEHICLE_SCORING = defineStruct([
  ['id', 'i32'],
  bytes('driverName', 32), bytes('vehicleName', 64),
  ['totalLaps', 'i16'], ['sector', 'i8'], ['finishStatus', 'i8'],
  ...doubles('lapDist', 'pathLateral', 'trackEdge',
    'bestSector1', 'bestSector2', 'bestLapTime', 'lastSector1', 'lastSector2', 'lastLapTime', 'curSector1', 'curSector2'),
  ['numPitstops', 'i16'], ['numPenalties', 'i16'],
  ['isPlayer', 'u8'], ['control', 'i8'], ['inPits', 'u8'], ['place', 'u8'],
  bytes('vehicleClass', 32),
  ...doubles('timeBehindNext'),
  ['lapsBehindNext', 'i32'],
  ...doubles('timeBehindLeader'),
  ['lapsBehindLeader', 'i32'],
  ...doubles('lapStartET'),
  ['pos', VEC3], ['localVel', VEC3], ['localAccel', VEC3], ['ori', VEC3, 3], ['localRot', VEC3], ['localRotAccel', VEC3],
  ['headlights', 'u8'], ['pitState', 'u8'], ['serverScored', 'u8'], ['individualPhase', 'u8'],
  ['qualification', 'i32'],
  ...doubles('timeIntoLap', 'estimatedLapTime'),
  bytes('pitGroup', 24),
  ['flag', 'u8'], ['underYellow', 'u8'], ['countLapFlag', 'u8'], ['inGarageStall', 'u8'],
  bytes('upgradePack', 16),
  ['pitLapDist', 'f32'], ['bestLapSector1', 'f32'], ['bestLapSector2', 'f32'],
  bytes('expansion', 48),
]);

export const SCORING_INFO = defineStruct([
  bytes('trackName', 64),
  ['session', 'i32'],
  ...doubles('currentET', 'endET'),
  ['maxLaps', 'i32'],
  ...doubles('lapDist'),
  bytes('pointer1', 8),
  ['numVehicles', 'i32'],
  ['gamePhase', 'u8'], ['yellowFlagState', 'i8'], ['sectorFlag', 'i8', 3],
  ['startLight', 'u8'], ['numRedLights', 'u8'], ['inRealtime', 'u8'],
  bytes('playerName', 32), bytes('plrFileName', 64),
  ...doubles('darkCloud', 'raining', 'ambientTemp', 'trackTemp'),
  ['wind', VEC3],
  ...doubles('minPathWetness', 'maxPathWetness'),
  ['gameMode', 'u8'], ['isPasswordProtected', 'u8'], ['serverPort', 'u16'], ['serverPublicIP', 'u32'], ['maxPlayers', 'i32'],
  bytes('serverName', 32),
  ['startET', 'f32'],
  ...doubles('avgPathWetness'),
  bytes('expansion', 200),
  bytes('pointer2', 8),
]);

export const MAX_MAPPED_VEHICLES = 128;

export const TELEMETRY_BUFFER = defineStruct([
  ['versionUpdateBegin', 'u32'], ['versionUpdateEnd', 'u32'], ['bytesUpdatedHint', 'i32'],
  ['numVehicles', 'i32'],
  ['vehicles', VEHICLE_TELEMETRY, MAX_MAPPED_VEHICLES],
]);

export const SCORING_BUFFER = defineStruct([
  ['versionUpdateBegin', 'u32'], ['versionUpdateEnd', 'u32'], ['bytesUpdatedHint', 'i32'],
  ['scoringInfo', SCORING_INFO],
  ['vehicles', VEHICLE_SCORING, MAX_MAPPED_VEHICLES],
]);

export const TELEMETRY_MAPPING_NAME = '$rFactor2SMMP_Telemetry$';
export const SCORING_MAPPING_NAME = '$rFactor2SMMP_Scoring$';

/** Absolute offsets inside the scoring buffer. */
export const SCORING = {
  versionBegin: SCORING_BUFFER.offsets.versionUpdateBegin,
  versionEnd: SCORING_BUFFER.offsets.versionUpdateEnd,
  info: SCORING_BUFFER.offsets.scoringInfo,
  vehicles: SCORING_BUFFER.offsets.vehicles,
  vehicleStride: VEHICLE_SCORING.size,
} as const;

/** Absolute offsets inside the telemetry buffer. */
export const TELEMETRY = {
  versionBegin: TELEMETRY_BUFFER.offsets.versionUpdateBegin,
  versionEnd: TELEMETRY_BUFFER.offsets.versionUpdateEnd,
  numVehicles: TELEMETRY_BUFFER.offsets.numVehicles,
  vehicles: TELEMETRY_BUFFER.offsets.vehicles,
  vehicleStride: VEHICLE_TELEMETRY.size,
} as const;
