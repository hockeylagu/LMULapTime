import zlib from 'zlib';

// Bumping REPLAY_CACHE_VERSION makes every replay on disk be decoded again (once per driver),
// and replays LMU has since deleted can never be: their rows are the only copy left. Only bump
// it when stored rows can no longer be read; a version whose rows the current code still reads
// correctly belongs in COMPATIBLE_REPLAY_CACHE_VERSIONS instead.
// v6: calibrated ambient temp formula, Virtual Energy (1/51), contact events (1/17), tyre compounds (1/16), removal of fake trackTemp
// v7: event classes read without the race-session bit (29), so practice / qualifying replays get
//     weather, tyre compounds, contacts, Virtual Energy and flags; penalties decoded from class 3.
// Garage state (inGarage, and inPit on the drive out of the garage) is recomputed on read from the
// pit events for every version (withGarageState, replayTrajectoryCodec.ts), so it needed no bump.
// If a later bump rewrites every stored row, deleted replays included, drop that adapter.
export const REPLAY_CACHE_VERSION = 'v7';
export const COMPATIBLE_REPLAY_CACHE_VERSIONS: ReadonlySet<string> = new Set([
  REPLAY_CACHE_VERSION,
  // Race replays match v7 except penalties; practice / qualifying rows lack the events above.
  'v6',
  'v5',
  // Written by an unreleased build that also stored each lap's edge samples (now derived from
  // the neighbouring lap rows on read); otherwise identical to v3.
  'v4',
  // Preserves full backwards compatibility with v3 cached trajectories and metadata (lossy 0.01s/0.01m/integer km/h)
  'v3',
]);

export function isCompatibleReplayCacheVersion(version: string): boolean {
  return COMPATIBLE_REPLAY_CACHE_VERSIONS.has(version);
}
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
