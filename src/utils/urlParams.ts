export interface HashRouteAndParams {
  path: string;
  params: URLSearchParams;
}

export function getHashRouteAndParams(): HashRouteAndParams {
  const fullHash = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#\/?/, '');
  const qIndex = fullHash.indexOf('?');
  const path = qIndex !== -1 ? fullHash.substring(0, qIndex) : fullHash;
  const searchPart = qIndex !== -1
    ? fullHash.substring(qIndex + 1)
    : (typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '');

  return {
    path,
    params: new URLSearchParams(searchPart),
  };
}

export function updateHashParams(updates: Record<string, string | boolean | null | undefined>): void {
  if (typeof window === 'undefined') return;
  const { path, params } = getHashRouteAndParams();

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === '' || value === 'All' || value === 'date-desc') {
      params.delete(key);
    } else if (key === 'hideEmpty') {
      if (value === true) params.delete('hideEmpty');
      else params.set('hideEmpty', 'false');
    } else {
      params.set(key, String(value));
    }
  }

  const paramStr = params.toString();
  const newHash = `#/${path}${paramStr ? `?${paramStr}` : ''}`;
  window.history.replaceState(null, '', newHash);
}

export function setHashRoute(newPath: string, preserveParams = true): void {
  if (typeof window === 'undefined') return;
  const { params } = getHashRouteAndParams();
  const paramStr = preserveParams ? params.toString() : '';
  const cleanPath = newPath.replace(/^#?\/?/, '');
  window.location.hash = `#/${cleanPath}${paramStr ? `?${paramStr}` : ''}`;
}
