import React from 'react';

/** The lap filters under the compare deck; the track and class are picked on the ribbon above. */
export interface CompareLapsFiltersProps {
  selectedCarClass: string;
  availableCarModels: string[];
  selectedCarModel: string;
  setSelectedCarModel: (model: string) => void;
  playerOnly: boolean;
  setPlayerOnly: (playerOnly: boolean) => void;
}

export const CompareLapsFilters: React.FC<CompareLapsFiltersProps> = ({
  selectedCarClass,
  availableCarModels,
  selectedCarModel,
  setSelectedCarModel,
  playerOnly,
  setPlayerOnly,
}) => {
  return (
    <div className="pt-4 border-t border-lmu-border/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
