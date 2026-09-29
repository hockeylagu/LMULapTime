import React from 'react';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';

export interface TelemetrySteerOverlayTogglesProps {
  showBalance: boolean;
  showScrub: boolean;
  onToggleBalance: () => void;
  onToggleScrub: () => void;
}

/** The legend-and-switch pair that turns the understeer / oversteer and tire scrub overlays on the steering trace on and off. */
export const TelemetrySteerOverlayToggles: React.FC<TelemetrySteerOverlayTogglesProps> = ({
  showBalance,
  showScrub,
  onToggleBalance,
  onToggleScrub,
}) => (
  <div className="absolute top-2 right-3 z-20 flex items-center rounded-lg bg-slate-900/90 border border-slate-700/80 p-0.5 shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-auto">
    <button
      type="button"
      onClick={onToggleBalance}
      title={showBalance ? 'Hide Understeer / Oversteer Overlay' : 'Show Understeer / Oversteer Overlay'}
      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider transition-all flex items-center gap-1.5 ${
        showBalance
          ? 'bg-slate-800 text-slate-200 border border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
      }`}
    >
      <span className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-sky-400' : 'bg-slate-600'}`}
          style={{ boxShadow: showBalance ? `0 0 4px ${TELEMETRY_COLORS.understeer}` : undefined }}
        />
        <span className={showBalance ? 'text-sky-300 font-black' : 'text-slate-500'}>US</span>
      </span>
      <span className="opacity-30">/</span>
      <span className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-amber-400' : 'bg-slate-600'}`}
          style={{ boxShadow: showBalance ? `0 0 4px ${TELEMETRY_COLORS.oversteer}` : undefined }}
        />
        <span className={showBalance ? 'text-amber-300 font-black' : 'text-slate-500'}>OS</span>
      </span>
    </button>
    <button
      type="button"
      aria-label="Tire Push Overlay"
      onClick={onToggleScrub}
      title={showScrub ? 'Remove Tire Scrub Zones' : 'Add Tire Scrub Zones'}
      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider transition-all flex items-center gap-1 ml-0.5 ${
        showScrub
          ? 'bg-rose-950/80 text-rose-300 border border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
          : 'text-slate-500 hover:text-rose-300 hover:bg-slate-800/40'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full transition-all ${showScrub ? 'bg-rose-400' : 'bg-slate-600'}`}
        style={{ boxShadow: showScrub ? `0 0 4px ${TELEMETRY_COLORS.tireScrub}` : undefined }}
      />
      <span className={showScrub ? 'text-rose-300 font-black' : 'text-slate-500'}>SCRUB</span>
    </button>
  </div>
);
