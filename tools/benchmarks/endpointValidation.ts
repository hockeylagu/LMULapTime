import type { BenchmarkCase } from './endpointInventory.js';

/** A successful HTTP status alone cannot make an empty workload a representative benchmark. */
export function validateBenchmarkResponse(item: BenchmarkCase, body: unknown): number | undefined {
  if (!item.requiredCollection) return undefined;
  const collection = typeof body === 'object' && body !== null && item.requiredCollection in body
    ? (body as Record<string, unknown>)[item.requiredCollection] : undefined;
  if (!Array.isArray(collection) || collection.length === 0) {
    throw new Error(`Expected non-empty ${item.requiredCollection} for ${item.id}; check the fixed cohort's identities and available data.`);
  }
  return collection.length;
}
