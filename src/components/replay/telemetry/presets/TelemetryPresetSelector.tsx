import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ChevronDown, Check, Settings2 } from 'lucide-react';
import { TelemetryPreset } from './telemetryPresets.js';

export interface TelemetryPresetSelectorProps {
  presets: TelemetryPreset[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onOpenManageModal: () => void;
}

export const TelemetryPresetSelector: React.FC<TelemetryPresetSelectorProps> = ({
  presets,
  activePresetId,
  onSelectPreset,
  onOpenManageModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative z-30">
      <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-0.5">
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono text-lmu-text hover:text-white hover:bg-white/5 transition-all cursor-pointer"
          title="Select telemetry channel preset"
          data-testid="telemetry-preset-dropdown-btn"
        >
          <SlidersHorizontal className="w-3 h-3 text-lmu-info" />
          <span className="font-bold truncate max-w-[120px] sm:max-w-[150px]">
            {activePreset?.name ?? 'Channels'}
          </span>
          <span className="px-1 py-0.2 rounded bg-lmu-info-strong/20 text-lmu-info-soft text-[10px] font-bold">
            {activePreset?.channels.length ?? 0}
          </span>
          <ChevronDown className={`w-3 h-3 text-lmu-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            onOpenManageModal();
          }}
          className="p-1 rounded text-lmu-muted hover:text-lmu-info-soft hover:bg-white/5 transition-all cursor-pointer"
          title="Customize, rename, or add channel presets"
          data-testid="telemetry-preset-manage-btn"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute left-0 mt-1 w-64 rounded-xl bg-lmu-surface border border-lmu-border shadow-2xl z-50 py-1.5 backdrop-blur-md animate-pop-in text-[11px] font-mono"
          data-testid="telemetry-preset-menu"
        >
          <div className="px-3 py-1 text-[10px] font-bold text-lmu-muted uppercase tracking-wider border-b border-white/5 flex items-center justify-between">
            <span>Telemetry Presets</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenManageModal();
              }}
              className="text-lmu-info hover:underline cursor-pointer"
            >
              Manage
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {presets.map(p => {
              const isSelected = p.id === activePresetId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectPreset(p.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-lmu-info-strong/20 text-lmu-info-soft font-bold' : 'text-lmu-text-soft hover:bg-white/5 hover:text-white'
                  }`}
                  data-testid={`telemetry-preset-option-${p.id}`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-lmu-info shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-lmu-muted font-bold shrink-0">
                    {p.channels.length} ch
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-1.5 mt-1 border-t border-white/5 px-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenManageModal();
              }}
              className="w-full py-1 px-2.5 rounded-lg bg-lmu-info-strong/10 hover:bg-lmu-info-strong/20 border border-lmu-info-strong/30 text-lmu-info-soft font-bold flex items-center justify-center gap-1.5 transition-all text-[10px] cursor-pointer"
            >
              <Settings2 className="w-3 h-3" />
              Edit & Rename Presets
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
