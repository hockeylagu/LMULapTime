import { useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';

export type SessionViewMode = 'grid' | 'table';

function isSessionViewMode(value: string | null): value is SessionViewMode {
  return value === 'grid' || value === 'table';
}

function getSavedViewMode(): SessionViewMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('lmu_dashboard_view');
    return isSessionViewMode(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function useSessionViewMode(
  controlledViewMode?: SessionViewMode,
  onControlledViewModeChange?: (mode: SessionViewMode) => void
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryView = searchParams.get('view');
  const viewMode = controlledViewMode ?? (isSessionViewMode(queryView) ? queryView : getSavedViewMode() ?? 'grid');

  const setViewMode = (mode: SessionViewMode) => {
    if (controlledViewMode !== undefined) {
      onControlledViewModeChange?.(mode);
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('lmu_dashboard_view', mode);
      } catch {}
    }
    updateSearchParams(searchParams, setSearchParams, { view: mode });
  };

  return { viewMode, setViewMode };
}