import React from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { TelemetryPreset } from './telemetryPresets.js';

export interface TelemetryPresetSidebarProps {
  presets: TelemetryPreset[];
  selectedId: string;
  activePresetId: string;
  onSelectId: (id: string) => void;
  onCreateNew: () => void;
  onResetDefaults: () => void;
}

export const TelemetryPresetSidebar: React.FC<TelemetryPresetSidebarProps> = React.memo(({
  presets,
  selectedId,
  activePresetId,
  onSelectId,
  onCreateNew,
  onResetDefaults,
}) => {
  return (
    <div className="w-full md:w-56 bg-[#060910] border-b md:border-b-0 md:border-r border-lmu-border/60 flex flex-col shrink-0">
      <div className="p-2.5 flex items-center justify-between border-b border-white/5 shrink-0">
        <span className="text-[10px] uppercase font-bold text-lmu-muted">Presets</span>
        <button
          type="button"
          onClick={onCreateNew}
          className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 flex items-center gap-1 font-bold text-[10px] transition-all cursor-pointer"
          title="Create a new custom telemetry preset"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {presets.map(p => {
          const isSelected = p.id === selectedId;
          const isActive = p.id === activePresetId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectId(p.id)}
              className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-sky-500/20 border border-sky-400/40 text-white font-bold'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                <span className="truncate">{p.name}</span>
              </div>
              <span className="text-[9px] text-lmu-muted shrink-0">
                {p.channels.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-2 border-t border-white/5 shrink-0">
        <button
          type="button"
          onClick={onResetDefaults}
          className="w-full py-1 px-2 rounded text-[10px] text-lmu-muted hover:text-amber-300 hover:bg-amber-500/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          title="Reset all presets to factory defaults"
        >
          <RotateCcw className="w-3 h-3" /> Reset to Defaults
        </button>
      </div>
    </div>
  );
});
