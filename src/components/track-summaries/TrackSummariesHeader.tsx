import React from 'react';
import { Flag } from 'lucide-react';
import { VehicleClassPills, SortDropdown } from '../common';
import { TRACK_SORT_OPTIONS } from './tracksSortOptions.js';
import type { TracksSortOption } from './tracksSortOptions.js';

export type { TracksSortOption };

interface TrackSummariesHeaderProps {
  totalTracks: number;
  benchmarkSortAvailable: boolean;
  sortBy: TracksSortOption;
  onSortByChange: (sort: TracksSortOption) => void;
  selectedCarClass: string;
  onSelectCarClass: (carClass: string) => void;
}

export const TrackSummariesHeader: React.FC<TrackSummariesHeaderProps> = ({
  totalTracks,
  benchmarkSortAvailable,
  sortBy,
  onSortByChange,
  selectedCarClass,
  onSelectCarClass,
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-lmu-text flex items-center gap-2">
          <Flag className="w-4 h-4 text-lmu-muted" />
          Tracks ({totalTracks})
        </h2>
        <p className="text-xs text-lmu-muted mt-1">
          Personal bests and benchmark pace
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap shrink-0">
        {/* Sort Dropdown (Name, Pace, Last Session) */}
        <SortDropdown
          value={sortBy}
          onChange={onSortByChange}
          options={TRACK_SORT_OPTIONS.map(option => ({ ...option, disabled: option.value === 'pace-asc' && !benchmarkSortAvailable }))}
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
