import React from 'react';
import { Fuel, Clock, Zap, Scale } from 'lucide-react';
import { DriverData } from '../../../server/types.js';

export interface SessionFuelStrategyCardProps {
  selectedDriver: DriverData;
  fuelStrategy: {
    avgFuel: number;
    estFuelLaps: number | null;
    avgVe: number | null;
    estVeLaps: number | null;
    optimalRatio: number | null;
    zeroWasteFuelPct: number | null;
    limiter: 've' | 'fuel' | 'balanced' | null;
    lapDelta: number;
    surplusFuelPct: number;
  } | null;
}

export const SessionFuelStrategyCard: React.FC<SessionFuelStrategyCardProps> = ({
  selectedDriver,
  fuelStrategy,
}) => {
  if (!selectedDriver.avgFuelPerLap && !selectedDriver.avgVePerLap) return null;

  return (
    <div className="p-3.5 rounded-xl bg-lmu-bg/80 border border-lmu-border/70 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {selectedDriver.avgFuelPerLap !== null && selectedDriver.avgFuelPerLap !== undefined && (
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Fuel className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-lmu-muted">Avg Fuel Usage</p>
              <p className="text-xs font-mono font-bold text-white">
                {selectedDriver.avgFuelPerLap}% <span className="text-[10px] font-normal text-lmu-muted">/ clean lap</span>
              </p>
            </div>
          </div>
        )}

        {selectedDriver.estFuelStintLaps !== null && selectedDriver.estFuelStintLaps !== undefined && (
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-lmu-muted">Est. Fuel Stint</p>
              <p className="text-xs font-mono font-bold text-amber-300">
                ~{selectedDriver.estFuelStintLaps} <span className="text-[10px] font-normal text-lmu-muted">laps / tank</span>
              </p>
            </div>
          </div>
        )}

        {selectedDriver.avgVePerLap !== null && selectedDriver.avgVePerLap !== undefined && (
          <div
            className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40"
            title="Virtual Energy consumed per lap (WEC / LMU BoP energy allocation)"
          >
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-lmu-muted">Avg Virtual Energy</p>
              <p className="text-xs font-mono font-bold text-white">
                {selectedDriver.avgVePerLap}% <span className="text-[10px] font-normal text-lmu-muted">/ lap</span>
              </p>
            </div>
          </div>
        )}

        {selectedDriver.estVeStintLaps !== null && selectedDriver.estVeStintLaps !== undefined && (
          <div
            className="flex items-center gap-2.5 p-2 rounded-lg bg-lmu-card/60 border border-lmu-border/40"
            title="Estimated laps before 100% Virtual Energy allocation is depleted. In WEC, running out before pitting triggers a 100s stop-and-go penalty."
          >
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-lmu-muted">Est. Energy Stint (VE)</p>
              <p className="text-xs font-mono font-bold text-indigo-300">
                ~{selectedDriver.estVeStintLaps} <span className="text-[10px] font-normal text-lmu-muted">laps / stint</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Optimal Setup Fuel Ratio & Stint Optimization Banner */}
      {fuelStrategy && fuelStrategy.optimalRatio !== null && (
        <div className="pt-2.5 border-t border-lmu-border/50 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              <Scale className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                  Recommended Setup Fuel Ratio:
                </span>
                <span
                  className="px-2 py-0.5 rounded bg-purple-950/90 text-purple-300 border border-purple-500/50 font-mono font-bold text-[11px]"
                  title="Recommended Fuel-to-Energy ratio for LMU Setup (Electronics/Strategy menu). Sets how much physical fuel to carry per % Virtual Energy."
                >
                  {fuelStrategy.optimalRatio}
                </span>
                {fuelStrategy.zeroWasteFuelPct !== null && (
                  <span className="text-lmu-muted text-[10px]">
                    (Zero-Waste Tank Fill: <strong className="text-amber-300 font-mono">~{fuelStrategy.zeroWasteFuelPct}%</strong> for full VE stint)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-lmu-muted mt-0.5">
                {fuelStrategy.limiter === 've' ? (
                  <span>
                    <strong className="text-indigo-300">⚡ Stint Limited by Virtual Energy:</strong> VE allocation runs out ~{fuelStrategy.lapDelta} laps before fuel tank (carrying ~{fuelStrategy.surplusFuelPct}% excess fuel). Set ratio to <strong className="text-white font-mono">{fuelStrategy.optimalRatio}</strong> or use lift-and-coast.
                  </span>
                ) : fuelStrategy.limiter === 'fuel' ? (
                  <span>
                    <strong className="text-amber-300">⛽ Stint Limited by Fuel Tank:</strong> Physical fuel runs dry ~{fuelStrategy.lapDelta} laps before VE is exhausted. Increase fuel ratio or short-shift.
                  </span>
                ) : (
                  <span>
                    <strong className="text-emerald-300">⚖️ Balanced Stint:</strong> Fuel tank capacity and Virtual Energy allocation run out at approximately the same time. Setup ratio is well balanced.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
