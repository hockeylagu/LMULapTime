import React, { useRef, useEffect } from 'react';
import { Activity, Zap, Cpu, Sparkles, X, Info, Film } from 'lucide-react';
import { TELEMETRY_POINT_SPACING_M, TelemetryResolution } from './telemetryResolution.js';

export interface TelemetryResolutionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  telemetryResolution: TelemetryResolution;
  onChangeResolution: (res: TelemetryResolution) => void;
  pointsCount: number;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  vcrRawPointsCount?: number;
  vcrRawSampleRateHz?: number;
  duckdbRawPointsCount?: number;
  duckdbRawSampleRateHz?: number;
  isFullResolution?: boolean;
  isZoomed?: boolean;
  zoomedPointsCount?: number;
  source?: 'vcr' | 'duckdb';
  duckdbFilename?: string;
  hasDuckDb?: boolean;
  duckdbUnavailableReason?: string;
  onSelectSource?: (source: 'duckdb' | 'vcr') => void;
}

export const TelemetryResolutionPopover: React.FC<TelemetryResolutionPopoverProps> = ({
  isOpen,
  onClose,
  telemetryResolution,
  onChangeResolution,
  pointsCount,
  rawPointsCount,
  rawSampleRateHz,
  vcrRawPointsCount,
  vcrRawSampleRateHz,
  duckdbRawPointsCount,
  duckdbRawSampleRateHz,
  isFullResolution,
  isZoomed,
  zoomedPointsCount,
  source,
  duckdbFilename,
  hasDuckDb,
  duckdbUnavailableReason,
  onSelectSource,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasSourceSelector = Boolean((hasDuckDb || duckdbFilename) && onSelectSource);
  const effectiveRaw = rawPointsCount ?? pointsCount;
  const downsampleRatio = effectiveRaw > 0 && pointsCount > 0 ? (effectiveRaw / pointsCount).toFixed(1) : '1.0';
  const vcrResolutionLabel = `${(vcrRawPointsCount ?? effectiveRaw).toLocaleString()} pts${vcrRawSampleRateHz ? ` @ ${vcrRawSampleRateHz} Hz` : ''}`;
  const duckdbResolutionLabel = `${(duckdbRawPointsCount ?? effectiveRaw).toLocaleString()} pts${duckdbRawSampleRateHz ? ` @ ${duckdbRawSampleRateHz} Hz` : ''}`;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Telemetry resolution"
      className="absolute top-9 right-0 z-[100] w-80 sm:w-96 p-4 rounded-xl bg-lmu-card border border-lmu-border shadow-2xl text-xs font-sans space-y-3 animate-pop-in"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-lmu-border/60 pb-2">
        <div className="flex items-center gap-2">
          <div className="text-lmu-info">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-semibold text-white text-xs">Telemetry Resolution & Fidelity</h4>
            <p className="text-[10px] text-lmu-muted">Sample Rate & Precision</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"
          title="Close"
          aria-label="Close resolution selector"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Replay Fidelity Stats Card */}
      <div className="space-y-1.5 text-[11px]">
        {!hasSourceSelector && (
        <div className="flex items-center justify-between">
          <span className="text-lmu-muted">Recorded samples:</span>
          <span className="font-mono font-semibold text-lmu-warn-soft">
            {effectiveRaw.toLocaleString()} raw pts {rawSampleRateHz ? `@ ${rawSampleRateHz} Hz` : ''}
          </span>
        </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-lmu-muted">Downsampling:</span>
          <span className={`font-mono font-semibold ${telemetryResolution === 'full' || isFullResolution ? 'text-lmu-violet-soft' : telemetryResolution === 'high' ? 'text-lmu-gain-soft' : 'text-lmu-info-soft'}`}>
            {isFullResolution || telemetryResolution === 'full' ? 'None · original samples' : `${downsampleRatio}× fewer points`}
          </span>
        </div>
        {isZoomed && zoomedPointsCount !== undefined && (
          <div className="flex items-center justify-between border-t border-white/10 pt-1 text-lmu-gain">
            <span>Zoom Window Detail:</span>
            <span className="font-bold">{zoomedPointsCount.toLocaleString()} pts in range</span>
          </div>
        )}
      </div>

      {/* Trade-off explanation */}
      <div className="flex items-start gap-2 text-[10px] text-lmu-muted leading-relaxed">
        <Info className="w-3.5 h-3.5 text-lmu-muted shrink-0 mt-0.5" />
        <span>
          <strong className="text-white font-semibold">Trade-off:</strong> Points are spaced along the lap, so every track gets the same detail.
          Fewer points load faster; scrubbing costs the same at any resolution. Full Raw keeps every recorded sample.
        </span>
      </div>

      {/* Resolution Selector Options */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-lmu-text-soft">Select Resolution Mode</label>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => {
              onChangeResolution('standard');
              onClose();
            }}
            aria-pressed={telemetryResolution === 'standard' && !isFullResolution}
            className={`p-2 rounded border text-left flex flex-col justify-between transition-colors cursor-pointer ${
              telemetryResolution === 'standard' && !isFullResolution
                ? 'bg-lmu-info-strong/10 border-lmu-info/45 text-lmu-info-soft'
                : 'bg-transparent hover:bg-lmu-raised/40 border-transparent text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-semibold text-[11px]">
              <Cpu className="w-3 h-3 text-lmu-info" />
              Standard
            </div>
            <span className="text-[10px] text-lmu-muted mt-1 font-mono">1 pt / {TELEMETRY_POINT_SPACING_M.standard} m</span>
            <span className="text-[10px] text-lmu-muted mt-0.5">Lighter payload</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeResolution('high');
              onClose();
            }}
            aria-pressed={telemetryResolution === 'high' && !isFullResolution}
            className={`p-2 rounded border text-left flex flex-col justify-between transition-colors cursor-pointer ${
              telemetryResolution === 'high' && !isFullResolution
                ? 'bg-lmu-gain-strong/10 border-lmu-gain/45 text-lmu-gain-soft'
                : 'bg-transparent hover:bg-lmu-raised/40 border-transparent text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-semibold text-[11px]">
              <Zap className="w-3 h-3 text-lmu-gain" />
              High
            </div>
            <span className="text-[10px] text-lmu-muted mt-1 font-mono">1 pt / {TELEMETRY_POINT_SPACING_M.high} m</span>
            <span className="text-[10px] text-lmu-muted mt-0.5">Default</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeResolution('full');
              onClose();
            }}
            aria-pressed={telemetryResolution === 'full' || Boolean(isFullResolution)}
            className={`p-2 rounded border text-left flex flex-col justify-between transition-colors cursor-pointer ${
              telemetryResolution === 'full' || isFullResolution
                ? 'bg-lmu-violet-strong/10 border-lmu-violet/45 text-lmu-violet-soft'
                : 'bg-transparent hover:bg-lmu-raised/40 border-transparent text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-semibold text-[11px]">
              <Sparkles className="w-3 h-3 text-lmu-violet-soft" />
              Full Raw
            </div>
            <span className="text-[10px] text-lmu-muted mt-1 font-mono">Every sample</span>
            <span className="text-[10px] text-lmu-muted mt-0.5">Maximum detail</span>
          </button>
        </div>
      </div>

      {/* Telemetry Data Source Selector */}
      {hasSourceSelector && onSelectSource && (
        <div className="space-y-1.5 pt-2 border-t border-lmu-border/60">
          <label className="text-[11px] font-medium text-lmu-text-soft">Telemetry Data Source</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (!duckdbUnavailableReason) onSelectSource('duckdb');
              }}
              disabled={Boolean(duckdbUnavailableReason)}
              aria-pressed={source === 'duckdb'}
              className={`p-2 rounded border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                duckdbUnavailableReason
                  ? 'border-lmu-border/50 bg-black/20 text-lmu-muted opacity-60 cursor-not-allowed'
                  : source === 'duckdb'
                  ? 'bg-lmu-warn-strong/10 border-lmu-warn/45 text-lmu-warn-soft'
                  : 'bg-transparent hover:bg-lmu-raised/40 border-transparent text-lmu-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                <Zap className="w-3 h-3 text-lmu-warn" />
                100Hz DuckDB
              </div>
              <span className="text-[10px] text-lmu-muted mt-1 font-mono">
                {duckdbResolutionLabel}
              </span>
              {duckdbUnavailableReason && (
                <span className="text-[10px] text-lmu-warn-soft/90 mt-1 leading-tight">{duckdbUnavailableReason}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectSource('vcr')}
              aria-pressed={source === 'vcr'}
              className={`p-2 rounded border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                source === 'vcr'
                  ? 'bg-lmu-info-strong/10 border-lmu-info/45 text-lmu-info-soft'
                  : 'bg-transparent hover:bg-lmu-raised/40 border-transparent text-lmu-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                <Film className="w-3 h-3 text-lmu-info" />
                Native VCR
              </div>
              <span className="text-[10px] text-lmu-muted mt-1 font-mono">{vcrResolutionLabel}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
