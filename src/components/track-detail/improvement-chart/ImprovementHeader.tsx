import React from 'react';
import { TrendingUp } from 'lucide-react';
import { VehicleClassPills } from '../../common/VehicleClassPills.js';

export interface ImprovementHeaderProps {
  embedded?: boolean;
  activeTrack: string;
  tracks: string[];
  setSelectedTrack: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
}

export const ImprovementHeader: React.FC<ImprovementHeaderProps> = ({
  embedded = false,
  activeTrack,
  tracks,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
}) => {
  if (embedded) return null;

  return (
    <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-lmu-accent" />
          Lap & Sector Improvement Over Time
        </h2>
        <p className="text-xs text-lmu-muted mt-1">
          Track how your lap times, sector splits, and theoretical limits evolved session by session
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Select Track */}
        <select
          value={activeTrack}
          onChange={(e) => setSelectedTrack(e.target.value)}
          className="bg-lmu-bg border border-lmu-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-lmu-accent font-medium"
        >
          {tracks.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Vehicle Class Filter Buttons */}
        <VehicleClassPills
          selectedClass={selectedCarClass}
          onSelectClass={setSelectedCarClass}
        />
      </div>
    </div>
  );
};
