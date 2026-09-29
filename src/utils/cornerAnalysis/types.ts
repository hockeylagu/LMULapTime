interface BaseSegmentComparison {
  segmentIndex: number;
  entryDistM: number;
  exitDistM: number;
  lengthM: number;
  primaryTimeSec: number;
  timeDeltaSec: number;
}

export interface CornerTrackUsage {
  entryOffsetM?: number;
  entrySpaceLeftM?: number;
  apexMarginM?: number;
  apexSpaceLeftM?: number;
  exitWidthM?: number;
  exitTrackOutOffsetM?: number;
  exitSpaceLeftM?: number;
  totalSweepM?: number;
}

export interface CornerPhaseTiming {
  entry?: { startDistM: number; endDistM: number; timeDeltaSec: number };
  rotation: { startDistM: number; endDistM: number; timeDeltaSec: number };
  exit: { startDistM: number; endDistM: number; timeDeltaSec: number };
}

export interface CornerTypeSpecificDetails {
  exitWheelSlipActive?: boolean;
  steeringScrubDeg?: number;
}

export interface CornerSegmentComparison extends BaseSegmentComparison {
  type: 'corner';
  cornerNumber: number;
  minDistM: number;
  primaryEntrySpeedKmh: number;
  baselineEntrySpeedKmh: number;
  entrySpeedDeltaKmh: number;
  primaryMinSpeedKmh: number;
  baselineMinSpeedKmh: number;
  minSpeedDeltaKmh: number;
  primaryExitSpeedKmh: number;
  baselineExitSpeedKmh: number;
  exitSpeedDeltaKmh: number;
  // Distance (m) into the corner window where brake/throttle first crosses its threshold; null
  // if it never crosses (e.g. a flat-out kink, or partial throttle the whole way through).
  primaryBrakingDistM: number | null;
  baselineBrakingDistM: number | null;
  brakingPointDeltaM: number | null;
  primaryThrottleOnDistM: number | null;
  baselineThrottleOnDistM: number | null;
  throttleOnDeltaM: number | null;
  primaryInitialThrottleDistM?: number | null;
  baselineInitialThrottleDistM?: number | null;
  initialThrottleDeltaM?: number | null;

  // --- Enhanced Corner Quality & Technique Metrics ---
  turnDirection?: 'left' | 'right';
  cornerAngleDeg?: number;
  effectiveRadiusM?: number;
  apexRatioPct?: number;

  // Turn-In Point
  primaryTurnInDistM?: number | null;
  baselineTurnInDistM?: number | null;
  turnInDeltaM?: number | null;
  straightBrakingDistM?: number | null;

  // Trail-Braking
  trailBrakeDistM?: number;
  trailBrakeDurationSec?: number;

  // Rotation Dynamics
  primaryPeakYawRateDeg?: number;
  baselinePeakYawRateDeg?: number;
  peakYawRateDeltaDeg?: number;

  // Rotation Complete at Throttle
  primaryRotationAtThrottlePct?: number | null;
  baselineRotationAtThrottlePct?: number | null;
  rotationAtThrottleDeltaPct?: number | null;

  // Track Usage
  primaryTrackUsage?: CornerTrackUsage;
  baselineTrackUsage?: CornerTrackUsage;
  entrySpaceDeltaM?: number | null;
  apexSpaceDeltaM?: number | null;
  exitSpaceDeltaM?: number | null;

  // Isolated time deltas for physical corner phases. Entry is unavailable when turn-in
  // cannot be measured; rotation then begins at the detected corner entry.
  phaseTiming?: CornerPhaseTiming;

  typeSpecificDetails?: CornerTypeSpecificDetails;
}

export interface StraightSegmentComparison extends BaseSegmentComparison {
  type: 'straight';
  primaryTopSpeedKmh: number;
  baselineTopSpeedKmh: number;
  topSpeedDeltaKmh: number;
  // Speed at the straight's own end boundary (not just the fastest point anywhere along it) -
  // for the lap's final straight, this boundary IS the start/finish line.
  primaryExitSpeedKmh: number;
  baselineExitSpeedKmh: number;
  exitSpeedDeltaKmh: number;
}

export type LapSegmentComparison = CornerSegmentComparison | StraightSegmentComparison;
