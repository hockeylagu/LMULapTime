import type {
  ReferenceLaptimesCache,
  ReferenceBenchmarkDiff,
  BenchmarkDiffSummary,
} from '../../shared/types/index.js';
import { fetchJson } from './apiClient.js';

// The benchmark table changes only when it is refreshed (Settings, or the check at server start),
// so every view shares one request until invalidateReferenceLaptimes is called.
let pending: Promise<ReferenceLaptimesCache> | null = null;
let loaded: ReferenceLaptimesCache | null = null;

/** The table already loaded, for a first render without waiting; null before the first load. */
export function peekReferenceLaptimes(): ReferenceLaptimesCache | null {
  return loaded;
}

export function loadReferenceLaptimes(): Promise<ReferenceLaptimesCache> {
  if (!pending) {
    const request = fetchJson<ReferenceLaptimesCache>('/api/reference-laptimes');
    pending = request;
    request.then(
      table => { if (pending === request) loaded = table; },
      // A failed request is not kept: the next view asks again.
      () => { if (pending === request) pending = null; },
    );
  }
  return pending;
}

/** Called after the benchmark table was refreshed, so the next load reads the new one. */
export function invalidateReferenceLaptimes(): void {
  pending = null;
  loaded = null;
}

export function fetchBenchmarkDiffHistory(): Promise<BenchmarkDiffSummary[]> {
  return fetchJson<BenchmarkDiffSummary[]>('/api/reference-laptimes/diffs');
}

export function fetchBenchmarkDiffById(id: number): Promise<ReferenceBenchmarkDiff> {
  return fetchJson<ReferenceBenchmarkDiff>(`/api/reference-laptimes/diffs/${id}`);
}
