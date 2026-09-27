import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NonRepresentativeReason } from '../../../../shared/types/index.js';
import { NON_REPRESENTATIVE_LABELS } from '../../../utils/lapTrafficText.js';

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

export function LapSelectorDropdown({
  availableLaps,
  excludedLaps,
  onToggleLapExclusion,
  formatLapTime,
}: LapSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const includedCount = availableLaps.length - excludedLaps.size;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-lmu-card/60 border border-lmu-border/60 text-[11px] font-mono font-semibold text-white hover:border-lmu-accent transition-colors cursor-pointer"
      >
        <span>{includedCount}/{availableLaps.length} laps included</span>
        <ChevronDown className={`w-3 h-3 text-lmu-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-8 left-0 z-30 w-52 max-h-64 overflow-y-auto rounded-lg bg-lmu-card border border-lmu-border shadow-2xl py-1">
          {availableLaps.map(({ lapNumber, lapTimeSec, isValid, nonRepresentativeReason }) => {
            const isExcluded = excludedLaps.has(lapNumber);
            return (
              <label
                key={lapNumber}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono hover:bg-lmu-card/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!isExcluded}
                  onChange={() => onToggleLapExclusion(lapNumber)}
                  className="accent-lmu-accent"
                />
                <span className={isExcluded ? 'text-lmu-muted line-through' : 'text-white'}>Lap {lapNumber}</span>
                {!isValid && (
                  <span className="px-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] font-bold uppercase">
                    Invalid
                  </span>
                )}
                {isValid && nonRepresentativeReason && (
                  <span
                    title={NON_REPRESENTATIVE_LABELS[nonRepresentativeReason].title}
                    className="px-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-bold uppercase"
                  >
                    {NON_REPRESENTATIVE_LABELS[nonRepresentativeReason].label}
                  </span>
                )}
                <span className={`ml-auto ${isExcluded ? 'text-lmu-muted line-through' : 'text-lmu-muted'}`}>{formatLapTime(lapTimeSec)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
