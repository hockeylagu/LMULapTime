import type { CornerHabitTrend } from './cornerAnalysis.js';

/** The driver through one corner in one session: the counted dry passes' usual (median) and best. */
export interface CornerTrendPoint {
  sessionId: string;
  timestamp: number;
  sessionType: string;
  sessionName: string;
  carType: string;
  passCount: number;
  usualSec: number;
  bestSec: number;
}

/** A corner of the layout (a sequence of the class's map, else an official turn), its sessions oldest first. */
export interface CornerTrend {
  id: number;
  label: string;
  /** Its turns ("Lesmo 1, Lesmo 2 (T6–T7)") or the turn's number and name; the title explains it further. */
  name: string;
  title: string;
  points: CornerTrendPoint[];
  /** The class's fastest usual through the corner by another driver, any session at the layout; null without one. */
  reference: { usualSec: number } | null;
  /** The corner's habit over the latest analysed sessions (shared/domain/cornerAnalysis/habitHistory.ts); null without one. */
  habit: CornerHabitTrend | null;
}

export interface CornerTrendsResponse {
  corners: CornerTrend[];
  /** The player's sessions of the class at the layout, and why those without a point have none. */
  sessions: {
    total: number;
    /** No replay stored for it: no passes. */
    noReplay: number;
    /** Its replay's passes are not built, or come from an older build or map: they wait for the rebuild. */
    waiting: number;
    /** Current passes, but fewer than `minPasses` counted passes in every corner. */
    tooFewPasses: number;
  };
}
