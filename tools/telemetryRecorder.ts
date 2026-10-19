import fs from 'node:fs';
import path from 'node:path';
import { openMapping, type MappedBuffer } from '../server/live/sharedMemory.js';
import {
  MAX_MAPPED_VEHICLES,
  SCORING,
  SCORING_BUFFER,
  SCORING_INFO,
  SCORING_MAPPING_NAME,
  TELEMETRY,
  TELEMETRY_BUFFER,
  TELEMETRY_MAPPING_NAME,
  VEHICLE_SCORING,
  VEHICLE_TELEMETRY,
  WHEEL,
} from '../server/live/rf2Layout.js';

export interface Calibration {
  readonly offset: number;
  readonly stride: number;
  readonly sampleCount: number;
}

export interface CalibrationNameField {
  readonly offset: number;
  readonly length: number;
}

export function looksLikeName(buffer: Buffer, offset: number, maxLength: number): boolean {
  if (offset + maxLength > buffer.length) return false;
  let i = 0;
  for (; i < maxLength; i++) {
    const b = buffer[offset + i];
    if (b === 0) break;
    if (b < 32 || b > 126) return false;
  }
  if (i === 0 || i === maxLength) return false;
  for (let j = i; j < maxLength; j++) {
    if (buffer[offset + j] !== 0) return false;
  }
  return true;
}

export function detectCalibration(
  buffer: Buffer,
  idMax: number,
  nameFields: readonly CalibrationNameField[],
  minStride: number,
  maxStride: number,
  fallbackStride: number,
): Calibration | null {
  const limit = buffer.length - maxStride;
  const candidates: number[] = [];
  const probeEnd = Math.max(...nameFields.map(f => f.offset + f.length));

  for (let p = 0; p < limit; p += 4) {
    const id = buffer.readInt32LE(p);
    if (id < 0 || id > idMax) continue;

    let ok = true;
    for (const field of nameFields) {
      if (!looksLikeName(buffer, p + field.offset, field.length)) {
        ok = false;
        break;
      }
    }

    if (ok) {
      candidates.push(p);
      p += probeEnd - 4;
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { offset: candidates[0], stride: fallbackStride, sampleCount: 1 };
  }

  const deltas = new Map<number, number>();
  for (let i = 1; i < candidates.length; i++) {
    const delta = candidates[i] - candidates[i - 1];
    if (delta < minStride || delta > maxStride) continue;
    deltas.set(delta, (deltas.get(delta) ?? 0) + 1);
  }

  if (deltas.size === 0) {
    return { offset: candidates[0], stride: fallbackStride, sampleCount: candidates.length };
  }

  let bestStride = fallbackStride;
  let bestCount = -1;
  for (const [stride, count] of deltas) {
    if (count > bestCount) {
      bestCount = count;
      bestStride = stride;
    }
  }

  let first = candidates[0];
  for (const candidate of candidates) {
    const matching = candidates.filter(c => c >= candidate && (c - candidate) % bestStride === 0).length;
    if (matching >= 2) {
      first = candidate;
      break;
    }
  }

  return { offset: first, stride: bestStride, sampleCount: candidates.length };
}

export function detectTelemetryCalibration(buffer: Buffer): Calibration | null {
  return detectCalibration(
    buffer,
    100_000,
    [{ offset: 32, length: 64 }, { offset: 96, length: 64 }],
    600,
    6000,
    VEHICLE_TELEMETRY.size,
  );
}

export function detectScoringCalibration(buffer: Buffer): Calibration | null {
  return detectCalibration(
    buffer,
    100_000,
    [{ offset: 4, length: 32 }, { offset: 36, length: 64 }],
    300,
    2000,
    VEHICLE_SCORING.size,
  );
}

export function cString(buffer: Buffer, offset: number, length: number): string {
  const field = buffer.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.toString('utf8', 0, end < 0 ? length : end);
}

export function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?* ]/g, '-');
}

export function decodeScoringInfo(buf: Buffer, base = SCORING.info) {
  const at = SCORING_INFO.offsets;
  return {
    trackName: cString(buf, base + at.trackName, 64),
    session: buf.readInt32LE(base + at.session),
    currentEt: buf.readDoubleLE(base + at.currentET),
    endEt: buf.readDoubleLE(base + at.endET),
    maxLaps: buf.readInt32LE(base + at.maxLaps),
    lapDist: buf.readDoubleLE(base + at.lapDist),
    numVehicles: buf.readInt32LE(base + at.numVehicles),
    gamePhase: buf.readUInt8(base + at.gamePhase),
    yellowFlagState: buf.readInt8(base + at.yellowFlagState),
    startLight: buf.readUInt8(base + at.startLight),
    numRedLights: buf.readUInt8(base + at.numRedLights),
    inRealtime: buf.readUInt8(base + at.inRealtime),
    playerName: cString(buf, base + at.playerName, 32),
    plrFileName: cString(buf, base + at.plrFileName, 64),
    ambientTemp: buf.readDoubleLE(base + at.ambientTemp),
    trackTemp: buf.readDoubleLE(base + at.trackTemp),
    raining: buf.readDoubleLE(base + at.raining),
    wind: {
      x: buf.readDoubleLE(base + at.wind),
      y: buf.readDoubleLE(base + at.wind + 8),
      z: buf.readDoubleLE(base + at.wind + 16),
    },
    minPathWetness: buf.readDoubleLE(base + at.minPathWetness),
    maxPathWetness: buf.readDoubleLE(base + at.maxPathWetness),
    avgPathWetness: buf.readDoubleLE(base + at.avgPathWetness),
  };
}

export function decodeScoringVehicle(buf: Buffer, base: number) {
  const at = VEHICLE_SCORING.offsets;
  return {
    id: buf.readInt32LE(base + at.id),
    driver: cString(buf, base + at.driverName, 32),
    vehicleName: cString(buf, base + at.vehicleName, 64),
    vehicleClass: cString(buf, base + at.vehicleClass, 32),
    isPlayer: buf.readUInt8(base + at.isPlayer) !== 0,
    control: buf.readInt8(base + at.control),
    lap: buf.readInt16LE(base + at.totalLaps),
    sector: buf.readInt8(base + at.sector),
    lapDist: buf.readDoubleLE(base + at.lapDist),
    pathLateral: buf.readDoubleLE(base + at.pathLateral),
    trackEdge: buf.readDoubleLE(base + at.trackEdge),
    x: buf.readDoubleLE(base + at.pos),
    y: buf.readDoubleLE(base + at.pos + 8),
    z: buf.readDoubleLE(base + at.pos + 16),
    inPits: buf.readUInt8(base + at.inPits) !== 0,
    inGarage: buf.readUInt8(base + at.inGarageStall) !== 0,
    place: buf.readUInt8(base + at.place),
    timeIntoLap: buf.readDoubleLE(base + at.timeIntoLap),
    lastLap: buf.readDoubleLE(base + at.lastLapTime),
    bestLap: buf.readDoubleLE(base + at.bestLapTime),
    upgradePackHex: buf.subarray(base + at.upgradePack, base + at.upgradePack + 16).toString('hex').toUpperCase(),
    pitGroupHex: buf.subarray(base + at.pitGroup, base + at.pitGroup + 24).toString('hex').toUpperCase(),
  };
}

export function decodeWheel(buf: Buffer, base: number) {
  const at = WHEEL.offsets;
  return {
    terrain: cString(buf, base + at.terrainName, 16),
    surface: buf.readUInt8(base + at.surfaceType),
    brakeTempC: buf.readDoubleLE(base + at.brakeTemp) - 273.15,
    brakePressure: buf.readDoubleLE(base + at.brakePressure),
    tempC: [
      buf.readDoubleLE(base + at.temperature) - 273.15,
      buf.readDoubleLE(base + at.temperature + 8) - 273.15,
      buf.readDoubleLE(base + at.temperature + 16) - 273.15,
    ],
    carcassTempC: buf.readDoubleLE(base + at.tireCarcassTemperature) - 273.15,
    pressure: buf.readDoubleLE(base + at.pressure),
    wear: buf.readDoubleLE(base + at.wear),
    load: buf.readDoubleLE(base + at.tireLoad),
    grip: buf.readDoubleLE(base + at.gripFract),
    rideHeight: buf.readDoubleLE(base + at.rideHeight),
    deflection: buf.readDoubleLE(base + at.verticalTireDeflection),
    suspDeflection: buf.readDoubleLE(base + at.suspensionDeflection),
    rotation: buf.readDoubleLE(base + at.rotation),
    camber: buf.readDoubleLE(base + at.camber),
    lateralForce: buf.readDoubleLE(base + at.lateralForce),
    longitudinalForce: buf.readDoubleLE(base + at.longitudinalForce),
    lateralPatchVel: buf.readDoubleLE(base + at.lateralPatchVel),
    longitudinalPatchVel: buf.readDoubleLE(base + at.longitudinalPatchVel),
    lateralGroundVel: buf.readDoubleLE(base + at.lateralGroundVel),
    longitudinalGroundVel: buf.readDoubleLE(base + at.longitudinalGroundVel),
    toe: buf.readDoubleLE(base + at.toe),
    flat: buf.readUInt8(base + at.flat),
    detached: buf.readUInt8(base + at.detached),
  };
}

export function decodeTelemetryVehicle(buf: Buffer, base: number) {
  const at = VEHICLE_TELEMETRY.offsets;
  const vx = buf.readDoubleLE(base + at.localVel);
  const vy = buf.readDoubleLE(base + at.localVel + 8);
  const vz = buf.readDoubleLE(base + at.localVel + 16);
  const speedKmh = Math.sqrt(vx * vx + vy * vy + vz * vz) * 3.6;

  const ori0x = buf.readDoubleLE(base + at.ori);
  const ori0y = buf.readDoubleLE(base + at.ori + 8);
  const ori0z = buf.readDoubleLE(base + at.ori + 16);
  const ori1x = buf.readDoubleLE(base + at.ori + 24);
  const ori1y = buf.readDoubleLE(base + at.ori + 32);
  const ori1z = buf.readDoubleLE(base + at.ori + 40);
  const ori2x = buf.readDoubleLE(base + at.ori + 48);
  const ori2y = buf.readDoubleLE(base + at.ori + 56);
  const ori2z = buf.readDoubleLE(base + at.ori + 64);

  const yaw = Math.atan2(ori2x, ori2z);
  const pitch = Math.atan2(-ori2y, Math.sqrt(ori2x * ori2x + ori2z * ori2z));
  const roll = Math.atan2(ori0y, Math.sqrt(ori0x * ori0x + ori0z * ori0z));

  const wheels: ReturnType<typeof decodeWheel>[] = [];
  for (let w = 0; w < 4; w++) {
    wheels.push(decodeWheel(buf, base + at.wheels + w * WHEEL.size));
  }

  return {
    id: buf.readInt32LE(base + at.id),
    dt: buf.readDoubleLE(base + at.deltaTime),
    et: buf.readDoubleLE(base + at.elapsedTime),
    lap: buf.readInt32LE(base + at.lapNumber),
    lapStartEt: buf.readDoubleLE(base + at.lapStartET),
    vehicleName: cString(buf, base + at.vehicleName, 64),
    trackName: cString(buf, base + at.trackName, 64),
    pos: {
      x: buf.readDoubleLE(base + at.pos),
      y: buf.readDoubleLE(base + at.pos + 8),
      z: buf.readDoubleLE(base + at.pos + 16),
    },
    localVel: { x: vx, y: vy, z: vz },
    localAccel: {
      x: buf.readDoubleLE(base + at.localAccel),
      y: buf.readDoubleLE(base + at.localAccel + 8),
      z: buf.readDoubleLE(base + at.localAccel + 16),
    },
    ori: [ori0x, ori0y, ori0z, ori1x, ori1y, ori1z, ori2x, ori2y, ori2z],
    yaw,
    pitch,
    roll,
    localRot: {
      x: buf.readDoubleLE(base + at.localRot),
      y: buf.readDoubleLE(base + at.localRot + 8),
      z: buf.readDoubleLE(base + at.localRot + 16),
    },
    localRotAccel: {
      x: buf.readDoubleLE(base + at.localRotAccel),
      y: buf.readDoubleLE(base + at.localRotAccel + 8),
      z: buf.readDoubleLE(base + at.localRotAccel + 16),
    },
    gear: buf.readInt32LE(base + at.gear),
    rpm: buf.readDoubleLE(base + at.engineRPM),
    waterTempC: buf.readDoubleLE(base + at.engineWaterTemp),
    oilTempC: buf.readDoubleLE(base + at.engineOilTemp),
    clutchRpm: buf.readDoubleLE(base + at.clutchRPM),
    unfilteredThrottle: buf.readDoubleLE(base + at.unfilteredThrottle),
    unfilteredBrake: buf.readDoubleLE(base + at.unfilteredBrake),
    unfilteredSteering: buf.readDoubleLE(base + at.unfilteredSteering),
    unfilteredClutch: buf.readDoubleLE(base + at.unfilteredClutch),
    filteredThrottle: buf.readDoubleLE(base + at.filteredThrottle),
    filteredBrake: buf.readDoubleLE(base + at.filteredBrake),
    filteredSteering: buf.readDoubleLE(base + at.filteredSteering),
    filteredClutch: buf.readDoubleLE(base + at.filteredClutch),
    steeringShaftTorque: buf.readDoubleLE(base + at.steeringShaftTorque),
    frontWingHeight: buf.readDoubleLE(base + at.frontWingHeight),
    frontRideHeight: buf.readDoubleLE(base + at.frontRideHeight),
    rearRideHeight: buf.readDoubleLE(base + at.rearRideHeight),
    drag: buf.readDoubleLE(base + at.drag),
    frontDownforce: buf.readDoubleLE(base + at.frontDownforce),
    rearDownforce: buf.readDoubleLE(base + at.rearDownforce),
    fuel: buf.readDoubleLE(base + at.fuel),
    maxRpm: buf.readDoubleLE(base + at.engineMaxRPM),
    overheating: buf.readUInt8(base + at.overheating),
    detached: buf.readUInt8(base + at.detached),
    headlights: buf.readUInt8(base + at.headlights),
    dentSeverity: buf.subarray(base + at.dentSeverity, base + at.dentSeverity + 8),
    lastImpactEt: buf.readDoubleLE(base + at.lastImpactET),
    lastImpactMag: buf.readDoubleLE(base + at.lastImpactMagnitude),
    engineTorque: buf.readDoubleLE(base + at.engineTorque),
    currentSector: buf.readInt32LE(base + at.currentSector),
    speedLimiter: buf.readUInt8(base + at.speedLimiter),
    frontTireCompoundIndex: buf.readUInt8(base + at.frontTireCompoundIndex),
    rearTireCompoundIndex: buf.readUInt8(base + at.rearTireCompoundIndex),
    fuelCapacity: buf.readDoubleLE(base + at.fuelCapacity),
    frontFlapActivated: buf.readUInt8(base + at.frontFlapActivated),
    rearFlapActivated: buf.readUInt8(base + at.rearFlapActivated),
    rearFlapLegalStatus: buf.readUInt8(base + at.rearFlapLegalStatus),
    ignitionStarter: buf.readUInt8(base + at.ignitionStarter),
    frontTireCompoundName: cString(buf, base + at.frontTireCompoundName, 18),
    rearTireCompoundName: cString(buf, base + at.rearTireCompoundName, 18),
    rearBrakeBias: buf.readDoubleLE(base + at.rearBrakeBias),
    turboBoostPressure: buf.readDoubleLE(base + at.turboBoostPressure),
    physicalSteeringWheelRange: buf.readFloatLE(base + at.physicalSteeringWheelRange),
    batteryChargeFraction: buf.readDoubleLE(base + at.batteryChargeFraction),
    electricBoostMotorTorque: buf.readDoubleLE(base + at.electricBoostMotorTorque),
    electricBoostMotorRpm: buf.readDoubleLE(base + at.electricBoostMotorRPM),
    electricBoostMotorTemperature: buf.readDoubleLE(base + at.electricBoostMotorTemperature),
    electricBoostWaterTemperature: buf.readDoubleLE(base + at.electricBoostWaterTemperature),
    electricBoostMotorState: buf.readUInt8(base + at.electricBoostMotorState),
    speedKmh,
    wheels,
  };
}

export function formatMetaRecord(
  info: ReturnType<typeof decodeScoringInfo>,
  trackName: string,
  telCal: Calibration | null,
  scoCal: Calibration,
  recordedAt = new Date().toISOString(),
) {
  return JSON.stringify({
    t: 'meta',
    recordedAt,
    track: trackName,
    trackLengthM: round(info.lapDist, 3),
    player: info.playerName,
    session: info.session,
    ambientTempC: round(info.ambientTemp, 2),
    trackTempC: round(info.trackTemp, 2),
    raining: round(info.raining, 4),
    windX: round(info.wind.x, 3),
    windY: round(info.wind.y, 3),
    windZ: round(info.wind.z, 3),
    minPathWetness: round(info.minPathWetness, 4),
    maxPathWetness: round(info.maxPathWetness, 4),
    avgPathWetness: round(info.avgPathWetness, 4),
    telemetryVehicleOffset: telCal?.offset ?? null,
    telemetryVehicleStride: telCal?.stride ?? null,
    scoringOnly: telCal === null,
    scoringVehicleOffset: scoCal.offset,
    scoringVehicleStride: scoCal.stride,
  });
}

export function formatScoringRecord(
  info: ReturnType<typeof decodeScoringInfo>,
  vehicles: Array<ReturnType<typeof decodeScoringVehicle>>,
) {
  return JSON.stringify({
    t: 'sco',
    et: round(info.currentEt, 3),
    phase: info.gamePhase,
    inRealtime: info.inRealtime !== 0,
    yellow: info.yellowFlagState,
    startLight: info.startLight,
    numRedLights: info.numRedLights,
    trackTempC: round(info.trackTemp, 2),
    raining: round(info.raining, 4),
    windX: round(info.wind.x, 3),
    windY: round(info.wind.y, 3),
    windZ: round(info.wind.z, 3),
    minPathWetness: round(info.minPathWetness, 4),
    maxPathWetness: round(info.maxPathWetness, 4),
    avgPathWetness: round(info.avgPathWetness, 4),
    veh: vehicles.map(v => ({
      id: v.id,
      driver: v.driver,
      vehicleClass: v.vehicleClass,
      isPlayer: v.isPlayer,
      control: v.control,
      lap: v.lap,
      sector: v.sector,
      lapDist: round(v.lapDist, 3),
      pathLateral: round(v.pathLateral, 3),
      trackEdge: round(v.trackEdge, 3),
      x: round(v.x, 3),
      y: round(v.y, 3),
      z: round(v.z, 3),
      inPits: v.inPits,
      inGarage: v.inGarage,
      place: v.place,
      timeIntoLap: round(v.timeIntoLap, 3),
      lastLap: round(v.lastLap, 3),
      bestLap: round(v.bestLap, 3),
      upgradePackHex: v.upgradePackHex,
      pitGroupHex: v.pitGroupHex,
    })),
  });
}

export function formatTelemetryRecord(t: ReturnType<typeof decodeTelemetryVehicle>) {
  return JSON.stringify({
    t: 'tel',
    et: round(t.et, 4),
    dt: round(t.dt, 5),
    lap: t.lap,
    lapStartEt: round(t.lapStartEt, 4),
    sector: t.currentSector,

    gear: t.gear,
    rpm: round(t.rpm, 2),
    maxRpm: round(t.maxRpm, 2),
    torque: round(t.engineTorque, 3),
    fuel: round(t.fuel, 4),
    fuelCapacity: round(t.fuelCapacity, 3),
    waterTempC: round(t.waterTempC, 3),
    oilTempC: round(t.oilTempC, 3),
    turboBoost: round(t.turboBoostPressure, 3),
    rearBrakeBias: round(t.rearBrakeBias, 4),
    frontTireCompoundIndex: t.frontTireCompoundIndex,
    rearTireCompoundIndex: t.rearTireCompoundIndex,
    frontTireCompoundName: t.frontTireCompoundName,
    rearTireCompoundName: t.rearTireCompoundName,
    speedKmh: round(t.speedKmh, 4),

    batteryCharge: round(t.batteryChargeFraction, 5),
    boostTorque: round(t.electricBoostMotorTorque, 3),
    boostRpm: round(t.electricBoostMotorRpm, 2),
    boostMotorTempC: round(t.electricBoostMotorTemperature, 3),
    boostWaterTempC: round(t.electricBoostWaterTemperature, 3),
    boostState: t.electricBoostMotorState,

    thr: round(t.unfilteredThrottle, 5),
    brk: round(t.unfilteredBrake, 5),
    str: round(t.unfilteredSteering, 5),
    clu: round(t.unfilteredClutch, 5),
    fThr: round(t.filteredThrottle, 5),
    fBrk: round(t.filteredBrake, 5),
    fStr: round(t.filteredSteering, 5),
    steerTorque: round(t.steeringShaftTorque, 4),
    steerRangeDeg: round(t.physicalSteeringWheelRange, 2),

    x: round(t.pos.x, 4),
    y: round(t.pos.y, 4),
    z: round(t.pos.z, 4),
    vx: round(t.localVel.x, 4),
    vy: round(t.localVel.y, 4),
    vz: round(t.localVel.z, 4),
    ax: round(t.localAccel.x, 4),
    ay: round(t.localAccel.y, 4),
    az: round(t.localAccel.z, 4),
    yaw: round(t.yaw, 5),
    pitch: round(t.pitch, 5),
    roll: round(t.roll, 5),
    ori: t.ori.map(val => round(val, 5)),
    rotX: round(t.localRot.x, 5),
    rotY: round(t.localRot.y, 5),
    rotZ: round(t.localRot.z, 5),
    rotAccelX: round(t.localRotAccel.x, 5),
    rotAccelY: round(t.localRotAccel.y, 5),
    rotAccelZ: round(t.localRotAccel.z, 5),
    frontWingHeight: round(t.frontWingHeight, 4),
    rearRideHeight: round(t.rearRideHeight, 4),
    frontRideHeight: round(t.frontRideHeight, 4),

    limiter: t.speedLimiter,
    ignition: t.ignitionStarter,
    headlights: t.headlights,
    frontFlap: t.frontFlapActivated,
    rearFlap: t.rearFlapActivated,
    rearFlapLegal: t.rearFlapLegalStatus,
    detached: t.detached,
    overheating: t.overheating,
    dents: Buffer.from(t.dentSeverity).toString('base64'),
    lastImpactEt: round(t.lastImpactEt, 3),
    lastImpactMag: round(t.lastImpactMag, 3),
    frontDownforce: round(t.frontDownforce, 3),
    rearDownforce: round(t.rearDownforce, 3),
    drag: round(t.drag, 3),

    wheels: t.wheels.map(w => ({
      terrain: w.terrain,
      surface: w.surface,
      brakeTempC: round(w.brakeTempC, 3),
      brakePressure: round(w.brakePressure, 3),
      tempC: [round(w.tempC[0], 3), round(w.tempC[1], 3), round(w.tempC[2], 3)],
      carcassTempC: round(w.carcassTempC, 3),
      pressure: round(w.pressure, 3),
      wear: round(w.wear, 6),
      load: round(w.load, 2),
      grip: round(w.grip, 5),
      rideHeight: round(w.rideHeight, 5),
      deflection: round(w.deflection, 5),
      suspDeflection: round(w.suspDeflection, 5),
      rotation: round(w.rotation, 4),
      camber: round(w.camber, 5),
      lateralForce: round(w.lateralForce, 3),
      longitudinalForce: round(w.longitudinalForce, 3),
      lateralPatchVel: round(w.lateralPatchVel, 4),
      longitudinalPatchVel: round(w.longitudinalPatchVel, 4),
      lateralGroundVel: round(w.lateralGroundVel, 4),
      longitudinalGroundVel: round(w.longitudinalGroundVel, 4),
      toe: round(w.toe, 5),
      flat: w.flat,
      detached: w.detached,
    })),
  });
}

export function tryReadCoherent<T>(
  source: MappedBuffer,
  versionBeginOffset: number,
  versionEndOffset: number,
  extract: (buffer: Buffer) => T,
  readOffset: number,
  readLength: number,
  maxAttempts = 16,
): { ok: true; value: T; version: number } | { ok: false } {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const begin = source.readU32(versionBeginOffset);
    if (source.readU32(versionEndOffset) !== begin) continue;

    const data = source.read(readOffset, readLength);
    if (source.readU32(versionEndOffset) === begin && source.readU32(versionBeginOffset) === begin) {
      return { ok: true, value: extract(data), version: begin };
    }
  }
  return { ok: false };
}

export function openSharedBuffer(name: string, size: number): MappedBuffer | null {
  return openMapping(name, size) ?? openMapping(`Global\\${name}`, size);
}

function dumpStrings(label: string, buffer: Buffer, max = 60): void {
  console.log(`ASCII strings in ${label} buffer (offset : length : text):`);
  let shown = 0;
  for (let i = 0; i < buffer.length && shown < max; i++) {
    const b = buffer[i];
    if (b < 32 || b > 126) continue;
    const start = i;
    while (i < buffer.length && buffer[i] >= 32 && buffer[i] <= 126) i++;
    const length = i - start;
    if (length < 3) continue;

    const text = buffer.subarray(start, Math.min(start + length, start + 48)).toString('ascii');
    console.log(`  ${start.toString().padStart(8)} : ${length.toString().padStart(3)} : ${text}`);
    shown++;
  }
  if (shown === 0) {
    console.log('  <none - buffer looks empty, so no session is loaded>');
  } else if (shown === max) {
    console.log(`  ... (truncated at ${max})`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDump(): Promise<number> {
  const telemetry = openSharedBuffer(TELEMETRY_MAPPING_NAME, TELEMETRY_BUFFER.size);
  const scoring = openSharedBuffer(SCORING_MAPPING_NAME, SCORING_BUFFER.size);

  if (!telemetry || !scoring) {
    console.error('Failed to open rFactor 2 shared memory mappings. Is Le Mans Ultimate running?');
    telemetry?.close();
    scoring?.close();
    return 1;
  }

  try {
    console.log(`struct sizes: Rf2Telemetry ${TELEMETRY_BUFFER.size}  Rf2Scoring ${SCORING_BUFFER.size}`);
    console.log(`              Rf2VehicleTelemetry ${VEHICLE_TELEMETRY.size}  Rf2Wheel ${WHEEL.size}`);
    console.log(`              Rf2VehicleScoring ${VEHICLE_SCORING.size}  Rf2ScoringInfo ${SCORING_INFO.size}\n`);

    const telBegin = telemetry.readU32(TELEMETRY.versionBegin);
    const telEnd = telemetry.readU32(TELEMETRY.versionEnd);
    const scoBegin = scoring.readU32(SCORING.versionBegin);
    const scoEnd = scoring.readU32(SCORING.versionEnd);

    console.log(`telemetry capacity ${telemetry.size} (${(telemetry.size / 4096).toFixed(2)} pages), version ${telBegin}/${telEnd}`);
    console.log(`scoring   capacity ${scoring.size} (${(scoring.size / 4096).toFixed(2)} pages), version ${scoBegin}/${scoEnd}\n`);

    const scoRead = tryReadCoherent(
      scoring,
      SCORING.versionBegin,
      SCORING.versionEnd,
      buf => decodeScoringInfo(buf, 0),
      SCORING.info,
      SCORING_INFO.size,
    );

    if (scoRead.ok) {
      const info = scoRead.value;
      console.log('ScoringInfo as decoded by our struct:');
      console.log(`  trackName    '${info.trackName}'`);
      console.log(`  session      ${info.session}   gamePhase ${info.gamePhase}   inRealtime ${info.inRealtime}`);
      console.log(`  currentET    ${info.currentEt.toFixed(3)}   endET ${info.endEt.toFixed(1)}   maxLaps ${info.maxLaps}`);
      console.log(`  lapDist      ${info.lapDist.toFixed(2)} m   numVehicles ${info.numVehicles}`);
      console.log(`  playerName   '${info.playerName}'`);
      console.log(`  plrFileName  '${info.plrFileName}'`);
      console.log(`  ambient ${info.ambientTemp.toFixed(1)}C  track ${info.trackTemp.toFixed(1)}C  raining ${info.raining.toFixed(3)}\n`);
    }

    dumpStrings('scoring', scoring.read(0, scoring.size), 60);
    console.log();
    dumpStrings('telemetry', telemetry.read(0, telemetry.size), 60);

    return 0;
  } finally {
    telemetry.close();
    scoring.close();
  }
}

async function runProbe(): Promise<number> {
  console.log('Waiting for Le Mans Ultimate... (Ctrl+C to quit)');
  let telemetry: MappedBuffer | null = null;
  let scoring: MappedBuffer | null = null;

  while (!telemetry || !scoring) {
    telemetry?.close();
    scoring?.close();
    telemetry = openSharedBuffer(TELEMETRY_MAPPING_NAME, TELEMETRY_BUFFER.size);
    scoring = openSharedBuffer(SCORING_MAPPING_NAME, SCORING_BUFFER.size);
    if (!telemetry || !scoring) await sleep(1000);
  }

  console.log('\rConnected to Le Mans Ultimate.                    ');
  console.log(`telemetry buffer '${TELEMETRY_MAPPING_NAME}' capacity ${telemetry.size} bytes`);
  console.log(`scoring   buffer '${SCORING_MAPPING_NAME}' capacity ${scoring.size} bytes\n`);

  try {
    const telBuf = telemetry.read(0, telemetry.size);
    const scoBuf = scoring.read(0, scoring.size);
    const telCal = detectTelemetryCalibration(telBuf);
    const scoCal = detectScoringCalibration(scoBuf);

    console.log('Vehicle array layout (detected by signature scan vs. our struct definitions):');
    console.log(`  telemetry  detected ${describeCal(telCal)}   struct offset ${TELEMETRY.vehicles} stride ${TELEMETRY.vehicleStride}`);
    console.log(`  scoring    detected ${describeCal(scoCal)}   struct offset ${SCORING.vehicles} stride ${SCORING.vehicleStride}\n`);

    console.log('Watching. Ctrl+C to stop. Sanity-check that speed/rpm/gear/lapDist move');
    console.log('while driving, and note whether the version counters advance in a replay.\n');

    let lastTelVersion = 0;
    let lastScoVersion = 0;

    let stop = false;
    process.on('SIGINT', () => { stop = true; });

    while (!stop) {
      const telVersion = telemetry.readU32(TELEMETRY.versionEnd);
      const scoVersion = scoring.readU32(SCORING.versionEnd);

      const scoRead = tryReadCoherent(
        scoring,
        SCORING.versionBegin,
        SCORING.versionEnd,
        buf => {
          const info = decodeScoringInfo(buf, SCORING.info);
          const count = Math.min(info.numVehicles, MAX_MAPPED_VEHICLES);
          const activeScoCal = scoCal ?? { offset: SCORING.vehicles, stride: SCORING.vehicleStride, sampleCount: 1 };
          let playerVehicle: ReturnType<typeof decodeScoringVehicle> | null = null;
          for (let i = 0; i < count; i++) {
            const v = decodeScoringVehicle(buf, activeScoCal.offset + i * activeScoCal.stride);
            if (v.isPlayer || v.control === 0) {
              playerVehicle = v;
              break;
            }
          }
          return { info, playerVehicle };
        },
        0,
        scoring.size,
      );

      if (scoRead.ok) {
        const { info, playerVehicle } = scoRead.value;
        let telVehicle: ReturnType<typeof decodeTelemetryVehicle> | null = null;

        if (playerVehicle) {
          const activeTelCal = telCal ?? { offset: TELEMETRY.vehicles, stride: TELEMETRY.vehicleStride, sampleCount: 1 };
          const telRead = tryReadCoherent(
            telemetry,
            TELEMETRY.versionBegin,
            TELEMETRY.versionEnd,
            buf => {
              const count = Math.min(buf.readInt32LE(TELEMETRY.numVehicles), MAX_MAPPED_VEHICLES);
              for (let i = 0; i < count; i++) {
                const tv = decodeTelemetryVehicle(buf, activeTelCal.offset + i * activeTelCal.stride);
                if (tv.id === playerVehicle.id) return tv;
              }
              return null;
            },
            0,
            telemetry.size,
          );
          if (telRead.ok) telVehicle = telRead.value;
        }

        const now = new Date().toTimeString().split(' ')[0];
        console.log(`--- ${now}`);
        console.log(`  ticks/s      tel ${(telVersion - lastTelVersion).toString().padStart(5)}   sco ${(scoVersion - lastScoVersion).toString().padStart(5)}`);
        console.log(`  track        '${info.trackName}'  len ${info.lapDist.toFixed(1)} m  cars ${info.numVehicles}`);
        console.log(`  session      type ${info.session}  phase ${info.gamePhase}  inRealtime ${info.inRealtime}  ET ${info.currentEt.toFixed(2)}`);
        if (playerVehicle) {
          console.log(`  player       '${playerVehicle.driver}'  id ${playerVehicle.id}  place ${playerVehicle.place}`);
          console.log(`  scoring geom lapDist ${playerVehicle.lapDist.toFixed(2)}  pathLateral ${playerVehicle.pathLateral.toFixed(2)}  trackEdge ${playerVehicle.trackEdge.toFixed(2)}`);
          console.log(`  scoring pos  ${playerVehicle.x.toFixed(2)} ${playerVehicle.y.toFixed(2)} ${playerVehicle.z.toFixed(2)}`);
        }
        if (telVehicle) {
          console.log(`  telemetry    ET ${telVehicle.et.toFixed(3)}  lap ${telVehicle.lap}  gear ${telVehicle.gear}  rpm ${telVehicle.rpm.toFixed(0)}/${telVehicle.maxRpm.toFixed(0)}  speed ${telVehicle.speedKmh.toFixed(1)} km/h  fuel ${telVehicle.fuel.toFixed(2)}`);
          console.log(`  inputs       thr ${telVehicle.unfilteredThrottle.toFixed(2)}  brk ${telVehicle.unfilteredBrake.toFixed(2)}  steer ${telVehicle.unfilteredSteering.toFixed(2)}`);
          const wheelStr = telVehicle.wheels.map(w => `${w.terrain}(${w.surface})`).join(' | ');
          console.log(`  terrain      ${wheelStr}`);
        } else {
          console.log('  telemetry    <no telemetry for player>');
        }
      }

      lastTelVersion = telVersion;
      lastScoVersion = scoVersion;
      await sleep(1000);
    }

    return 0;
  } finally {
    telemetry.close();
    scoring.close();
  }
}

function describeCal(cal: Calibration | null): string {
  return cal ? `offset ${cal.offset} stride ${cal.stride} (${cal.sampleCount} entries)` : '<not found>';
}

async function runRecord(args: string[]): Promise<number> {
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 && outIdx + 1 < args.length ? args[outIdx + 1] : path.join('test', 'fixtures', 'telemetry');
  const secIdx = args.indexOf('--seconds');
  const seconds = secIdx >= 0 && secIdx + 1 < args.length ? parseFloat(args[secIdx + 1]) : 0;

  console.log('Waiting for Le Mans Ultimate... (Ctrl+C to quit)');
  let telemetry: MappedBuffer | null = null;
  let scoring: MappedBuffer | null = null;

  let stop = false;
  process.on('SIGINT', () => { stop = true; });

  while (!stop && (!telemetry || !scoring)) {
    telemetry?.close();
    scoring?.close();
    telemetry = openSharedBuffer(TELEMETRY_MAPPING_NAME, TELEMETRY_BUFFER.size);
    scoring = openSharedBuffer(SCORING_MAPPING_NAME, SCORING_BUFFER.size);
    if (!telemetry || !scoring) await sleep(1000);
  }

  if (stop || !telemetry || !scoring) {
    telemetry?.close();
    scoring?.close();
    return 1;
  }

  console.log('Connected to Le Mans Ultimate.');

  try {
    let scoCal: Calibration | null = null;
    let telCal: Calibration | null = null;

    while (!stop && !scoCal) {
      const scoBuf = scoring.read(0, scoring.size);
      scoCal = detectScoringCalibration(scoBuf);
      if (!scoCal) await sleep(1000);
    }

    if (stop || !scoCal) return 1;

    const telBuf = telemetry.read(0, telemetry.size);
    telCal = detectTelemetryCalibration(telBuf);

    console.log(`Layout: scoring ${describeCal(scoCal)}`);
    if (!telCal) {
      console.log('No telemetry buffer - scoring-only mode (expected in replay).');
    } else {
      console.log(`        telemetry ${describeCal(telCal)}`);
    }

    fs.mkdirSync(outDir, { recursive: true });

    let stream: fs.WriteStream | null = null;
    let telemetryCount = 0;
    let scoringCount = 0;
    let tornReads = 0;
    let lastTelemetryEt = Number.NaN;
    let lastScoringEt = Number.NaN;
    let playerId = -1;
    const startTime = Date.now();

    console.log('Waiting for a session... drive out of the garage to start recording. Ctrl+C to stop.');

    const activeScoCal = scoCal;
    const activeTelCal = telCal;

    while (!stop && (seconds <= 0 || (Date.now() - startTime) / 1000 < seconds)) {
      const scoRead = tryReadCoherent(
        scoring,
        SCORING.versionBegin,
        SCORING.versionEnd,
        buf => {
          const info = decodeScoringInfo(buf, SCORING.info);
          const count = Math.min(info.numVehicles, MAX_MAPPED_VEHICLES);
          const vehicles: Array<ReturnType<typeof decodeScoringVehicle>> = [];
          for (let i = 0; i < count; i++) {
            vehicles.push(decodeScoringVehicle(buf, activeScoCal.offset + i * activeScoCal.stride));
          }
          return { info, vehicles };
        },
        0,
        scoring.size,
      );

      if (!scoRead.ok) {
        tornReads++;
        await sleep(1);
        continue;
      }

      const { info, vehicles } = scoRead.value;
      if (!info.trackName || info.numVehicles <= 0) {
        await sleep(50);
        continue;
      }

      if (!stream) {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
        const fileName = `${sanitizeFileName(info.trackName)}_${timestamp.slice(0, 8)}-${timestamp.slice(8, 14)}.jsonl`;
        const filePath = path.join(outDir, fileName);
        stream = fs.createWriteStream(filePath, { flags: 'a' });
        stream.write(`${formatMetaRecord(info, info.trackName, activeTelCal, activeScoCal)}\n`);
        console.log(`Recording to ${filePath}`);
      }

      const player = vehicles.find(v => v.isPlayer || v.control === 0);
      if (player) playerId = player.id;

      if (info.currentEt !== lastScoringEt) {
        lastScoringEt = info.currentEt;
        stream.write(`${formatScoringRecord(info, vehicles)}\n`);
        scoringCount++;

        if (scoringCount % 25 === 0) {
          process.stdout.write(`\r  ${telemetryCount} telemetry / ${scoringCount} scoring samples, ${tornReads} torn reads`);
        }
      }

      if (playerId !== -1 && activeTelCal) {
        const telRead = tryReadCoherent(
          telemetry,
          TELEMETRY.versionBegin,
          TELEMETRY.versionEnd,
          buf => {
            const count = Math.min(buf.readInt32LE(TELEMETRY.numVehicles), MAX_MAPPED_VEHICLES);
            for (let i = 0; i < count; i++) {
              const tv = decodeTelemetryVehicle(buf, activeTelCal.offset + i * activeTelCal.stride);
              if (tv.id === playerId) return tv;
            }
            return null;
          },
          0,
          telemetry.size,
        );

        if (telRead.ok && telRead.value && telRead.value.et !== lastTelemetryEt) {
          lastTelemetryEt = telRead.value.et;
          stream.write(`${formatTelemetryRecord(telRead.value)}\n`);
          telemetryCount++;

          if (telemetryCount % 500 === 0) {
            process.stdout.write(`\r  ${telemetryCount} telemetry / ${scoringCount} scoring samples, ${tornReads} torn reads`);
          }
        }
      }

      await sleep(1);
    }

    if (stream) {
      await new Promise<void>(resolve => stream?.end(resolve));
    }

    console.log(`\nDone. ${telemetryCount} telemetry samples, ${scoringCount} scoring samples, ${tornReads} torn reads.`);
    return 0;
  } finally {
    telemetry.close();
    scoring.close();
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const mode = argv[0]?.toLowerCase() ?? 'probe';

  if (mode === 'probe') {
    return runProbe();
  }
  if (mode === 'dump') {
    return runDump();
  }
  if (mode === 'record') {
    return runRecord(argv);
  }

  console.log(`lmu-telemetry-recorder (Node.js/TS version)

  probe                     Print struct sizes and a live 1 Hz dump of both buffers.
                            Use this to confirm the layout is correct, and to test
                            whether the buffers tick while watching a replay.

  record [options]          Stream to JSONL until Ctrl+C.
    --out <dir>             Output directory (default test/fixtures/telemetry)
    --seconds <n>           Auto-stop after n seconds

  dump                      One-shot diagnostic: buffer sizes, decoded ScoringInfo,
                            and every ASCII string found in each buffer with its
                            offset. Use this when detection fails.`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? '')) {
  main().then(code => {
    if (code !== 0) process.exit(code);
  }).catch(err => {
    console.error('Fatal error in telemetry recorder:', err);
    process.exit(1);
  });
}
