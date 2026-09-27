/**
 * Query-string readers for the routers. Express parses a repeated key (`?track=a&track=b`) into an
 * array and a bracketed one (`?track[x]=a`) into an object: a parameter that is not one string is
 * treated as absent instead of reaching string code.
 */
export function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** An integer parameter within [min, max]; undefined when absent. Throws `Invalid <name>` otherwise. */
export function parseBoundedInteger(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new Error(`Invalid ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${name}`);
  return parsed;
}
