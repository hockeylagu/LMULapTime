import type { NonRepresentativeReason } from './session.js';
import type { VehicleDataRecord, VehicleHandlingCalibration } from './dataPlugin.js';
import type { TrackTimingGates } from './trackGeometry.js';
import type { ScenerySessionId } from './scenes/scenery.js';
import type { WeatherCondition } from './session.js';
import type { LiveCaptureOverlay, LiveDynamicsProvenance, WheelSlip } from './liveEvidence.js';

export interface ReplayEventInfo {
  eventId?: string;
  eventTitle?: string;
  eventType?: string;
  seriesId?: string;
  splitNo?: number;
  [key: string]: unknown;
}

export interface ReplayDriverEntry {
  slot?: number;
  sessionDriverOrdinal?: number;
  sessionLapOrdinals?: Record<string, number>;
  name: string;
  vehicleId?: string;
  carType?: string;
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
  sessionType?: string;
  privateSession?: boolean;
  /** The event's race start, minutes past local midnight; null offline (the track's default session time). Absent in metadata cached before it was read. */
  raceStartMinute?: number | null;
  /** [session time s, cloud cover 0 clear..1 overcast] from the sampled weather packets; null when not scanned, absent in metadata cached before it was read. */
  cloudCover?: Array<[number, number]> | null;
  /** The cloud field of the sampled weather packets, in time order; null when not scanned, absent in metadata cached before it was read. */
  cloudField?: ReplayCloudFieldSample[] | null;
  /** The variant id ("01".."03") of each cloud cell code 0..14; null when not scanned or not found, absent in metadata cached before it was read. */
  cloudVariants?: string[] | null;
  scn?: string;
  /** The engine scene (scn without its extension): names the exact layout. */
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
  carType?: string;
  duckdbFilename?: string;
  hasRain?: boolean;
  maxRainIntensity?: number;
  weatherCondition?: WeatherCondition;
  ambientTemp?: number;
  trackTemp?: number;
}

export interface ReplayCacheSummary {
  filename: string;
  fileSizeBytes: number;
  compressedSizeBytes: number;
  // The .Vcr file's on-disk modification time - the closest proxy we have for when the
  // replay/session actually took place.
  replayDateMs: number;
  trackName?: string;
  driversCount: number;
  durationSec?: number;
  eventTitle?: string;
  trajectoriesCached: number;
  parserVersion?: string;
  replayVersion?: string;
  isOnDisk?: boolean;
  error?: string | null;
}

export interface ReplayTrajectoryPoint {
  /** Native LMU world coordinates in metres: x/z horizontal, y up; not vehicle ISO axes. */
  x: number;
  y: number;
  z: number;
  rotX?: number;
  /** Native clockwise heading in radians, with local vehicle forward -Z. */
  rotY?: number;
  rotZ?: number;
  speedKmh?: number;
  throttle?: number;
  brake?: number;
  /** ISO positive-left steering: normalized [-1, 1] at ingestion, wheel degrees after client processing. */
  steerYaw?: number;
  gear?: number;
  inPit?: boolean;
  inGarage?: boolean;
  isTeleport?: boolean;
  timeSec?: number;
  tcActive?: boolean;
  absActive?: boolean;
  pitLimiter?: boolean;
  /** The car's headlights are lit, flashes included (a flash is a train of short toggles). */
  headlights?: boolean;
  /** The car's rain light is on: the track's rain is above the car's own threshold (not tied to wet tyres). */
  rainLight?: boolean;
  tireTemps?: [number, number, number, number];
  tireWear?: [number, number, number, number];
  tirePressures?: [number, number, number, number];
  /** Measured FL/FR/RL/RR ride height in millimetres; not an offset to add to world body Y. */
  rideHeight?: [number, number, number, number];
  /** Measured FL/FR/RL/RR linear tyre speeds in km/h. Finite zero is valid (including lockup). */
  wheelSpeeds?: [number, number, number, number];
  /** FL/FR/RL/RR brake temperatures, °C. */
  brakeTemps?: [number, number, number, number];
  /** Replay FL/FR/RL/RR wheel angular speed in rad/s as the replay signs it: negative while the wheel rolls forward. */
  wheelAngularSpeeds?: [number, number, number, number];
  /** Replay FL/FR/RL/RR suspension deflection in metres. */
  suspensionDeflections?: [number, number, number, number];
  /** Replay FL/FR/RL/RR vertical wheel load in newtons (1 kN steps). */
  wheelLoads?: [number, number, number, number];
  /** Replay FL/FR/RL/RR tyre sliding speed over the road in m/s. */
  tireSlideSpeeds?: [number, number, number, number];
  engineRpm?: number;
  distM?: number;
  stationM?: number;
  /** Metres left of the reference centerline (positive left, OpenDRIVE t). */
  lateralOffsetM?: number;
  /** Signed car-center distance to the physical road edge; negative means outside. */
  leftRoadDistanceM?: number | null;
  rightRoadDistanceM?: number | null;
  /** ISO vehicle X acceleration in g: positive forward, braking negative. */
  accelLonG?: number;
  /** ISO vehicle Y acceleration in g: positive toward the vehicle's left. */
  accelLatG?: number;
  accelTotalG?: number;
  /** Client dynamics provenance; measured native telemetry takes precedence over geometric estimates. */
  accelerationProvenance?: {
    lateral: 'telemetry' | 'derived';
    longitudinal: 'telemetry' | 'derived';
  };
  /** ISO yaw rate in degrees/s: positive left about the upward axis. */
  yawRateDeg?: number;
  /** Replay: measured velocity along the car's ISO x axis (forward), m/s. */
  velocityLon?: number;
  /** Replay: measured velocity along the car's ISO y axis (left), m/s. */
  velocityLat?: number;
  /** Source sample retained when supplemental live dynamics replace computed estimates. */
  liveDynamics?: LiveDynamicsProvenance;
  wheelSlip?: WheelSlip;
  /** ISO sideslip beta in degrees: positive velocity left of the nose. */
  slipAngleDeg?: number;
  understeerDeg?: number;
  tireSlipPct?: number;
  wheelLockActive?: boolean;
  fuel?: number;
  /**
   * The car's settings as the game's telemetry recording logs them (player laps only): the TC, TC cut, TC slip and ABS maps, the fuel
   * mixture map and the rear brake bias (0..1). Shown by the cockpit readouts.
   */
  tcMap?: number;
  tcCut?: number;
  tcSlip?: number;
  absMap?: number;
  engineMixture?: number;
  brakeBiasRear?: number;
  /** Engine oil and water temperatures, °C (player laps only). */
  oilTemp?: number;
  waterTemp?: number;
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


export interface ReplayLapSummary {
  lapNumber: number;
  lapTimeSec: number;
  lapDistMeters?: number;
  s1Sec: number;
  s2Sec: number;
  s3Sec: number;
  isOutLap?: boolean;
  /** Completed lap containing pit-lane entry; excluded from flying-lap consistency. */
  isPitStop?: boolean;
  isBest?: boolean;
  isValid?: boolean;
  startFrame?: number;
  endFrame?: number;
  // Validation info from matched session log (if available)
  validatedTimeSec?: number | null;
  nonRepresentativeReason?: NonRepresentativeReason;
}

/**
 * How one end of a lap was put on the start/finish line: cut where the recording crosses it
 * ('line'), extended to it over the last few metres because the recording stops just short of it
 * ('extrapolated'), or not at all because the recording is nowhere near it ('none', e.g. an
 * out-lap starting in the pits): the lap then starts or ends where the replay sliced it.
 */
export type LapEndCut = 'line' | 'extrapolated' | 'none';

/**
 * One weather packet's cloud field: [session time s, upper layer drift, lower layer drift, cells]. The drifts are in cells and
 * grow with the wind; `cells` is 32 hex digits, one cloud cell code each (15 a clear cell), in cell order.
 */
export type ReplayCloudFieldSample = [number, number, number, string];

/** A replay moment's in-game clock, for the sun (shared/domain/scenery/replayDaylightClock.ts). */
export interface ReplayDaylightClock {
  /** The session whose default daylight the track publishes. */
  session: ScenerySessionId;
  /** Session start, minutes past local midnight; null when the replay does not carry it (the session default applies). */
  startMinute: number | null;
  /** Session time of the lap start. */
  sessionTimeSec: number;
  /** Cloud cover nearest the lap start, 0 clear..1 overcast; absent when the replay's weather was not read. */
  cloudCover?: number;
  /**
   * The cloud field at the lap start: the nearest sample's cells and the drifts interpolated to the moment, with the drifts of the
   * replay's first sample (a cloud's age counts from them); absent like `cloudCover`. `variants` is the replay's variant id per
   * cell code 0..14, absent when the replay has none.
   */
  cloudField?: { cells: string; upperDrift: number; lowerDrift: number; startUpperDrift: number; startLowerDrift: number; variants?: string[] };
}

export interface ReplayTrajectoryData {
  /** Attachment hint only; the live-evidence API validates current ownership before use. */
  hasLiveCapture?: boolean;
  liveCaptureOverlay?: LiveCaptureOverlay;
  sessionId?: string;
  driverOrdinal?: number;
  lapOrdinal?: number;
  vehicleIdentity?: { vehicleId?: string; carType?: string; carClass?: string; livery?: string };
  vehicleData?: VehicleDataRecord;
  /** Applied client calibration; plugin steering uses base defaults, not a recorded setup. */
  handlingCalibration?: VehicleHandlingCalibration;
  dataPluginRevision?: string;
  replayName: string;
  driverSlot?: number;
  driverName?: string;
  pointsCount: number;
  /** Samples the VCR recorded for this lap before any downsampling. */
  vcrRawPointsCount?: number;
  vcrRawSampleRateHz?: number;
  maxPoints?: number;
  isFullResolution?: boolean;
  currentLap?: number;
  /** Recorded sample clock; native replay samples use session time. */
  timeReference?: 'session' | 'lap';
  /** Session timestamp of the selected lap's timing-loop start. */
  lapStartTimeSec?: number;
  /** The lap start's in-game clock; absent without a session replay. */
  daylightClock?: ReplayDaylightClock;
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
  /**
   * Sign convention of the stored signed channels (steering). Rows cached before ISO 8855 carry
   * none and are converted on read (replayTrajectoryCodec.ts); see docs/TELEMETRY_FORMAT.md.
   */
  signConvention?: 'iso8855';
  // Server-internal: raw samples just before / after the lap as sliced by the timing loop, so it
  // can be cut exactly at the start/finish line once projected on the track. Never sent to clients.
  leadInPoints?: ReplayTrajectoryPoint[];
  leadOutPoints?: ReplayTrajectoryPoint[];
  penalties?: ReplayPenaltyEvent[];
  contacts?: ReplayContactEvent[];
  pitEvents?: ReplayPitEvent[];
  sessionRunningOrder?: number[];
  weatherEvents?: ReplayWeatherEvent[];
  weatherCondition?: WeatherCondition;
  maxRainIntensity?: number;
  ambientTemp?: number;
  trackTemp?: number;
  tireCompounds?: [number, number, number, number];
  standingsHistory?: ReplayStandingsSnapshot[];
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
  duckdbRawPointsCount?: number;
  duckdbRawSampleRateHz?: number;
  // Present only when the trajectory was extracted with `allLaps: true` - one fully
  // finalized ReplayTrajectoryData per detected lap of this driver, from a single file scan.
  allLapsData?: ReplayTrajectoryData[];
}

/** A car of a session replay as the race replay shows it (replay slot, entry and session driver). */
export interface RaceReplayCar {
  slot: number;
  name: string;
  carClass?: string;
  carNumber?: string;
  team?: string;
  vehicleId?: string;
  /** The car's model as the replay names it: its manufacturer's logo. */
  carType?: string;
  /** The car's steering and wheelbase from the package (fallbacks where it has none): the 3D view steers its wheels by it. */
  handling?: VehicleHandlingCalibration;
  isPlayer?: boolean;
  /** The session driver this car is, when the name matches one; opens its laps in the lap view. */
  sessionDriverOrdinal?: number;
  sessionLapOrdinals?: Record<string, number>;
  /** The results' status when the car did not finish (DNF, DQ, DNS): it is out from the end of its last lap. */
  retired?: string;
}

/** One lap of one car on the replay clock. */
export interface RaceReplayLap {
  slot: number;
  lapNumber: number;
  startSec: number;
  endSec: number;
  lapTimeSec: number | null;
  /** Sector times, seconds (null when the replay has none). */
  s1Sec?: number | null;
  s2Sec?: number | null;
  s3Sec?: number | null;
  isValid: boolean;
}

/** The game's running order (replay slots, first to last) from `timeSec` until the next snapshot. */
export interface RaceRunningOrder {
  timeSec: number;
  order: number[];
}

export type RaceReplayEventKind = 'pit' | 'contact' | 'penalty' | 'penaltyServed';

/** A moment of the session on the race replay's timeline. */
export interface RaceReplayEvent {
  kind: RaceReplayEventKind;
  /** Replay clock, seconds: the pit entry, the first touch, the penalty. */
  timeSec: number;
  slot: number;
  /** Contact: the other car's slot; absent for a wall or an object. */
  otherSlot?: number;
  /** Contact with a wall or an object: what was hit, as the replay names it. Penalty: its text. */
  label?: string;
  /** Contact: the strongest impact of the touch, as the replay records it. */
  impact?: number;
  /** Pit: seconds from pit entry to exit (null when the car never left the lane), and stopped for service. */
  pitLaneSec?: number | null;
  serviceSec?: number | null;
}

/**
 * Every car's distance along the track on one clock grid, for the race replay's live gaps: distance `k` of a car is at
 * `fromSec + k / hz`.
 */
export interface RaceReplayProgress {
  fromSec: number;
  hz: number;
  trackLengthM: number;
  /** Metres along the centreline, unwrapped across laps from each car's own zero; null off the track (pits, garage, gaps). */
  cars: Array<{ slot: number; distances: Array<number | null> }>;
}

/** Everything the race replay needs besides the car poses, which come in time windows. */
export interface RaceReplayOverview {
  replayName: string;
  sessionType?: string;
  /** The replay clock span the laps cover, in seconds. */
  startSec: number;
  endSec: number;
  /** Seconds per pose window (`/race/poses?window=`). */
  windowSec: number;
  /** The circuit layout (circuitSpecs) the replay was driven on, when known. */
  layoutKey?: string;
  trackVenue?: string;
  trackCourse?: string;
  sceneDesc?: string;
  cars: RaceReplayCar[];
  laps: RaceReplayLap[];
  runningOrder: RaceRunningOrder[];
  /** Pit stops, contacts and penalties in time order. */
  events: RaceReplayEvent[];
  /** What the in-game clock at any replay time is built from (`replayDaylightClock`: replay time is session time). */
  daylight: RaceReplayDaylight;
}

/** The replay's race start and sampled weather, null where the replay's metadata does not carry them. */
export interface RaceReplayDaylight {
  raceStartMinute: number | null;
  cloudCover: Array<[number, number]> | null;
  cloudField: ReplayCloudFieldSample[] | null;
  cloudVariants: string[] | null;
}
