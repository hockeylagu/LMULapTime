/** The AI race engineer: the lap evidence sent to it, its report, and the stored report history. */

export type AiErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'payload_too_large'
  | 'invalid_key'
  | 'invalid_model'
  | 'rate_limited'
  | 'upstream_timeout'
  | 'upstream_unavailable'
  | 'upstream_error'
  | 'malformed_model_response';

export interface AiEvidenceSegment {
  segmentIndex: number;
  type: 'corner' | 'straight';
  segmentLengthM?: number;
  primaryTimeSec?: number;
  baselineTimeSec?: number;
  cornerNumber?: number;
  turnDirection?: 'left' | 'right';
  cornerAngleDeg?: number;
  effectiveRadiusM?: number;
  apexRatioPct?: number;
  timeDeltaSec?: number;
  entrySpeedDeltaKmh?: number;
  primaryEntrySpeedKmh?: number;
  baselineEntrySpeedKmh?: number;
  minSpeedDeltaKmh?: number;
  primaryMinSpeedKmh?: number;
  baselineMinSpeedKmh?: number;
  exitSpeedDeltaKmh?: number;
  primaryExitSpeedKmh?: number;
  baselineExitSpeedKmh?: number;
  brakingPointDeltaM?: number | null;
  primaryBrakingOffsetM?: number | null;
  baselineBrakingOffsetM?: number | null;
  throttleOnDeltaM?: number | null;
  primaryThrottleOnOffsetM?: number | null;
  baselineThrottleOnOffsetM?: number | null;
  initialThrottleDeltaM?: number | null;
  primaryInitialThrottleOffsetM?: number | null;
  baselineInitialThrottleOffsetM?: number | null;
  primaryTurnInOffsetM?: number | null;
  baselineTurnInOffsetM?: number | null;
  turnInDeltaM?: number | null;
  straightBrakingDistM?: number | null;
  trailBrakeDistM?: number;
  trailBrakeDurationSec?: number;
  primaryRotationAtThrottlePct?: number | null;
  baselineRotationAtThrottlePct?: number | null;
  rotationAtThrottleDeltaPct?: number | null;
  primaryPeakYawRateDeg?: number;
  baselinePeakYawRateDeg?: number;
  peakYawRateDeltaDeg?: number;
  primaryLine?: { entryOffsetM?: number; apexOffsetM?: number; exitOffsetM?: number; totalChangeM?: number };
  baselineLine?: { entryOffsetM?: number; apexOffsetM?: number; exitOffsetM?: number; totalChangeM?: number };
  steeringScrubDeg?: number;
  exitWheelSlipActive?: boolean;
  phaseTiming?: {
    entry?: { startDistM: number; endDistM: number; timeDeltaSec: number };
    rotation: { startDistM: number; endDistM: number; timeDeltaSec: number };
    exit: { startDistM: number; endDistM: number; timeDeltaSec: number };
  };
  topSpeedDeltaKmh?: number;
  primaryTopSpeedKmh?: number;
  baselineTopSpeedKmh?: number;
}

export interface AiLapEvidence {
  lap: {
    sessionId: string;
    driverOrdinal: number;
    lapOrdinal: number;
    lapNumber: number;
    driverName?: string;
    carClass?: string;
    carModel?: string;
    lapTimeSec: number;
    s1Sec?: number;
    s2Sec?: number;
    s3Sec?: number;
    isValid?: boolean;
    isOutlap?: boolean;
  };
  baseline?: {
    sessionId: string;
    driverOrdinal: number;
    lapOrdinal: number;
    lapNumber: number;
    driverName?: string;
    carClass?: string;
    carModel?: string;
    lapTimeSec: number;
    s1Sec?: number;
    s2Sec?: number;
    s3Sec?: number;
  };
  segments: AiEvidenceSegment[];
  consistency?: {
    lapCount: number;
    leastConsistentLabel?: string;
    leastConsistentPct?: number;
    stats: Array<{ label: string; avgSec: number; stdDevSec: number; consistencyPct: number }>;
  };
  trackLimits?: { available: boolean; incidents: Array<{ description: string; lapNum?: number; warningPoints?: number }> };
  /** The corners to explain, already ranked by the app (time lost x repeatability x confidence). */
  priorities?: Array<{ rank: number; cornerNumber: number; timeLossSec: number; lapsLosing?: number; lapsSampled?: number; confidence: number }>;
}

export interface AiReportSection {
  title: string;
  action: string;
  why: string;
  executionCue: string;
  verify: string;
  evidence?: string[];
  estimatedGainSec?: number;
  /** The ranked corner this improvement explains, when the evidence carried priorities. */
  cornerNumber?: number;
}

export interface AiLapReport {
  overallSummary: string;
  improvements: AiReportSection[];
}

export interface AiAnalyzeRequest {
  forceRegenerate?: boolean;
  evidence: AiLapEvidence;
}

export interface AiTokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface AiAnalyzeResponse {
  report: AiLapReport;
  cached: boolean;
  modelUsed: string;
  generatedAt: string;
  tokensUsed?: AiTokenUsage;
}

export interface AiReportRecord {
  cacheKey: string;
  sessionId: string | null;
  driverOrdinal: number | null;
  lapOrdinal: number | null;
  lapNumber: number;
  baselineSessionId?: string | null;
  baselineDriverOrdinal?: number | null;
  baselineLapOrdinal?: number | null;
  baselineLapNumber?: number | null;
  model: string;
  promptVersion: number;
  report: AiLapReport;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  generatedAt: number;
}

export interface AiReportHistoryEntry {
  cacheKey: string;
  sessionId: string | null;
  driverOrdinal: number | null;
  lapOrdinal: number | null;
  lapNumber: number;
  baselineSessionId?: string | null;
  baselineDriverOrdinal?: number | null;
  baselineLapOrdinal?: number | null;
  baselineLapNumber?: number | null;
  model: string;
  overallSummary?: string;
  tokensUsed?: AiTokenUsage;
  generatedAt: number;
}
