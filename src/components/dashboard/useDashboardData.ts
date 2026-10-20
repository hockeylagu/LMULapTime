import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { fetchJson } from '../../api/apiClient.js';
import { useRequest } from '../../api/useRequest.js';
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
  // Each new request shows loading over the previous data; disabled, there is nothing to show.
  const dashboard = useRequest(enabled ? requestQuery : null,
    (query, signal) => fetchJson<DashboardData>(`/api/dashboard?${query}`, { signal }),
    { keepPrevious: true, refresh: `${revision}|${sessionRevision}` });
  const { error } = dashboard;
  return {
    data: dashboard.data,
    loading: dashboard.loading,
    error: error ? error instanceof Error ? error.message : 'Unable to load dashboard data' : null,
  };
}
