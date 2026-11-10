import zlib from 'zlib';

// Bumping REPLAY_CACHE_VERSION needs a one-time offline migration: re-decode the on-disk replays
// with the server stopped, and rewrite and relabel the rows of replays LMU has deleted, whose rows
// are the only copy left. The app reads the current version only: every stored row carries it.
// v6: calibrated ambient temp formula, Virtual Energy (1/51), contact events (1/17), tyre compounds (1/16), removal of fake trackTemp
// v7: event classes read without the race-session bit (29), so practice / qualifying replays get
//     weather, tyre compounds, contacts, Virtual Energy and flags; penalties decoded from class 3.
// v8: per-sample headlights (pose byte 2, 0x10).
// v9: events matched by opcode (docs/VCR_FORMAT.md §3), timed with their header offset; the full
//     6-bit throttle, four brake temperatures, wheel angular speed, suspension deflection, wheel load
//     and tyre slide speed; pit state names, no fuel; no detached part state or track lights as flags.
// v10: measured longitudinal and lateral G, yaw rate and car-frame velocity from every pose (ISO 8855).
//     Replays whose file is gone keep their v9 rows, relabelled v10.
// Stored rows hold what the app serves (garage state, ISO 8855 steering and motion, Virtual
// Energy, calibrated ambient): a rule change rewrites the rows offline instead of adding a
// read-time adapter. The current storage contract is docs/REPLAY_CACHE_FORMAT.md.
export const REPLAY_CACHE_VERSION = 'v10';

// v10: pedals and tyre wear are scaled to percent once per channel, not per sample (v9 turned a
// pedal passing through 0-1 % into a 0-100 % spike).
// v11: the gear, ABS and TC state at the lap start is the last change before it, however long ago
// (v10 looked back 5 s for gear and 1 s for ABS/TC, and started a lap on a long straight in gear 1).
export const DUCKDB_TELEMETRY_CACHE_VERSION = 'v11';

// Replay JSON blobs (esp. full-resolution trajectories with thousands of points) are
// large and highly repetitive, so brotli gives a much better ratio than gzip for a
// one-time write / many-read cache like this.
export function compressJson(value: unknown): Buffer {
  return zlib.brotliCompressSync(Buffer.from(JSON.stringify(value), 'utf8'), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
  });
}

export function decompressJson<T>(buf: Buffer): T {
  return JSON.parse(zlib.brotliDecompressSync(buf).toString('utf8')) as T;
}
