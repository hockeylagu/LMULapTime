import { useCallback, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NonRepresentativeReason } from '../../../../shared/types/index.js';
import { NON_REPRESENTATIVE_LABELS } from '../../../utils/lapTrafficText.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { DROPDOWN_CHEVRON, DROPDOWN_LIST_INSET, DROPDOWN_OPTION, DROPDOWN_PANEL, DROPDOWN_TRIGGER_COMPACT } from '../../common/dropdown/dropdownStyles.js';
import { useOutsidePress } from '../../common/dropdown/useAnchoredPanel.js';

export interface LapConsistencyOption {
  lapNumber: number;
  lapTimeSec: number;
  isValid: boolean;
  // Set by the session parser: the lap starts excluded, with this reason shown.
  nonRepresentativeReason?: NonRepresentativeReason;
}

export interface LapSelectorDropdownProps {
  availableLaps: LapConsistencyOption[];
  excludedLaps: Set<number>;
  onToggleLapExclusion: (lapNumber: number) => void;
  formatLapTime: (sec?: number | null) => string;
}

/** A checkbox list in the dropdown family: it stays open while laps are toggled. */
export function LapSelectorDropdown({
  availableLaps,
  excludedLaps,
  onToggleLapExclusion,
  formatLapTime,
}: LapSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setIsOpen(false), []);
  useOutsidePress(isOpen, [ref], close);

  const includedCount = availableLaps.length - excludedLaps.size;

  return (
    <div ref={ref} className="relative" onKeyDown={(event) => {
      if (event.key !== 'Escape' || !isOpen) return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    }}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(v => !v)}
        className={DROPDOWN_TRIGGER_COMPACT}
      >
        <span>{includedCount}/{availableLaps.length} laps included</span>
        <ChevronDown aria-hidden="true" className={DROPDOWN_CHEVRON} />
      </button>
      {isOpen && (
        <div id={panelId} role="group" aria-label="Laps included" className={`absolute top-full left-0 z-30 mt-1 w-56 max-h-72 overflow-y-auto custom-scrollbar ${DROPDOWN_PANEL} ${DROPDOWN_LIST_INSET}`}>
          {availableLaps.map(({ lapNumber, lapTimeSec, isValid, nonRepresentativeReason }) => {
            const isExcluded = excludedLaps.has(lapNumber);
            return (
              <label key={lapNumber} className={`${DROPDOWN_OPTION} cursor-pointer`}>
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={() => onToggleLapExclusion(lapNumber)}
                  className={`accent-lmu-accent w-3.5 h-3.5 shrink-0 ${FOCUS_RING}`}
                />
                <span className={isExcluded ? 'text-lmu-muted line-through' : 'text-white'}>Lap {lapNumber}</span>
                {!isValid && (
                  <span className="px-1 rounded bg-lmu-loss-strong/15 border border-lmu-loss-strong/30 text-lmu-loss text-[10px] font-bold uppercase tracking-wider">
                    Invalid
                  </span>
                )}
                {isValid && nonRepresentativeReason && (
                  <span
                    title={NON_REPRESENTATIVE_LABELS[nonRepresentativeReason].title}
                    className="px-1 rounded bg-lmu-warn-strong/15 border border-lmu-warn-strong/30 text-lmu-warn text-[10px] font-bold uppercase tracking-wider"
                  >
                    {NON_REPRESENTATIVE_LABELS[nonRepresentativeReason].label}
                  </span>
                )}
                <span className={`ml-auto font-mono text-lmu-muted ${isExcluded ? 'line-through' : ''}`}>{formatLapTime(lapTimeSec)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
