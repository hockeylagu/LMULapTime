import Database from 'better-sqlite3';
import zlib from 'node:zlib';

const db = new Database('server/lmu_cache.db', { readonly: true });
const rows = db.prepare(`
  SELECT trajectory_br FROM replay_trajectories WHERE lap_key >= 0 ORDER BY RANDOM() LIMIT 30
`).all();

function encode(trajectory) {
  const { points, ...rest } = trajectory;
  if (!points || points.length === 0) return trajectory;
  const keys = [...new Set(points.flatMap(Object.keys))];
  const constants = {};
  const columns = {};
  for (const key of keys) {
    const firstJson = JSON.stringify(points[0][key]);
    if (points.every(p => JSON.stringify(p[key]) === firstJson) && points[0][key] !== undefined) {
      constants[key] = points[0][key];
    } else {
      columns[key] = points.map(p => (p[key] === undefined ? null : p[key]));
    }
  }
  return { ...rest, pointsFormat: 'columnar', pointsLength: points.length, constants, columns };
}

const totals = { base: 0, q6: 0, q9: 0, q11: 0, t6: 0, t9: 0, t11: 0, pts: 0 };

for (const row of rows) {
  const original = JSON.parse(zlib.brotliDecompressSync(row.trajectory_br).toString('utf8'));
  const json = Buffer.from(JSON.stringify(encode(original)), 'utf8');
  totals.base += row.trajectory_br.length;
  totals.pts += original.points?.length || 0;

  for (const [quality, sizeKey, timeKey] of [[6, 'q6', 't6'], [9, 'q9', 't9'], [11, 'q11', 't11']]) {
    const t = Date.now();
    const out = zlib.brotliCompressSync(json, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
        [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: json.length,
      },
    });
    totals[timeKey] += Date.now() - t;
    totals[sizeKey] += out.length;
  }
}

const mb = (n) => (n / 1048576).toFixed(1);
console.log(`random sample: ${rows.length} laps, ${totals.pts.toLocaleString()} points`);
console.log(`current q6 objects : ${mb(totals.base).padStart(6)} MB  100%`);
for (const [label, sizeKey, timeKey] of [['columnar q6 ', 'q6', 't6'], ['columnar q9 ', 'q9', 't9'], ['columnar q11', 'q11', 't11']]) {
  const pct = ((totals[sizeKey] / totals.base) * 100).toFixed(1);
  const perLap = (totals[timeKey] / rows.length).toFixed(0);
  console.log(`${label}       : ${mb(totals[sizeKey]).padStart(6)} MB  ${pct.padStart(5)}%   encode ${String(totals[timeKey]).padStart(6)} ms total, ${perLap} ms/lap`);
}

const rowCount = db.prepare('SELECT COUNT(*) c FROM replay_trajectories').get().c;
const totalBytes = db.prepare('SELECT SUM(LENGTH(trajectory_br)) b FROM replay_trajectories').get().b;
console.log(`\nprojected over ${rowCount} rows (${mb(totalBytes)} MB):`);
for (const [label, sizeKey, timeKey] of [['q6 ', 'q6', 't6'], ['q9 ', 'q9', 't9'], ['q11', 'q11', 't11']]) {
  const ratio = totals[sizeKey] / totals.base;
  const migMin = ((totals[timeKey] / rows.length) * rowCount) / 60000;
  console.log(`  ${label}: ${mb(totalBytes * ratio).padStart(7)} MB  (saves ${mb(totalBytes * (1 - ratio))} MB)   migration ~${migMin.toFixed(0)} min`);
}

db.close();
