/** The URL a mocked `fetch` was called with. */
export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/** The body of a mocked `fetch` call; tests post JSON strings. */
export function requestBody(body: BodyInit | null | undefined): string {
  return typeof body === 'string' ? body : '';
}
