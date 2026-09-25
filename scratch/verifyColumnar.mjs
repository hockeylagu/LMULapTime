import Database from 'better-sqlite3';
import zlib from 'node:zlib';

const db = new Database('server/lmu_cache.db', { readonly: true });

const total = db.prepare('SELECT COUNT(*) c, SUM(LENGTH(trajectory_br)) b FROM replay_trajectories').get();
console.log('trajectory rows :', total.c);
console.log('trajectory MB   :', (total.b / 1048576).toFixed(1));

// Sample across the library and confirm every blob decodes to usable points.
const rows = db.prepare(`
  SELECT filename, driver_slot, lap_key, points_count, trajectory_br
  FROM replay_trajectories ORDER BY RANDOM() LIMIT 400
`).all();

let columnar = 0, legacy = 0, bad = 0, mismatched = 0;
for (const row of rows) {
  try {
    const parsed = JSON.parse(zlib.brotliDecompressSync(row.trajectory_br).toString('utf8'));
    if (parsed.pointsFormat === 'columnar') {
      columnar++;
      const keys = Object.keys(parsed.columns);
      const length = keys.length > 0 ? parsed.columns[keys[0]].length : parsed.pointsLength;
      if (length !== parsed.pointsLength || parsed.pointsLength !== row.points_count) mismatched++;
    } else {
      legacy++;
      if ((parsed.points?.length ?? -1) !== row.points_count) mismatched++;
    }
  } catch {
    bad++;
  }
}
console.log(`\nsampled ${rows.length}: columnar=${columnar} legacy=${legacy} undecodable=${bad} countMismatch=${mismatched}`);

const biggest = db.prepare(`
  SELECT filename, driver_slot, lap_key, points_count, trajectory_br
  FROM replay_trajectories ORDER BY LENGTH(trajectory_br) DESC LIMIT 1
`).get();
const parsed = JSON.parse(zlib.brotliDecompressSync(biggest.trajectory_br).toString('utf8'));
console.log(`\nlargest row: ${biggest.filename} slot=${biggest.driver_slot} lap=${biggest.lap_key}`);
console.log(`  format=${parsed.pointsFormat} pointsLength=${parsed.pointsLength} points_count=${biggest.points_count}`);
console.log(`  constants=[${Object.keys(parsed.constants || {}).join(',')}]`);
console.log(`  channels=${Object.keys(parsed.columns || {}).length}`);

db.close();
