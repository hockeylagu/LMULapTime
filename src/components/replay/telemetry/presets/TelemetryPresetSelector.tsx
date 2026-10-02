import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ChevronDown, Check, Settings2 } from 'lucide-react';
import { TelemetryPreset } from './telemetryPresets.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

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
      <div className="flex items-center gap-1 p-0.5">
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono text-lmu-text hover:text-white hover:bg-white/5 transition-all cursor-pointer ${FOCUS_RING}`}
          aria-expanded={isOpen}
          title="Select telemetry channel preset"
          data-testid="telemetry-preset-dropdown-btn"
        >
          <SlidersHorizontal className="w-3 h-3 text-lmu-muted" />
          <span className="font-bold truncate max-w-[120px] sm:max-w-[150px]">
            {activePreset?.name ?? 'Channels'}
          </span>
          <span className="px-1 py-px text-lmu-muted text-[10px] font-bold">
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
          className={`w-6 h-6 inline-flex items-center justify-center rounded text-lmu-muted hover:text-white hover:bg-white/5 transition-all cursor-pointer ${FOCUS_RING}`}
          title="Customize, rename, or add channel presets"
          data-testid="telemetry-preset-manage-btn"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute left-0 mt-1 w-64 rounded-xl bg-lmu-surface border border-lmu-border shadow-2xl z-50 py-1.5 animate-pop-in text-[11px]"
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
              className={`text-lmu-muted hover:text-white hover:underline cursor-pointer ${FOCUS_RING}`}
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
                    isSelected ? 'bg-lmu-raised/70 text-white font-semibold' : 'text-lmu-text-soft hover:bg-white/5 hover:text-white'
                  } ${FOCUS_RING}`}
                  aria-pressed={isSelected}
                  data-testid={`telemetry-preset-option-${p.id}`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-white shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-px text-lmu-muted font-mono shrink-0">
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
              className={`w-full py-1 px-2.5 rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised/70 border border-lmu-border text-lmu-text-soft font-semibold flex items-center justify-center gap-1.5 transition-all text-[10px] cursor-pointer ${FOCUS_RING}`}
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
