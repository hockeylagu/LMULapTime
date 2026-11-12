// Copied from LMUTrackPipeline/shared/contract/strict.ts, do not edit: change it there and run npm run package -- sync-contract.
/**
 * Strict readers for already-parsed package JSON: a wrong shape throws an `Error` naming the offending field, never defaults. Dependency-free
 * and environment-free (no Node or browser API): the shape of a package is parsed identically by the pipeline and by the app.
 */
export type Obj = Record<string, unknown>;

export const SHA256 = /^[0-9a-f]{64}$/;
export type Vec3 = [number, number, number];

export function record(value: unknown, what: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${what}: expected an object`);
  return value as Obj;
}

/** The object has exactly these keys: none missing, none unknown. */
export function exactKeys(value: Obj, keys: readonly string[], what: string): void {
  const unknown = Object.keys(value).filter(key => !keys.includes(key)), missing = keys.filter(key => value[key] === undefined);
  if (unknown.length || missing.length) throw Error(`${what}: ${unknown.length ? `unknown field ${unknown[0]}` : `missing field ${missing[0]}`}`);
}

/** Exactly these keys, in this order (the order a published file writes them). */
export function orderedKeys(value: Obj, keys: readonly string[], what: string): void {
  exactKeys(value, keys, what);
  const at = Object.keys(value).findIndex((key, i) => key !== keys[i]);
  if (at >= 0) throw Error(`${what}: field ${Object.keys(value)[at]} is out of order, expected ${keys[at]}`);
}

/** Required keys plus optional ones; nothing else. */
export function knownKeys(value: Obj, required: readonly string[], optional: readonly string[], what: string): void {
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

export function positive(value: unknown, what: string): number {
  const n = finite(value, what);
  if (n <= 0) throw Error(`${what}: must be positive`);
  return n;
}

/** A number from 0 to 1. */
export function unit(value: unknown, what: string): number {
  const n = nonNegative(value, what);
  if (n > 1) throw Error(`${what}: above 1`);
  return n;
}

export function count(value: unknown, what: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw Error(`${what}: expected a count`);
  return value;
}

/** A count of at least one. */
export function positiveCount(value: unknown, what: string, max = Number.MAX_SAFE_INTEGER): number {
  if (count(value, what, max) === 0) throw Error(`${what}: must be positive`);
  return value as number;
}

export function sha256(value: unknown, what: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw Error(`${what}: expected a sha256 (64 lower-case hex digits)`);
  return value;
}

export function flag(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') throw Error(`${what}: expected true or false`);
  return value;
}

export function vec3(value: unknown, what: string, limit = 100_000): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw Error(`${what}: expected three numbers`);
  const result = value.map(n => finite(n, what));
  if (result.some(n => Math.abs(n) > limit)) throw Error(`${what}: coordinate out of range`);
  return result as Vec3;
}

/** Elements of `value` as strings that are strictly ascending (code-unit order). */
export function sortedUnique(values: readonly string[], what: string): void {
  values.forEach((entry, i) => { if (i > 0 && !(values[i - 1] < entry)) throw Error(`${what}: expected sorted, unique entries (at ${entry})`); });
}

/** Deep equality of parsed JSON values, ignoring object key order. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every(key => Object.hasOwn(b, key) && sameJson((a as Obj)[key], (b as Obj)[key]));
}
