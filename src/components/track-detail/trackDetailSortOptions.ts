import { SortOption } from '../common';

export type TrackDetailSortOption = 'date-desc' | 'date-asc' | 'pos-asc' | 'pace-asc' | 'pace-desc' | 'lap-asc';

export const TRACK_DETAIL_SORT_OPTIONS: readonly SortOption<TrackDetailSortOption>[] = [
  { value: 'date-desc', label: 'Date (Newest First)' },
  { value: 'date-asc', label: 'Date (Oldest First)' },
  { value: 'pos-asc', label: 'Best Position (P1 First)' },
  { value: 'pace-asc', label: 'Benchmark (Best Pace %)' },
  { value: 'pace-desc', label: 'Benchmark (Slowest Pace %)' },
  { value: 'lap-asc', label: 'Best Lap Time (Fastest)' },
];
