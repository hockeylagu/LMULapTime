import { FOCUS_RING } from '../../../common/buttonStyles.js';

export interface CompareLapPagination { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; }

export function CompareLapPaginationControls({ pagination, loading }: { pagination: CompareLapPagination; loading: boolean }) {
  if (pagination.total <= pagination.pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-lmu-border px-4 py-2 text-xs">
      <button type="button" disabled={loading || pagination.page <= 1} onClick={() => pagination.onPageChange(pagination.page - 1)} className={FOCUS_RING}>Previous laps</button>
      <span>Page {pagination.page} of {Math.ceil(pagination.total / pagination.pageSize)}</span>
      <button type="button" disabled={loading || pagination.page * pagination.pageSize >= pagination.total} onClick={() => pagination.onPageChange(pagination.page + 1)} className={FOCUS_RING}>Next laps</button>
    </div>
  );
}
