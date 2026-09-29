import { useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';

/** Sessions shown per page of a session list. */
export const SESSION_PAGE_SIZE = 25;

/**
 * Current page of the session list, kept in the URL (`?page=`) so coming back from a session
 * lands on the same page. `updateSearchParams` drops it whenever a filter changes.
 */
export function useSessionPage(totalCount: number, pageSize = SESSION_PAGE_SIZE) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const requested = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;

  const setPage = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    updateSearchParams(searchParams, setSearchParams, { page: clamped === 1 ? null : String(clamped) });
  };

  return { page, pageCount, setPage, start: (page - 1) * pageSize, end: Math.min(page * pageSize, totalCount) };
}
