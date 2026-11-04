import type { SetURLSearchParams } from 'react-router';

export function applySearchParamUpdates(
  currentParams: URLSearchParams,
  updates: Record<string, string | boolean | null | undefined>
): URLSearchParams {
  const params = new URLSearchParams(currentParams);
  // A changed filter, sort or search reshapes the list, so a paged session list starts again from page 1.
  if (Object.keys(updates).some(key => key !== 'page' && key !== 'view' && key !== 'fullscreen' && key !== 'fullScreen')) params.delete('page');

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === '' || value === 'All' || value === 'date-desc' || (key === 'view' && value === 'grid')) {
      params.delete(key);
    } else if (key === 'hideEmpty') {
      if (value === true) params.delete('hideEmpty');
      else params.set('hideEmpty', 'false');
    } else if (key === 'fullscreen' || key === 'fullScreen') {
      if (value === true || value === 'true' || value === '1') {
        params.set('fullscreen', 'true');
        if (key === 'fullScreen') params.delete('fullScreen');
      } else {
        params.delete('fullscreen');
        params.delete('fullScreen');
      }
    } else {
      params.set(key, String(value));
    }
  }

  return params;
}

export function updateSearchParams(
  currentParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
  updates: Record<string, string | boolean | null | undefined>
): void {
  setSearchParams((prev) => applySearchParamUpdates(prev || currentParams, updates), { replace: true });
}
