/** Strict readers for package JSON: a wrong shape throws with the offending field named, never defaults. */
export function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${what}: expected an object`);
  return value as Record<string, unknown>;
}

/** The object has exactly these keys: none missing, none unknown. */
export function exactKeys(value: Record<string, unknown>, keys: readonly string[], what: string): void {
  const unknown = Object.keys(value).filter(key => !keys.includes(key)), missing = keys.filter(key => value[key] === undefined);
  if (unknown.length || missing.length) throw Error(`${what}: ${unknown.length ? `unknown field ${unknown[0]}` : `missing field ${missing[0]}`}`);
}

/** Required keys plus optional ones; nothing else. */
export function knownKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[], what: string): void {
  const unknown = Object.keys(value).filter(key => !required.includes(key) && !optional.includes(key)), missing = required.filter(key => value[key] === undefined);
  if (unknown.length || missing.length) throw Error(`${what}: ${unknown.length ? `unknown field ${unknown[0]}` : `missing field ${missing[0]}`}`);
}

export function array(value: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw Error(`${what}: expected an array of at most ${max}`);
  return value as unknown[];
}

export function text(value: unknown, what: string, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`${what}: expected a non-empty string`);
  return value;
}

export function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(`${what}: expected a finite number`);
  return value;
}

export function nonNegative(value: unknown, what: string): number {
  const n = finite(value, what);
  if (n < 0) throw Error(`${what}: expected a non-negative number`);
  return n;
}

export function count(value: unknown, what: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw Error(`${what}: expected a count`);
  return value;
}

export function sha256(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error(`${what}: expected a sha256`);
  return value;
}

export function vec3(value: unknown, what: string, limit = 100_000): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw Error(`${what}: expected three numbers`);
  const result = value.map(n => finite(n, what));
  if (result.some(n => Math.abs(n) > limit)) throw Error(`${what}: coordinate out of range`);
  return result as [number, number, number];
}

/**
 * A texture row's `start`: the texture's start file, a content-named KTX2 in the same `folder` (`scenery` or `vehicles`). `full`
 * is the row's own size where the row states it: a start file is that texture from its third level down, and only a texture
 * with more than two levels and a smaller side of at least 512 px has one.
 */
export function textureStart(value: unknown, folder: string, full: { width: number; height: number; levels: number } | null, what: string): void {
  const start = record(value, what);
  exactKeys(start, ['asset', 'sha256', 'byteLength', 'width', 'height', 'levels', 'gpuBytes'], what);
  if (start.asset !== `${folder}/textures/${sha256(start.sha256, `${what}.sha256`)}.ktx2.zst`) throw Error(`${what}: asset is not the content-named KTX2`);
  for (const key of ['byteLength', 'width', 'height', 'levels', 'gpuBytes']) if (count(start[key], `${what}.${key}`) === 0) throw Error(`${what}.${key}: must be positive`);
  if (!full) return;
  if (full.levels <= 2 || Math.min(full.width, full.height) < 512) throw Error(`${what}: the texture is too small for a start file`);
  if (start.width !== full.width >> 2 || start.height !== full.height >> 2 || start.levels !== full.levels - 2) throw Error(`${what}: not the texture from its third level down`);
}
