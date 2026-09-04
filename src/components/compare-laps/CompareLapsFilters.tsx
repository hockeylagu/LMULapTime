import React from 'react';
import { VEHICLE_CLASS_OPTIONS } from '../../utils/paceCategory';

export interface CompareLapsFiltersProps {
  availableTracks: string[];
  selectedTrack: string;
  setSelectedTrack: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  availableCarModels: string[];
  selectedCarModel: string;
  setSelectedCarModel: (model: string) => void;
  playerOnly: boolean;
  setPlayerOnly: (playerOnly: boolean) => void;
}

export const CompareLapsFilters: React.FC<CompareLapsFiltersProps> = ({
  availableTracks,
  selectedTrack,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  availableCarModels,
  selectedCarModel,
  setSelectedCarModel,
  playerOnly,
  setPlayerOnly,
}) => {
  return (
    <div className="pt-4 border-t border-lmu-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Track Selector */}
      <div>
        <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
          Track
        </label>
        <select
          value={selectedTrack}
          onChange={(e) => setSelectedTrack(e.target.value)}
          className="w-full bg-lmu-bg border border-lmu-border rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-lmu-accent"
        >
          {availableTracks.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Vehicle Category Selector */}
      <div>
        <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
          Vehicle Category
        </label>
        <select
          value={selectedCarClass}
          onChange={(e) => setSelectedCarClass(e.target.value)}
          className="w-full bg-lmu-bg border border-lmu-border rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-lmu-accent"
        >
          {VEHICLE_CLASS_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Car Model Selector */}
      <div>
        <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
          Car Model
        </label>
        <select
          value={selectedCarModel}
          onChange={(e) => setSelectedCarModel(e.target.value)}
          className="w-full bg-lmu-bg border border-lmu-border rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-lmu-accent"
        >
          <option value="All">All {selectedCarClass} Cars</option>
          {availableCarModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Driver Mode Filter */}
      <div className="flex flex-col justify-end">
        <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
          Driver Scope
        </label>
        <div className="flex items-center gap-1 bg-lmu-bg p-1 rounded-xl border border-lmu-border">
          <button
            type="button"
            onClick={() => setPlayerOnly(true)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              playerOnly ? 'bg-lmu-accent text-white shadow-sm font-bold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            ⭐ Player Only
          </button>
          <button
            type="button"
            onClick={() => setPlayerOnly(false)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !playerOnly ? 'bg-lmu-accent text-white shadow-sm font-bold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            All Drivers
          </button>
        </div>
      </div>
    </div>
  );
};
