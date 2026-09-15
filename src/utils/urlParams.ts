import type { SetURLSearchParams } from 'react-router';

export function updateSearchParams(
  currentParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
  updates: Record<string, string | boolean | null | undefined>
): void {
  const params = new URLSearchParams(currentParams);

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === '' || value === 'All' || value === 'date-desc' || (key === 'view' && value === 'grid')) {
      params.delete(key);
    } else if (key === 'hideEmpty') {
      if (value === true) params.delete('hideEmpty');
      else params.set('hideEmpty', 'false');
    } else {
      params.set(key, String(value));
    }
  }

  setSearchParams(params, { replace: true });
}
