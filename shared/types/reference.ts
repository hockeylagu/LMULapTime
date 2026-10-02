export type PaceCategory = 'Alien' | 'Competitive' | 'Good' | 'Midpack' | 'Tail-ender' | 'Offline';

export interface PaceCategoryInfo {
  category: PaceCategory;
  percentage: number; // e.g. 101.2 for 101.2%
  target100Sec: number | null;
  deltaToTargetSec: number | null;
}

export interface ReferenceLaptimeEntry {
  key: string;              // e.g. "Bahrain (wec)_LMGT3"
  trackName: string;        // e.g. "Bahrain (wec)"
  carClass: string;         // e.g. "LMGT3"
  patch: string;            // e.g. "1.4+"
  target100Sec: number;     // ~100% reference time in seconds
  targets: {
    alienSec: number;       // ~100%
    competitiveSec: number; // 101%
    goodSec: number;        // 102%
    goodMidpackSec: number; // 103%
    midpackSec: number;     // 104%
    midpackTailSec: number; // 105%
    tailEnderSec: number;   // 106%
    offlineSec: number;     // 107%
  };
  fastestCar?: string;
  recordLaptimeSec?: number;
}

export interface LapCategoryShift {
  driverName: string;
  lapTimeSec: number;
  lapTimeString: string;
  sessionId: string;
  sessionName: string;
  lapNumber: number;
  oldCategory: PaceCategory;
  newCategory: PaceCategory;
}

export interface BenchmarkItemImpact {
  affectedSessionsCount: number;
  affectedLapsCount: number;
  categoryShiftsCount: number;
  categoryShifts: LapCategoryShift[];
}

export interface ReferenceBenchmarkDiffItem {
  key: string;
  trackName: string;
  carClass: string;
  patch: string;
  type: 'added' | 'updated' | 'removed';
  oldAlienSec?: number;
  newAlienSec?: number;
  oldAlienTimeString?: string;
  newAlienTimeString?: string;
  diffSec?: number;
  oldPatch?: string;
  newPatch?: string;
  impact?: BenchmarkItemImpact;
}

export interface ReferenceBenchmarkDiff {
  id?: number;
  timestamp: string;
  hasChanges: boolean;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  totalEntries: number;
  totalAffectedSessions?: number;
  totalCategoryShifts?: number;
  /** Version of the rule the impact was computed with (BENCHMARK_IMPACT_RULE); older diffs are recomputed. */
  impactRule?: number;
  added: ReferenceBenchmarkDiffItem[];
  updated: ReferenceBenchmarkDiffItem[];
  removed: ReferenceBenchmarkDiffItem[];
}

export interface BenchmarkDiffSummary {
  id: number;
  timestamp: string;
  hasChanges: boolean;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  totalEntries: number;
  totalAffectedSessions: number;
  totalCategoryShifts: number;
}

export interface ReferenceLaptimesCache {
  lastUpdated: string; // ISO string timestamp
  sourceUrl: string;
  entriesCount: number;
  entries: Record<string, ReferenceLaptimeEntry>;
  lastUpdateDiff?: ReferenceBenchmarkDiff | null;
}
