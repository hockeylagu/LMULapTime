import type { Database } from 'better-sqlite3';
import { PIT_LANE_LOSS_SAMPLES } from '../../../shared/domain/live/livePitLane.js';
import { median } from '../../../shared/domain/pitStops.js';

export interface PitLaneLossRow {
  /** One stop: its recording (or live session) and in-lap, so a backfill run again replaces it. */
  stopKey: string;
  layoutKey: string;
  carClass: string;
  lossSeconds: number;
  measuredAt: number;
}

export function recordPitLaneLoss(db: Database, row: PitLaneLossRow): void {
  db.prepare(`INSERT INTO live_pit_lane_losses(stop_key,layout_key,car_class,loss_seconds,measured_at) VALUES(?,?,?,?,?)
    ON CONFLICT(stop_key) DO UPDATE SET layout_key=excluded.layout_key,car_class=excluded.car_class,
      loss_seconds=excluded.loss_seconds,measured_at=excluded.measured_at`)
    .run(row.stopKey, row.layoutKey, row.carClass, row.lossSeconds, row.measuredAt);
}

/** The median pit lane loss of the newest stops on one layout in one class; null before a stop is stored. */
export function readPitLaneLoss(db: Database, layoutKey: string, carClass: string): number | null {
  const rows = db.prepare(`SELECT loss_seconds FROM live_pit_lane_losses WHERE layout_key=? AND car_class=?
    ORDER BY measured_at DESC LIMIT ?`).all(layoutKey, carClass, PIT_LANE_LOSS_SAMPLES) as Array<{ loss_seconds: number }>;
  return median(rows.map(row => row.loss_seconds));
}
