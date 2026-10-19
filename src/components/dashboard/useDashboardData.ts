import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchJson, isAbortError } from '../../api/apiClient.js';
import type { DashboardData } from '../../../shared/types/dashboard.js';
import { useSessionDataContext } from '../../api/sessionDataContext.js';

export interface DashboardDataState { data: DashboardData | null; loading: boolean; error: string | null; }

/** Loads current dashboard aggregates and only the session page named by the URL. */
export function useDashboardData(revision = '', enabled = true): DashboardDataState {
  const { revision: sessionRevision } = useSessionDataContext();
  const [searchParams] = useSearchParams();
  const requestQuery = useMemo(() => {
    const query = new URLSearchParams();
    for (const key of ['track', 'carClass', 'type', 'q', 'hideEmpty', 'hasReplay', 'sort', 'page']) {
      const value = searchParams.get(key);
      if (value !== null) query.set(key, value);
    }
    if (!query.has('hideEmpty')) query.set('hideEmpty', 'true');
    query.set('pageSize', '25');
    return query.toString();
  }, [searchParams]);
  const [state, setState] = useState<DashboardDataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null }); return; }
    const controller = new AbortController();
    setState(previous => ({ ...previous, loading: true, error: null }));
    fetchJson<DashboardData>(`/api/dashboard?${requestQuery}`, { signal: controller.signal })
      .then(data => setState({ data, loading: false, error: null }))
      .catch(error => {
        if (isAbortError(error)) return;
        setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Unable to load dashboard data' }));
      });
    return () => controller.abort();
  }, [requestQuery, revision, sessionRevision, enabled]);

  return state;
}
