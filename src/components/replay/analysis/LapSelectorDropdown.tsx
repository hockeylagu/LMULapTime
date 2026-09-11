import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface LapConsistencyOption {
  lapNumber: number;
  lapTimeSec: number;
  isValid: boolean;
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
        <div className="absolute top-8 left-0 z-30 w-52 max-h-64 overflow-y-auto rounded-lg bg-[#0c101d] border border-lmu-border shadow-2xl py-1">
          {availableLaps.map(({ lapNumber, lapTimeSec, isValid }) => {
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
                <span className={`ml-auto ${isExcluded ? 'text-lmu-muted line-through' : 'text-lmu-muted'}`}>{formatLapTime(lapTimeSec)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
