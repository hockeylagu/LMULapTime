import React from 'react';
import { Users } from 'lucide-react';
import { ReplayDriverEntry } from '../../../server/types.js';

export interface ReplayDriverHeaderPillProps {
  selectedDriver?: ReplayDriverEntry;
  fallbackDriverName?: string;
  onOpenRoster: () => void;
}

export const ReplayDriverHeaderPill: React.FC<ReplayDriverHeaderPillProps> = React.memo(({
  selectedDriver,
  fallbackDriverName,
  onOpenRoster,
}) => {
  return (
    <div className="p-3 rounded-xl bg-lmu-card border border-lmu-border flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-lmu-dark border border-lmu-border flex items-center justify-center font-bold text-amber-400 text-xs font-mono shrink-0">
          {selectedDriver?.carNumber || '#-'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white truncate">
              {selectedDriver?.name || fallbackDriverName || 'Driver'}
            </span>
            {Boolean(selectedDriver?.isPlayer) && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-600/80 text-purple-100 font-bold border border-purple-400/40 shadow-sm">
                YOU
              </span>
            )}
          </div>
          <div className="text-[11px] text-lmu-muted truncate">
            {selectedDriver?.carModel || 'Vehicle'} • {selectedDriver?.team || 'Competitor'}
          </div>
        </div>
      </div>

      <button
        onClick={onOpenRoster}
        className="px-2 py-1 rounded-lg bg-lmu-dark hover:bg-lmu-accent/20 border border-lmu-border hover:border-lmu-accent/50 text-[11px] text-lmu-muted hover:text-white font-medium flex items-center gap-1 transition-all cursor-pointer shrink-0"
        title="Open Driver Roster to select a different driver"
      >
        <Users className="w-3.5 h-3.5 text-lmu-accent" />
        <span>Change</span>
      </button>
    </div>
  );
});
