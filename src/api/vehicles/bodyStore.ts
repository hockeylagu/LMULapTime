import { fetchBody, type BodyFolders, type LoadedBody } from './bodyApi.js';

export interface BodyStore {
  /**
   * The body serving a VEH id, fetched once per id and package revision: every car of a livery, and every scene of the page, shares
   * it. A failed fetch is forgotten, so the next request tries again. `packageRevision` checks the body against the scene's
   * package (undefined: unchecked). The liveries of a body share one fetch of what they read alike (`BodyFolders`).
   */
  body(vehicleId: string, packageRevision: string | undefined): Promise<LoadedBody>;
  /** Stops the fetches in flight and forgets every body. */
  dispose(): void;
}

/**
 * A page's 3D bodies. `limit` keeps only the most recently requested bodies (the lap view: the laps it shows and a few before);
 * without it the store keeps every body (the race: every livery of the field).
 */
export function createBodyStore(limit = Infinity): BodyStore {
  const controller = new AbortController(), bodies = new Map<string, Promise<LoadedBody>>(), folders: BodyFolders = new Map();
  return {
    body(vehicleId, packageRevision) {
      const key = `${vehicleId}:${packageRevision ?? ''}`;
      let pending = bodies.get(key);
      if (!pending) {
        pending = fetchBody(vehicleId, packageRevision, controller.signal, folders);
        const own = pending;
        own.catch(() => { if (bodies.get(key) === own) bodies.delete(key); });
      }
      // Most recent last: the oldest goes first past the limit.
      bodies.delete(key); bodies.set(key, pending);
      // Past the limit, the shared reads go too: the bodies kept still hold theirs, and a body fetched again reads them afresh.
      while (bodies.size > limit) { bodies.delete(bodies.keys().next().value!); folders.clear(); }
      return pending;
    },
    dispose() { controller.abort(); bodies.clear(); folders.clear(); },
  };
}
