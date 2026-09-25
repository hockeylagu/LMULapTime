import Database from 'better-sqlite3';
import zlib from 'node:zlib';

const db = new Database('server/lmu_cache.db', { readonly: true });

const rows = db.prepare(`
  SELECT filename, driver_slot, lap_key, trajectory_br FROM replay_trajectories
  ORDER BY LENGTH(trajectory_br) DESC LIMIT 8
`).all();

const q = (v, quality, lgwin) => zlib.brotliCompressSync(Buffer.from(JSON.stringify(v), 'utf8'), {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
    ...(lgwin ? { [zlib.constants.BROTLI_PARAM_LGWIN]: lgwin } : {}),
  },
}).length;

/** Lossless: no rounding. Constant channels hoisted, varying channels become arrays. */
function encode(trajectory) {
  const { points, ...rest } = trajectory;
  if (!points || points.length === 0) return trajectory;

  const keys = [...new Set(points.flatMap(Object.keys))];
  const constants = {};
  const columns = {};

  for (const key of keys) {
    const first = points[0][key];
    const firstJson = JSON.stringify(first);
    let constant = points.length > 0 && points.every(p => JSON.stringify(p[key]) === firstJson);
    if (constant && first !== undefined) {
      constants[key] = first;
    } else {
      columns[key] = points.map(p => (p[key] === undefined ? null : p[key]));
    }
  }
  return { ...rest, pointsFormat: 'columnar', pointsLength: points.length, constants, columns };
}

function decode(encoded) {
  if (encoded.pointsFormat !== 'columnar') return encoded;
  const { pointsFormat, pointsLength, constants, columns, ...rest } = encoded;
  const points = [];
  const columnKeys = Object.keys(columns);
  for (let i = 0; i < pointsLength; i++) {
    const point = { ...constants };
    for (const key of columnKeys) {
      const value = columns[key][i];
      if (value !== null) point[key] = value;
    }
    points.push(point);
  }
  return { ...rest, points };
}

let base = 0, colQ6 = 0, colQ11 = 0;
let mismatches = 0;

/** Order-insensitive canonical JSON so key ordering differences are not treated as data loss. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',')}}`;
  }
  return JSON.stringify(value);
}

for (const row of rows) {
  const original = JSON.parse(zlib.brotliDecompressSync(row.trajectory_br).toString('utf8'));
  const encoded = encode(original);
  const decoded = decode(JSON.parse(JSON.stringify(encoded)));

  const a = canonical(original);
  const b = canonical(decoded);
  if (a !== b) {
    mismatches++;
    console.log(`  MISMATCH ${row.filename} lap ${row.lap_key}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) { console.log(`    first diff @${i}: ...${a.slice(i - 80, i + 80)} || ...${b.slice(i - 80, i + 80)}`); break; }
    }
  }

  base += row.trajectory_br.length;
  colQ6 += q(encoded, 6);
  colQ11 += q(encoded, 11, 24);
  console.log(`${row.filename.slice(0, 38).padEnd(40)} lap ${String(row.lap_key).padStart(3)}  ${String(original.points.length).padStart(7)} pts  const:[${Object.keys(encoded.constants).join(',')}]`);
}

const kb = (n) => (n / 1024).toFixed(0).padStart(8);
console.log(`\nround-trip mismatches: ${mismatches}/${rows.length}`);
console.log(`\ncurrent (q6, objects)      ${kb(base)} KB  100%`);
console.log(`columnar lossless q6       ${kb(colQ6)} KB  ${((colQ6 / base) * 100).toFixed(1)}%`);
console.log(`columnar lossless q11      ${kb(colQ11)} KB  ${((colQ11 / base) * 100).toFixed(1)}%`);

db.close();
