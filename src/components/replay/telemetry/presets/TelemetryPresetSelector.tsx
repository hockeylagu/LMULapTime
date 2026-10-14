import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal, ChevronDown, Check, Settings2 } from 'lucide-react';
import { TelemetryPreset } from './telemetryPresets.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../../common/buttonStyles.js';
import { DROPDOWN_CHEVRON, DROPDOWN_GROUP_LABEL, DROPDOWN_OPTION, DROPDOWN_OPTION_SELECTED, DROPDOWN_PANEL, DROPDOWN_TRIGGER_COMPACT } from '../../../common/dropdown/dropdownStyles.js';
import { useOutsidePress } from '../../../common/dropdown/useAnchoredPanel.js';

export interface TelemetryPresetSelectorProps {
  presets: TelemetryPreset[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onOpenManageModal: () => void;
}

/** Preset choice plus management actions; arrows move between the presets, Escape returns to the trigger. */
export const TelemetryPresetSelector: React.FC<TelemetryPresetSelectorProps> = ({
  presets,
  activePresetId,
  onSelectPreset,
  onOpenManageModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setIsOpen(false), []);
  useOutsidePress(isOpen, [containerRef], close);

  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];

  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    (list?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ?? list?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [isOpen]);

  const finish = (action: () => void) => {
    setIsOpen(false);
    triggerRef.current?.focus();
    action();
  };

  return (
    <div ref={containerRef} className="relative z-30" onKeyDown={event => {
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <div className="flex items-center gap-1">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className={DROPDOWN_TRIGGER_COMPACT}
          aria-expanded={isOpen}
          aria-controls={menuId}
          title="Select telemetry channel preset"
          data-testid="telemetry-preset-dropdown-btn"
        >
          <SlidersHorizontal aria-hidden="true" className="w-3 h-3 shrink-0 text-lmu-muted" />
          <span className="truncate max-w-[120px] sm:max-w-[150px]">
            {activePreset?.name ?? 'Channels'}
          </span>
          <span className="font-mono text-lmu-muted">
            {activePreset?.channels.length ?? 0}
          </span>
          <ChevronDown aria-hidden="true" className={DROPDOWN_CHEVRON} />
        </button>

        <button
          type="button"
          onClick={() => finish(onOpenManageModal)}
          className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-raised transition-colors ${FOCUS_RING}`}
          title="Customize, rename, or add channel presets"
          aria-label="Manage channel presets"
          data-testid="telemetry-preset-manage-btn"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && (
        <div id={menuId} className={`absolute left-0 top-full mt-1 w-64 z-50 p-1 ${DROPDOWN_PANEL}`} data-testid="telemetry-preset-menu">
          <div className="flex items-center justify-between pr-1.5">
            <span className={DROPDOWN_GROUP_LABEL}>Telemetry presets</span>
            <button
              type="button"
              onClick={() => finish(onOpenManageModal)}
              className={`text-[11px] text-lmu-muted hover:text-white hover:underline rounded ${FOCUS_RING}`}
            >
              Manage
            </button>
          </div>

          <div ref={listRef} role="group" aria-label="Telemetry presets" className="max-h-60 overflow-y-auto custom-scrollbar"
            onKeyDown={event => {
              const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
              const current = options.indexOf(document.activeElement as HTMLButtonElement);
              const target = event.key === 'ArrowDown' ? Math.min(current + 1, options.length - 1) : event.key === 'ArrowUp' ? Math.max(current - 1, 0)
                : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
              if (target >= 0) { event.preventDefault(); options[target]?.focus(); }
            }}>
            {presets.map(p => {
              const isSelected = p.id === activePresetId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => finish(() => onSelectPreset(p.id))}
                  className={`${DROPDOWN_OPTION} ${isSelected ? DROPDOWN_OPTION_SELECTED : ''} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lmu-accent-text`}
                  aria-pressed={isSelected}
                  data-testid={`telemetry-preset-option-${p.id}`}
                >
                  <Check aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'invisible'}`} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 font-mono text-lmu-muted">{p.channels.length} ch</span>
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-lmu-border p-1.5 pb-0.5">
            <button type="button" onClick={() => finish(onOpenManageModal)} className={`${SECONDARY_BUTTON} w-full`}>
              <Settings2 aria-hidden="true" className="w-3.5 h-3.5" />
              Edit & Rename Presets
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
