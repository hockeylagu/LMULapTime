import Database from 'better-sqlite3';
import zlib from 'node:zlib';

const db = new Database('server/lmu_cache.db', { readonly: true });
const rows = db.prepare(`
  SELECT filename, lap_key, trajectory_br, points_count FROM replay_trajectories
  ORDER BY LENGTH(trajectory_br) DESC LIMIT 3
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

for (const row of rows) {
  const original = JSON.parse(zlib.brotliDecompressSync(row.trajectory_br).toString('utf8'));
  const encoded = encode(original);
  const json = Buffer.from(JSON.stringify(encoded), 'utf8');
  console.log(`\n${row.filename.slice(0, 40)} lap ${row.lap_key}  ${row.points_count} pts  raw ${(json.length / 1048576).toFixed(1)} MB  current ${(row.trajectory_br.length / 1024).toFixed(0)} KB`);

  for (const quality of [5, 6, 9, 10, 11]) {
    const t0 = Date.now();
    const out = zlib.brotliCompressSync(json, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
        [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: json.length,
      },
    });
    const encodeMs = Date.now() - t0;
    const t1 = Date.now();
    zlib.brotliDecompressSync(out);
    const decodeMs = Date.now() - t1;
    console.log(`  q${String(quality).padStart(2)}  ${(out.length / 1024).toFixed(0).padStart(6)} KB  ${((out.length / row.trajectory_br.length) * 100).toFixed(1).padStart(5)}% of current   encode ${String(encodeMs).padStart(6)} ms   decode ${String(decodeMs).padStart(4)} ms`);
  }
}

db.close();
