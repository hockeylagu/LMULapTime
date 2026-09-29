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
  <div className="absolute top-2 right-3 z-20 flex items-center rounded-lg bg-lmu-card/90 border border-lmu-rule/80 p-0.5 shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-auto">
    <button
      type="button"
      onClick={onToggleBalance}
      title={showBalance ? 'Hide Understeer / Oversteer Overlay' : 'Show Understeer / Oversteer Overlay'}
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all flex items-center gap-1.5 ${
        showBalance
          ? 'bg-lmu-raised text-lmu-text border border-lmu-info-strong/40 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
          : 'text-lmu-faint hover:text-lmu-text-soft hover:bg-lmu-raised/40'
      }`}
    >
      <span className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-lmu-info' : 'bg-lmu-rule-strong'}`}
          style={{ boxShadow: showBalance ? `0 0 4px ${TELEMETRY_COLORS.understeer}` : undefined }}
        />
        <span className={showBalance ? 'text-lmu-info-soft font-black' : 'text-lmu-faint'}>US</span>
      </span>
      <span className="text-lmu-faint" aria-hidden="true">/</span>
      <span className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-lmu-warn' : 'bg-lmu-rule-strong'}`}
          style={{ boxShadow: showBalance ? `0 0 4px ${TELEMETRY_COLORS.oversteer}` : undefined }}
        />
        <span className={showBalance ? 'text-lmu-warn-soft font-black' : 'text-lmu-faint'}>OS</span>
      </span>
    </button>
    <button
      type="button"
      aria-label="Tire Push Overlay"
      onClick={onToggleScrub}
      title={showScrub ? 'Remove Tire Scrub Zones' : 'Add Tire Scrub Zones'}
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all flex items-center gap-1 ml-0.5 ${
        showScrub
          ? 'bg-lmu-loss-deep/80 text-lmu-loss-soft border border-lmu-loss-strong/60 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
          : 'text-lmu-faint hover:text-lmu-loss-soft hover:bg-lmu-raised/40'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full transition-all ${showScrub ? 'bg-lmu-loss' : 'bg-lmu-rule-strong'}`}
        style={{ boxShadow: showScrub ? `0 0 4px ${TELEMETRY_COLORS.tireScrub}` : undefined }}
      />
      <span className={showScrub ? 'text-lmu-loss-soft font-black' : 'text-lmu-faint'}>SCRUB</span>
    </button>
  </div>
);
