import Database from 'better-sqlite3';
import zlib from 'node:zlib';

const db = new Database('server/lmu_cache.db', { readonly: true });
const rows = db.prepare(`
  SELECT filename, lap_key, trajectory_br FROM replay_trajectories
  WHERE lap_key >= 0 ORDER BY LENGTH(trajectory_br) DESC LIMIT 6
`).all();

const q6 = (v) => zlib.brotliCompressSync(Buffer.from(JSON.stringify(v), 'utf8'), {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
}).length;
const q11 = (v) => zlib.brotliCompressSync(Buffer.from(JSON.stringify(v), 'utf8'), {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 },
}).length;

const r2 = (n) => (typeof n === 'number' ? Number(n.toFixed(2)) : n);
const kb = (n) => (n / 1024).toFixed(0).padStart(8);

let acc = { base: 0, noConst: 0, rounded: 0, columnar: 0, colQ11: 0 };

for (const row of rows) {
  const obj = JSON.parse(zlib.brotliDecompressSync(row.trajectory_br).toString('utf8'));
  const pts = obj.points;

  // 1. drop fields that never vary across the lap
  const keys = [...new Set(pts.flatMap((p) => Object.keys(p)))];
  const constKeys = keys.filter((k) => {
    const first = JSON.stringify(pts[0][k]);
    return pts.every((p) => JSON.stringify(p[k]) === first);
  });
  const noConst = { ...obj, points: pts.map((p) => {
    const c = { ...p };
    for (const k of constKeys) delete c[k];
    return c;
  }) };

  // 2. additionally round high-entropy floats to display precision
  const rounded = { ...noConst, points: noConst.points.map((p) => ({
    ...p,
    steerYaw: typeof p.steerYaw === 'number' ? Number(p.steerYaw.toFixed(4)) : p.steerYaw,
    rotX: r2(p.rotX), rotZ: r2(p.rotZ),
    engineRpm: typeof p.engineRpm === 'number' ? Math.round(p.engineRpm) : p.engineRpm,
    throttle: typeof p.throttle === 'number' ? Number(p.throttle.toFixed(3)) : p.throttle,
    brake: typeof p.brake === 'number' ? Number(p.brake.toFixed(3)) : p.brake,
    fuel: r2(p.fuel),
    brakeTemps: p.brakeTemps?.map((v) => Number(v.toFixed(1))),
    wheelSpeeds: p.wheelSpeeds?.map((v) => Number(v.toFixed(2))),
  })) };

  // 3. columnar: one array per channel instead of repeating key names
  const varKeys = keys.filter((k) => !constKeys.includes(k));
  const columns = {};
  for (const k of varKeys) columns[k] = rounded.points.map((p) => p[k] ?? null);
  const columnar = { ...rounded, points: undefined, columns };

  const base = row.trajectory_br.length;
  acc.base += base;
  acc.noConst += q6(noConst);
  acc.rounded += q6(rounded);
  acc.columnar += q6(columnar);
  acc.colQ11 += q11(columnar);

  console.log(`${row.filename.slice(0, 40).padEnd(42)} lap ${String(row.lap_key).padStart(3)}  ${pts.length} pts  const-dropped: ${constKeys.join(',') || 'none'}`);
}

console.log(`\n--- stored size for the 6 sampled laps ---`);
console.log(`current (brotli q6)              ${kb(acc.base)} KB   100%`);
console.log(`+ drop constant channels         ${kb(acc.noConst)} KB   ${((acc.noConst / acc.base) * 100).toFixed(1)}%`);
console.log(`+ round floats                   ${kb(acc.rounded)} KB   ${((acc.rounded / acc.base) * 100).toFixed(1)}%`);
console.log(`+ columnar layout                ${kb(acc.columnar)} KB   ${((acc.columnar / acc.base) * 100).toFixed(1)}%`);
console.log(`+ brotli q11                     ${kb(acc.colQ11)} KB   ${((acc.colQ11 / acc.base) * 100).toFixed(1)}%`);

db.close();
