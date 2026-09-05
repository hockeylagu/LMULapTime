import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { ReplayDriverEntry } from '../../../server/types.js';

export interface ReplayDriverRosterTableProps {
  drivers: ReplayDriverEntry[];
  selectedDriverSlot: number | null;
  playerDriver?: ReplayDriverEntry;
  onSelectDriver: (slot: number) => void;
}

export const ReplayDriverRosterTable: React.FC<ReplayDriverRosterTableProps> = ({
  drivers,
  selectedDriverSlot,
  playerDriver,
  onSelectDriver,
}) => {
  const [rosterSearch, setRosterSearch] = useState<string>('');

  const filteredDrivers = useMemo(() => {
    if (!drivers) return [];
    if (!rosterSearch.trim()) return drivers;
    const q = rosterSearch.toLowerCase();
    return drivers.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.carModel && d.carModel.toLowerCase().includes(q)) ||
      (d.team && d.team.toLowerCase().includes(q)) ||
      (d.carNumber && d.carNumber.includes(q))
    );
  }, [drivers, rosterSearch]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">
      <div className="rounded-xl border border-lmu-border overflow-hidden bg-lmu-card">
        <div className="p-3 bg-lmu-dark/80 border-b border-lmu-border text-xs flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-lmu-muted font-medium">Click any driver to load telemetry</span>
            <span className="font-semibold text-white">
              {filteredDrivers.length} / {drivers.length} Drivers
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-lmu-muted absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search driver, car model, team..."
                value={rosterSearch}
                onChange={e => setRosterSearch(e.target.value)}
                className="w-full bg-lmu-card border border-lmu-border rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent"
              />
              {rosterSearch && (
                <button
                  onClick={() => setRosterSearch('')}
                  className="absolute right-2 top-1 text-lmu-muted hover:text-white text-xs p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {playerDriver && typeof playerDriver.slot === 'number' && playerDriver.slot !== selectedDriverSlot && (
              <button
                onClick={() => onSelectDriver(playerDriver.slot!)}
                className="px-2.5 py-1 rounded-lg bg-purple-600/30 border border-purple-500/50 hover:bg-purple-600/50 text-purple-200 text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-sm"
                title="Quick switch to your player car"
              >
                <span>★ My Car</span>
              </button>
            )}
          </div>
        </div>

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-lmu-border bg-lmu-dark/50 text-lmu-muted font-bold uppercase text-[10px] tracking-wider">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Driver</th>
              <th className="py-2.5 px-3">Car Model</th>
              <th className="py-2.5 px-3">Team</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lmu-border/50">
            {filteredDrivers && filteredDrivers.length > 0 ? (
              filteredDrivers.map((d, idx) => {
                const isCurrent = typeof selectedDriverSlot === 'number' && d.slot === selectedDriverSlot;
                const isPlayer = Boolean(d.isPlayer);
                return (
                  <tr
                    key={typeof d.slot === 'number' ? d.slot : idx}
                    onClick={() => {
                      if (typeof d.slot === 'number') {
                        onSelectDriver(d.slot);
                      }
                    }}
                    className={`cursor-pointer transition-colors group ${
                      isCurrent
                        ? 'bg-lmu-accent/15 hover:bg-lmu-accent/20 border-l-2 border-l-lmu-accent'
                        : 'hover:bg-lmu-dark/40'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                      {d.carNumber || `#${idx + 1}`}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      <div className="flex items-center gap-1.5">
                        <span>{d.name}</span>
                        {isPlayer && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-600/80 text-purple-100 font-bold border border-purple-400/40 shadow-sm">
                            YOU
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-lmu-accent text-white font-bold shadow-sm">
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400 font-medium truncate max-w-[120px]">
                      {d.carModel || 'Unknown'}
                    </td>
                    <td className="py-2.5 px-3 text-lmu-muted truncate max-w-[100px]">
                      {d.team || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right shrink-0">
                      {isCurrent ? (
                        <span className="text-[10px] font-bold text-lmu-accent">
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] text-lmu-muted group-hover:text-white font-medium">
                          Select →
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-8 text-center text-lmu-muted">
                  {rosterSearch ? `No drivers match "${rosterSearch}"` : 'No driver records found in this replay.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
