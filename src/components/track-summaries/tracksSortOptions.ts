import { SortOption } from '../common';

export type TracksSortOption = 'name-asc' | 'name-desc' | 'pace-asc' | 'last-session-desc';

export const TRACK_SORT_OPTIONS: readonly SortOption<TracksSortOption>[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'pace-asc', label: 'Pace / Benchmark (Best First)' },
  { value: 'last-session-desc', label: 'Last Session (Newest First)' },
];
