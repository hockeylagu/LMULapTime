import { Database as DatabaseType } from 'better-sqlite3';
import type { HabitFocusPin } from '../../shared/types/corners/habitFocus.js';

/** The pins a focus reads: one layout and class. */
export type HabitFocusScope = Omit<HabitFocusPin, 'turnId'>;

const IN_SCOPE = 'layout_key = ? AND car_class = ?';
const scopeArgs = (scope: HabitFocusScope) => [scope.layoutKey, scope.carClass];

/** The pinned turns of the scope, the first pinned first. A pin follows the corner that holds its turn. */
export function listHabitFocusPins(db: DatabaseType, scope: HabitFocusScope): number[] {
  return (db.prepare(`SELECT turn_id FROM habit_focus_pins WHERE ${IN_SCOPE} GROUP BY turn_id ORDER BY MIN(set_at), turn_id`)
    .all(...scopeArgs(scope)) as Array<{ turn_id: number }>)
    .map(row => row.turn_id);
}

/** Pins a turn; pinning it again keeps the first pin's time. */
export function addHabitFocusPin(db: DatabaseType, pin: HabitFocusPin, setAt: number): void {
  db.prepare("INSERT OR IGNORE INTO habit_focus_pins (layout_key, car_class, car_model, turn_id, set_at) VALUES (?, ?, '', ?, ?)")
    .run(...scopeArgs(pin), pin.turnId, setAt);
}

export function removeHabitFocusPins(db: DatabaseType, scope: HabitFocusScope, turnIds: readonly number[]): void {
  const remove = db.prepare(`DELETE FROM habit_focus_pins WHERE ${IN_SCOPE} AND turn_id = ?`);
  db.transaction(() => { for (const turnId of turnIds) remove.run(...scopeArgs(scope), turnId); })();
}
