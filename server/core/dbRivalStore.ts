import { Database as DatabaseType } from 'better-sqlite3';
import type { RivalKind, RivalTarget, RivalTargetStatus } from '../../shared/types/leaderboard.js';
import type { NewRivalTarget, RivalResolution } from '../../shared/domain/rivals.js';

/** The board a rival belongs to: a layout and class, and the car when the board is one car's. */
export interface RivalScope {
  layoutKey: string;
  carClass: string;
  /** '' for the whole class. */
  carType: string;
}

interface RivalRow {
  id: number;
  kind: string;
  driver_name: string | null;
  target_time: number;
  start_time: number;
  pinned: number;
  status: string;
  set_at: number;
  ended_at: number | null;
  beaten_time: number | null;
  beaten_session_id: string | null;
}

const COLUMNS = 'id, kind, driver_name, target_time, start_time, pinned, status, set_at, ended_at, beaten_time, beaten_session_id';
const IN_SCOPE = 'layout_key = ? AND car_class = ? AND car_type = ?';
const scopeArgs = (scope: RivalScope) => [scope.layoutKey, scope.carClass, scope.carType];

const toTarget = (row: RivalRow): RivalTarget => ({
  id: row.id,
  kind: row.kind as RivalKind,
  driverName: row.driver_name,
  targetTime: row.target_time,
  startTime: row.start_time,
  pinned: row.pinned === 1,
  status: row.status as RivalTargetStatus,
  setAt: row.set_at,
  endedAt: row.ended_at,
  beatenTime: row.beaten_time,
  beatenSessionId: row.beaten_session_id,
});

export function getActiveRival(db: DatabaseType, scope: RivalScope): RivalTarget | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM rival_targets WHERE ${IN_SCOPE} AND status = 'active' ORDER BY id DESC LIMIT 1`)
    .get(...scopeArgs(scope)) as RivalRow | undefined;
  return row ? toTarget(row) : null;
}

/** The rivals the player beat on this board, the latest first. */
export function getBeatenRivals(db: DatabaseType, scope: RivalScope): RivalTarget[] {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM rival_targets WHERE ${IN_SCOPE} AND status = 'beaten' ORDER BY ended_at DESC, id DESC`)
    .all(...scopeArgs(scope)) as RivalRow[];
  return rows.map(toTarget);
}

function insertTarget(db: DatabaseType, scope: RivalScope, target: NewRivalTarget): number {
  const result = db.prepare(`
    INSERT INTO rival_targets (layout_key, car_class, car_type, kind, driver_name, target_time, start_time, pinned, status, set_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(...scopeArgs(scope), target.kind, target.driverName, target.targetTime, target.startTime, target.pinned ? 1 : 0, target.setAt);
  return Number(result.lastInsertRowid);
}

/** Stores what resolving the rival changed, in one transaction; returns the active target's id. */
export function applyRivalResolution(db: DatabaseType, scope: RivalScope, resolution: RivalResolution): number | null {
  return db.transaction(() => {
    if (resolution.retimed) {
      db.prepare('UPDATE rival_targets SET target_time = ? WHERE id = ?').run(resolution.retimed.targetTime, resolution.retimed.id);
    }
    if (resolution.replaced) {
      db.prepare(`UPDATE rival_targets SET status = 'replaced', ended_at = ? WHERE id = ?`)
        .run(resolution.replaced.endedAt, resolution.replaced.id);
    }
    if (resolution.beaten) {
      const b = resolution.beaten;
      db.prepare(`UPDATE rival_targets SET status = 'beaten', ended_at = ?, beaten_time = ?, beaten_session_id = ? WHERE id = ?`)
        .run(b.endedAt, b.beatenTime, b.beatenSessionId, b.id);
    }
    if (resolution.created) return insertTarget(db, scope, resolution.created);
    return resolution.active?.id ?? null;
  })();
}

/** Makes a driver the player chose the active rival of the board. */
export function pinRival(db: DatabaseType, scope: RivalScope, target: NewRivalTarget): number {
  return db.transaction(() => {
    db.prepare(`UPDATE rival_targets SET status = 'replaced', ended_at = ? WHERE ${IN_SCOPE} AND status = 'active'`)
      .run(target.setAt, ...scopeArgs(scope));
    return insertTarget(db, scope, target);
  })();
}
