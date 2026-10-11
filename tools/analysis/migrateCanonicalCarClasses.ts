import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.resolve('server/lmu_cache.db');
console.log(`Connecting to database at ${dbPath}...`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const hasTable = (name: string): boolean =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));

db.transaction(() => {
  // Canonical car classes migration
  // ('Hyper', 'GT3', 'LMP2', 'LMP2_ELMS', 'LMP3', 'GTE')
  if (hasTable('sessions')) {
    const s1 = db.prepare(`UPDATE sessions SET player_car_class = 'Hyper' WHERE player_car_class IN ('LMH', 'Hypercar')`).run();
    const s2 = db.prepare(`UPDATE sessions SET player_car_class = 'GT3' WHERE player_car_class IN ('LMGT3', 'GT3_ELMS')`).run();
    const s3 = db.prepare(`UPDATE sessions SET player_car_class = 'LMP2' WHERE player_car_class IN ('LMP2wec', 'LMP2 (WEC)')`).run();
    const s4 = db.prepare(`UPDATE sessions SET player_car_class = 'LMP2_ELMS' WHERE player_car_class IN ('LMP2elms', 'LMP2 (ELMS)')`).run();
    console.log(`sessions player_car_class updated: Hyper=${s1.changes}, GT3=${s2.changes}, LMP2=${s3.changes}, LMP2_ELMS=${s4.changes}`);
  }

  if (hasTable('session_drivers')) {
    const d1 = db.prepare(`UPDATE session_drivers SET driver_class = 'Hyper' WHERE driver_class IN ('LMH', 'Hypercar')`).run();
    const d2 = db.prepare(`UPDATE session_drivers SET driver_class = 'GT3' WHERE driver_class IN ('LMGT3', 'GT3_ELMS')`).run();
    const d3 = db.prepare(`UPDATE session_drivers SET driver_class = 'LMP2' WHERE driver_class IN ('LMP2wec', 'LMP2 (WEC)')`).run();
    const d4 = db.prepare(`UPDATE session_drivers SET driver_class = 'LMP2_ELMS' WHERE driver_class IN ('LMP2elms', 'LMP2 (ELMS)')`).run();
    console.log(`session_drivers driver_class updated: Hyper=${d1.changes}, GT3=${d2.changes}, LMP2=${d3.changes}, LMP2_ELMS=${d4.changes}`);
  }

  if (hasTable('session_summary_facts')) {
    const f1 = db.prepare(`UPDATE session_summary_facts SET car_class = 'Hyper' WHERE car_class IN ('LMH', 'Hypercar')`).run();
    const f2 = db.prepare(`UPDATE session_summary_facts SET car_class = 'GT3' WHERE car_class IN ('LMGT3', 'GT3_ELMS')`).run();
    const f3 = db.prepare(`UPDATE session_summary_facts SET car_class = 'LMP2' WHERE car_class IN ('LMP2wec', 'LMP2 (WEC)')`).run();
    const f4 = db.prepare(`UPDATE session_summary_facts SET car_class = 'LMP2_ELMS' WHERE car_class IN ('LMP2elms', 'LMP2 (ELMS)')`).run();
    console.log(`session_summary_facts car_class updated: Hyper=${f1.changes}, GT3=${f2.changes}, LMP2=${f3.changes}, LMP2_ELMS=${f4.changes}`);
  }

  if (hasTable('reference_laptimes')) {
    const r1 = db.prepare(`UPDATE reference_laptimes SET car_class = 'Hyper' WHERE car_class IN ('LMH', 'Hypercar')`).run();
    const r2 = db.prepare(`UPDATE reference_laptimes SET car_class = 'GT3' WHERE car_class IN ('LMGT3', 'GT3_ELMS')`).run();
    const r3 = db.prepare(`UPDATE reference_laptimes SET car_class = 'LMP2' WHERE car_class IN ('LMP2wec', 'LMP2 (WEC)')`).run();
    const r4 = db.prepare(`UPDATE reference_laptimes SET car_class = 'LMP2_ELMS' WHERE car_class IN ('LMP2elms', 'LMP2 (ELMS)')`).run();
    console.log(`reference_laptimes car_class updated: Hyper=${r1.changes}, GT3=${r2.changes}, LMP2=${r3.changes}, LMP2_ELMS=${r4.changes}`);
  }

  if (hasTable('rival_targets')) {
    const rv1 = db.prepare(`UPDATE rival_targets SET car_class = 'Hyper' WHERE car_class IN ('LMH', 'Hypercar')`).run();
    const rv2 = db.prepare(`UPDATE rival_targets SET car_class = 'GT3' WHERE car_class IN ('LMGT3', 'GT3_ELMS')`).run();
    const rv3 = db.prepare(`UPDATE rival_targets SET car_class = 'LMP2' WHERE car_class IN ('LMP2wec', 'LMP2 (WEC)')`).run();
    const rv4 = db.prepare(`UPDATE rival_targets SET car_class = 'LMP2_ELMS' WHERE car_class IN ('LMP2elms', 'LMP2 (ELMS)')`).run();
    console.log(`rival_targets car_class updated: Hyper=${rv1.changes}, GT3=${rv2.changes}, LMP2=${rv3.changes}, LMP2_ELMS=${rv4.changes}`);
  }
})();

console.log('Migration complete.');
db.close();
