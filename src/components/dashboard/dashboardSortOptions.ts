import { SortOption } from '../common';

export type DashboardSortOption = 'date-desc' | 'date-asc' | 'pos-asc' | 'pace-asc' | 'pace-desc';

export const DASHBOARD_SORT_OPTIONS: readonly SortOption<DashboardSortOption>[] = [
  { value: 'date-desc', label: 'Date (Newest First)' },
  { value: 'date-asc', label: 'Date (Oldest First)' },
  { value: 'pos-asc', label: 'Best Position (P1 First)' },
  { value: 'pace-asc', label: 'Benchmark (Best Pace %)' },
  { value: 'pace-desc', label: 'Benchmark (Slowest Pace %)' },
];
