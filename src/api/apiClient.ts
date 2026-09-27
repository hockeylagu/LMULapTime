/**
 * The one way the client talks to the API server. Paths are relative (`/api/...`) so requests go
 * through the page's origin: the Vite dev proxy in development, the API server itself otherwise.
 *
 * A non-2xx response is an ApiError carrying the server's `{ error }` message, so a failed request
 * is never mistaken for an empty result and the user sees why it failed.
 */
export class ApiError extends Error {
  /** body: the parsed JSON error response (null when it was not JSON), for fields beyond the message. */
  public constructor(message: string, public readonly status: number, public readonly body: unknown = null) {
    super(message);
    this.name = 'ApiError';
  }
}

async function toApiError(response: Response, path: string): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error
    ? body.error
    : `Request to ${path.split('?')[0]} failed (HTTP ${response.status})`;
  return new ApiError(message, response.status, body);
}

/** GETs (or sends `init`) and returns the parsed JSON body; throws ApiError on a non-2xx status. */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await (init ? fetch(path, init) : fetch(path));
  if (!response.ok) throw await toApiError(response, path);
  return response.json() as Promise<T>;
}

/** POSTs `body` as JSON and returns the parsed JSON response; throws ApiError on a non-2xx status. */
export function postJson<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return fetchJson<T>(path, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** True for the rejection of a request its AbortController cancelled: not an error to show. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** The message to show for a failed request. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
