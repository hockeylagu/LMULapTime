export interface SharedJsonResponse {
  ok: boolean;
  status: number;
  /** The parsed body, or null when it is not JSON. */
  body: unknown;
}

const inFlight = new Map<string, Promise<SharedJsonResponse>>();

/**
 * GETs a JSON URL, sharing one request between identical calls made while it is in flight.
 *
 * The inspector's loads are effects: React's StrictMode (dev) mounts them twice, and a lap
 * opened with a comparison asks for the same replay's metadata from two effects. The server
 * decodes laps on one thread, so each duplicate delayed the others by ~1 s on a Le Mans lap.
 * Nothing is cached once the request settles.
 */
export function fetchJsonShared(url: string): Promise<SharedJsonResponse> {
  const pending = inFlight.get(url);
  if (pending) return pending;
  const request = fetch(url)
    .then(async (response): Promise<SharedJsonResponse> => ({
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => null),
    }))
    .finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}
