import React from 'react';

export interface TelemetrySteerOverlayTogglesProps {
  scaleMode?: string;
  fittedRange?: number;
  onScaleChange?: (value: string) => void;
  showBalance: boolean;
  showScrub: boolean;
  onToggleBalance: () => void;
  onToggleScrub: () => void;
}

/** The legend-and-switch pair that turns the understeer / oversteer and tire scrub overlays on the steering trace on and off. */
export const TelemetrySteerOverlayToggles: React.FC<TelemetrySteerOverlayTogglesProps> = ({
  scaleMode = 'fit',
  fittedRange = 100,
  onScaleChange,
  showBalance,
  showScrub,
  onToggleBalance,
  onToggleScrub,
}) => (
  <div className="absolute top-0.5 right-3 z-20 flex items-center bg-lmu-strip p-0.5 pointer-events-auto">
    {onScaleChange && (
      <select aria-label="Steering scale" title="Steering vertical scale" value={scaleMode} onChange={(event) => onScaleChange(event.target.value)} className="bg-lmu-card text-lmu-muted text-[10px] font-mono px-1 py-0.5 rounded mr-1">
        <option value="fit">Fit ±{fittedRange}%</option>
        <option value="25">±25%</option>
        <option value="50">±50%</option>
        <option value="100">±100%</option>
      </select>
    )}
    <button
      type="button"
      onClick={onToggleBalance}
      aria-pressed={showBalance}
      title={showBalance ? 'Hide Understeer / Oversteer Overlay' : 'Show Understeer / Oversteer Overlay'}
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all flex items-center gap-1.5 ${
        showBalance
          ? 'bg-lmu-raised text-lmu-text border border-lmu-info-strong/40'
          : 'text-lmu-faint hover:text-lmu-text-soft hover:bg-lmu-raised/40'
      }`}
    >
      <span className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-lmu-info' : 'bg-lmu-rule-strong'}`}
        />
        <span className={showBalance ? 'text-lmu-info-soft font-black' : 'text-lmu-faint'}>US</span>
      </span>
      <span className="text-lmu-faint" aria-hidden="true">/</span>
      <span className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-lmu-warn' : 'bg-lmu-rule-strong'}`}
        />
        <span className={showBalance ? 'text-lmu-warn-soft font-black' : 'text-lmu-faint'}>OS</span>
      </span>
    </button>
    <button
      type="button"
      aria-label="Tire Push Overlay"
      aria-pressed={showScrub}
      onClick={onToggleScrub}
      title={showScrub ? 'Remove Tire Scrub Zones' : 'Add Tire Scrub Zones'}
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all flex items-center gap-1 ml-0.5 ${
        showScrub
          ? 'bg-lmu-loss-deep/80 text-lmu-loss-soft border border-lmu-loss-strong/60'
          : 'text-lmu-faint hover:text-lmu-loss-soft hover:bg-lmu-raised/40'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full transition-all ${showScrub ? 'bg-lmu-loss' : 'bg-lmu-rule-strong'}`}
      />
      <span className={showScrub ? 'text-lmu-loss-soft font-black' : 'text-lmu-faint'}>SCRUB</span>
    </button>
  </div>
);
