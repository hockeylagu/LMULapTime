import type { NonRepresentativeReason } from './session.js';
import type { VehicleDataRecord } from './dataPlugin.js';
import type { TrackKerbType } from './trackGeometry.js';

export interface ReplayEventInfo {
  eventId?: string;
  eventTitle?: string;
  eventType?: string;
  sceneDesc?: string;
  seriesId?: string;
  session?: string;
  splitNo?: number;
  [key: string]: unknown;
}

export interface ReplayDriverEntry {
  slot?: number;
  name: string;
  vehicleId?: string;
  carModel?: string;
  carClass?: string;
  team?: string;
  carNumber?: string;
  livery?: string;
  entryTime?: number;
  exitTime?: number;
  isPlayer?: boolean;
}

export interface ReplayMetadata {
  filename: string;
  filePath: string;
  fileSizeBytes: number;
  mtimeMs: number;
  eventInfo?: ReplayEventInfo | null;
  eventTitle?: string;
  sessionType?: string;
  privateSession?: boolean;
  scn?: string;
  sceneDesc?: string;
  aiw?: string;
  trackName?: string;
  trackVenue?: string;
  trackCourse?: string;
  displayTrack?: string;
  trackVersion?: string;
  modUid?: string;
  trackPath?: string;
  timeSliceCount: number;
  totalEvents: number;
  durationSec: number;
  startTimeSec?: number;
  endTimeSec?: number;
  drivers: ReplayDriverEntry[];
  laps?: ReplayLapSummary[];
  carClass?: string;
  carModel?: string;
  hasDuckDbTelemetry?: boolean;
  duckdbFilename?: string;
  hasRain?: boolean;
  maxRainIntensity?: number;
  weatherCondition?: 'Dry' | 'Wet' | 'Dynamic Weather';
  ambientTemp?: number;
  trackTemp?: number;
}

export interface TimingGateGeometry {
  name: string;
  center: [number, number];
  left: [number, number];
  right: [number, number];
  stationM: number;
}

export interface TrackTimingGates {
  startFinish: TimingGateGeometry;
  sector1?: TimingGateGeometry;
  sector2?: TimingGateGeometry;
}

export interface ReplayTrajectoryPoint {
  x: number;
  y: number;
  z: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  speedKmh?: number;
  throttle?: number;
  brake?: number;
  steerYaw?: number;
  gear?: number;
  inPit?: boolean;
  inGarage?: boolean;
  isTeleport?: boolean;
  timeSec?: number;
  tcActive?: boolean;
  absActive?: boolean;
  pitLimiter?: boolean;
  isOffTrack?: boolean;
  detachablePartState?: number;
  tireTemps?: [number, number, number, number];
  tireWear?: [number, number, number, number];
  tirePressures?: [number, number, number, number];
  rideHeight?: [number, number, number, number];
  wheelSpeeds?: [number, number, number, number];
  brakeTemps?: [number, number, number, number];
  engineRpm?: number;
  distM?: number;
  stationM?: number;
  lateralOffsetM?: number;
  /** Signed car-center distance to the physical road edge; negative means outside. */
  leftRoadDistanceM?: number | null;
  rightRoadDistanceM?: number | null;
  /** Ground elevation at the reference route in the native local datum, not car-body Y. */
  roadElevationM?: number | null;
  roadGradePct?: number | null;
  /** Positive banking means the left road edge is higher than the right. */
  roadBankDeg?: number | null;
  leftKerbWidthM?: number | null;
  rightKerbWidthM?: number | null;
  leftKerbHeightM?: number | null;
  rightKerbHeightM?: number | null;
  /** Kerb type beside the car's station on each side (flat / sawtooth / other), null without a kerb. */
  leftKerbType?: TrackKerbType | null;
  rightKerbType?: TrackKerbType | null;
  accelLonG?: number;
  accelLatG?: number;
  accelTotalG?: number;
  yawRateDeg?: number;
  slipAngleDeg?: number;
  understeerDeg?: number;
  tireSlipPct?: number;
  wheelLockActive?: boolean;
  fuel?: number;
  virtualEnergy?: number;
  soc?: number;
  regenRate?: number;
  rainIntensity?: number;
  ambientTemp?: number;
  trackTemp?: number;
  tireCompoundIndices?: [number, number, number, number];
}

export interface ReplayContactEvent {
  driverSlot: number;
  driverName?: string;
  timeSec: number;
  impactMagnitude: number;
  otherParty?: number;
  otherPartyName?: string;
}

export interface ReplayPenaltyEvent {
  driverSlot: number;
  driverName?: string;
  timeSec: number;
  penaltyText: string;
  penaltyType?: string;
  /** Time penalty length; only on 'given'. */
  penaltySeconds?: number;
  action: 'given' | 'served';
}

export interface ReplayPitEvent {
  driverSlot: number;
  driverName?: string;
  timeSec: number;
  code: number;
  action: string;
  isGarage?: boolean;
  durationSec?: number;
  details?: string;
  fuelAddedLiters?: number;
}

export interface ReplayFlagEvent {
  timeSec: number;
  flagState: number;
  flagName: string;
  sectorMask?: number;
  driverSlot?: number;
  driverFlag?: number;
}

export interface ReplayWeatherEvent {
  timeSec: number;
  rainIntensity: number;
  rainPercent?: number;
  ambientTemp?: number;
  trackTemp?: number;
}

export interface ReplayStandingsSnapshot {
  timeSec: number;
  order: number[];
}

export type ReplayTelemetryPoint = ReplayTrajectoryPoint;

export interface ReplayLapSummary {
  lapNumber: number;
  lapTimeSec: number;
  lapDistMeters?: number;
  s1Sec: number;
  s2Sec: number;
  s3Sec: number;
  isOutlap?: boolean;
  /** Completed lap containing pit-lane entry; excluded from flying-lap consistency. */
  isPitStop?: boolean;
  isBest?: boolean;
  isValid?: boolean;
  startFrame?: number;
  endFrame?: number;
  // Validation info from matched session log (if available)
  validatedTimeSec?: number | null;
  validatedS1Sec?: number | null;
  validatedS2Sec?: number | null;
  validatedS3Sec?: number | null;
  timeDiffSec?: number | null;
  nonRepresentativeReason?: NonRepresentativeReason;
}

export interface ReplayTrajectoryValidation {
  matchedSessionId: string;
  sessionType?: string;
  trackName?: string;
  driverName?: string;
  totalSessionLaps: number;
  officialBestLapTime?: number | null;
  officialLaps?: Array<{
    lapNumber: number;
    lapTimeSec?: number | null;
    s1Sec?: number | null;
    s2Sec?: number | null;
    s3Sec?: number | null;
    isValid?: boolean;
    isPitStop?: boolean;
    isOutLap?: boolean;
    nonRepresentativeReason?: NonRepresentativeReason;
  }>;
}

/**
 * How one end of a lap was put on the start/finish line: cut where the recording crosses it
 * ('line'), extended to it over the last few metres because the recording stops just short of it
 * ('extrapolated'), or not at all because the recording is nowhere near it ('none', e.g. an
 * out-lap starting in the pits): the lap then starts or ends where the replay sliced it.
 */
export type LapEndCut = 'line' | 'extrapolated' | 'none';

export interface ReplayTrajectoryData {
  vehicleIdentity?: { vehicleId?:string; carModel?:string; carClass?:string };
  vehicleData?: VehicleDataRecord;
  dataPluginRevision?: string;
  replayName: string;
  driverSlot?: number;
  driverName?: string;
  pointsCount: number;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  maxPoints?: number;
  isFullResolution?: boolean;
  currentLap?: number;
  /** Recorded sample clock; native replay samples use session time. */
  timeReference?: 'session' | 'lap';
  /** Session timestamp of the selected lap's timing-loop start. */
  lapStartTimeSec?: number;
  laps?: ReplayLapSummary[];
  sectors?: {
    s1Frame: number;
    s2Frame: number;
  };
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    spanX: number;
    spanZ: number;
  };
  points: ReplayTrajectoryPoint[];
  // Server-internal: raw samples just before / after the lap as sliced by the timing loop, so it
  // can be cut exactly at the start/finish line once projected on the track. Never sent to clients.
  leadInPoints?: ReplayTrajectoryPoint[];
  leadOutPoints?: ReplayTrajectoryPoint[];
  penalties?: ReplayPenaltyEvent[];
  contacts?: ReplayContactEvent[];
  pitEvents?: ReplayPitEvent[];
  sessionRunningOrder?: number[];
  flagEvents?: ReplayFlagEvent[];
  weatherEvents?: ReplayWeatherEvent[];
  weatherCondition?: 'Dry' | 'Wet' | 'Dynamic Weather';
  maxRainIntensity?: number;
  ambientTemp?: number;
  trackTemp?: number;
  tireCompounds?: [number, number, number, number];
  standingsHistory?: ReplayStandingsSnapshot[];
  validation?: ReplayTrajectoryValidation | null;
  wheelTelemetryAvailable?: boolean;
  energyTelemetryAvailable?: boolean;
  layoutKey?: string;
  geometryRevision?: string;
  /** Reference route/station origin revision, independent of display and profile updates. */
  projectionRevision?: string;
  /** Station frame used for a recorded line cut; retained during subsequent reprojection. */
  lineCutProjectionRevision?: string;
  trackLengthM?: number;
  lapDistMeters?: number;
  timingGates?: TrackTimingGates;
  // How stationM was obtained: projected on the layout's centreline ('track'), or the lap's own
  // driven distance when there is no geometry for the layout ('odometer'). Odometer stations of
  // two laps don't refer to the same place on track: they start wherever each lap was sliced.
  stationSource?: 'track' | 'odometer';
  // How each end of the lap was put on the start/finish line (see LapEndCut).
  lineCut?: { start: LapEndCut; end: LapEndCut };
  source?: 'vcr' | 'duckdb';
  duckdbFilename?: string;
  duckdbAvailable?: boolean;
  duckdbUnavailableReason?: string;
  vcrRawPointsCount?: number;
  vcrRawSampleRateHz?: number;
  duckdbRawPointsCount?: number;
  duckdbRawSampleRateHz?: number;
  // Present only when the trajectory was extracted with `allLaps: true` - one fully
  // finalized ReplayTrajectoryData per detected lap of this driver, from a single file scan.
  allLapsData?: ReplayTrajectoryData[];
}

export interface ReplaySummary {
  name: string;
  path: string;
  sizeBytes: number;
  fileSizeBytes?: number;
  mtime: number;
  mtimeMs?: number;
  trackName?: string;
  trackVenue?: string;
  trackCourse?: string;
  displayTrack?: string;
  sessionCode?: string;
  durationSec?: number;
  eventTitle?: string;
  splitNo?: number;
  eventType?: string;
  driversCount?: number;
  matchedSessionId?: string;
  carClass?: string;
  carModel?: string;
  carClasses?: string[];
  hasDuckDbTelemetry?: boolean;
  duckdbFilename?: string;
  hasRain?: boolean;
  maxRainIntensity?: number;
  weatherCondition?: 'Dry' | 'Wet' | 'Dynamic Weather';
  ambientTemp?: number;
  trackTemp?: number;
}
