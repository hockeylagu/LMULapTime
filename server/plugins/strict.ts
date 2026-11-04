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
