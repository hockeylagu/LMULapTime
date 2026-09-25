export interface RawLapXmlNode {
  '@_num'?: string | number;
  '@_p'?: string | number;
  '@_s1'?: string;
  '@_s2'?: string;
  '@_s3'?: string;
  '@_topspeed'?: string | number;
  '@_fcompound'?: string;
  '@_rcompound'?: string;
  '@_FL'?: string;
  '@_fl'?: string;
  '@_FR'?: string;
  '@_fr'?: string;
  '@_RL'?: string;
  '@_rl'?: string;
  '@_RR'?: string;
  '@_rr'?: string;
  '@_pit'?: string | number;
  '@_et'?: string;
  '@_twfl'?: string | number;
  '@_twfr'?: string | number;
  '@_twrl'?: string | number;
  '@_twrr'?: string | number;
  '@_fuel'?: string | number;
  '@_fuelUsed'?: string | number;
  '@_fuelused'?: string | number;
  '@_fused'?: string | number;
  '@_ve'?: string | number;
  '@_veUsed'?: string | number;
  '@_veused'?: string | number;
  '@_nrg'?: string | number;
  '@_nrgused'?: string | number;
  '#text'?: string;
  [key: string]: unknown;
}

export interface RawDriverXmlNode {
  Name?: string;
  CarType?: string;
  VehName?: string;
  CarClass?: string;
  CarNumber?: string | number;
  TeamName?: string;
  isPlayer?: string | number | boolean;
  Position?: string | number;
  ClassPosition?: string | number;
  Lap?: RawLapXmlNode | RawLapXmlNode[];
  GridPos?: string | number;
  GridPosition?: string | number;
  QualPosition?: string | number;
  Grid?: string | number;
  ClassGridPos?: string | number;
  ClassGridPosition?: string | number;
  ClassGrid?: string | number;
  FinishStatus?: string;
  Reason?: string;
  Pitstops?: string | number;
  PitStops?: string | number;
  NumPitstops?: string | number;
  [key: string]: unknown;
}

export interface RawStreamIncidentNode {
  '@_et'?: string | number;
  '#text'?: string;
  [key: string]: unknown;
}

export interface RawStreamSectorNode {
  '@_et'?: string | number;
  '#text'?: string;
  [key: string]: unknown;
}

export interface RawStreamTrackLimitNode {
  '@_Driver'?: string;
  '@_driver'?: string;
  '@_et'?: string | number;
  '@_Lap'?: string | number;
  '@_WarningPoints'?: string | number;
  '@_warningpoints'?: string | number;
  '@_CurrentPoints'?: string | number;
  '@_currentpoints'?: string | number;
  '#text'?: string;
  [key: string]: unknown;
}

export interface RawStreamPenaltyNode {
  '@_Driver'?: string;
  '@_driver'?: string;
  '@_et'?: string | number;
  '@_Penalty'?: string;
  '@_penalty'?: string;
  '@_Reason'?: string;
  '@_reason'?: string;
  '#text'?: string;
  [key: string]: unknown;
}

export interface RawStreamXmlNode {
  Incident?: RawStreamIncidentNode | RawStreamIncidentNode[];
  Sector?: RawStreamSectorNode | RawStreamSectorNode[];
  TrackLimits?: RawStreamTrackLimitNode | RawStreamTrackLimitNode[];
  Penalty?: RawStreamPenaltyNode | RawStreamPenaltyNode[];
  [key: string]: unknown;
}

export interface RawSessionXmlNode {
  Driver?: RawDriverXmlNode | RawDriverXmlNode[];
  Stream?: RawStreamXmlNode;
  Setting?: unknown;
  ServerName?: unknown;
  DamageMult?: unknown;
  FuelMult?: unknown;
  TireMult?: unknown;
  TireWarmers?: unknown;
  FixedSetups?: unknown;
  FreeSettings?: unknown;
  FixedUpgrades?: unknown;
  ParcFerme?: unknown;
  MechFailRate?: unknown;
  Minutes?: unknown;
  RaceTime?: unknown;
  RaceLaps?: unknown;
  VehiclesAllowed?: unknown;
  [key: string]: unknown;
}

export interface ReplayFileEntry {
  name: string;
  path: string;
  sizeBytes: number;
  trackName: string;
  sessionCode: string; // e.g. P1, Q1, R1
  mtime: number;
  eventTitle?: string;
  splitNo?: number;
  eventType?: string;
  durationSec?: number;
}
