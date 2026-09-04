import React from 'react';
import { Flag } from 'lucide-react';
import { VehicleClassPills, SortDropdown, SortOption } from '../common';

export type TracksSortOption = 'name-asc' | 'name-desc' | 'pace-asc' | 'last-session-desc';

export const TRACK_SORT_OPTIONS: readonly SortOption<TracksSortOption>[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'pace-asc', label: 'Pace / Benchmark (Best First)' },
  { value: 'last-session-desc', label: 'Last Session (Newest First)' },
];

interface TrackSummariesHeaderProps {
  totalTracks: number;
  sortBy: TracksSortOption;
  onSortByChange: (sort: TracksSortOption) => void;
  selectedCarClass: string;
  onSelectCarClass: (carClass: string) => void;
}

export const TrackSummariesHeader: React.FC<TrackSummariesHeaderProps> = ({
  totalTracks,
  sortBy,
  onSortByChange,
  selectedCarClass,
  onSelectCarClass,
}) => {
  return (
    <div className="glass-panel p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
          <Flag className="w-6 h-6 text-lmu-gold" />
          Track Records & Benchmarks ({totalTracks} Tracks)
        </h2>
        <p className="text-xs text-lmu-muted mt-1">
          Aggregated personal best lap times, theoretical limits, and car stats filtered by category
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap shrink-0">
        {/* Sort Dropdown (Name, Pace, Last Session) */}
        <SortDropdown
          value={sortBy}
          onChange={onSortByChange}
          options={TRACK_SORT_OPTIONS}
        />

        {/* Car Class Filter Buttons */}
        <VehicleClassPills
          selectedClass={selectedCarClass}
          onSelectClass={onSelectCarClass}
          className="shrink-0 text-xs"
        />
      </div>
    </div>
  );
};
