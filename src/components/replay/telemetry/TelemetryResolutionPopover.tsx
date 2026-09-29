import React, { useRef, useEffect } from 'react';
import { Activity, Zap, Cpu, Sparkles, X, Info } from 'lucide-react';
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

  const effectiveRaw = rawPointsCount ?? pointsCount;
  const downsampleRatio = effectiveRaw > 0 && pointsCount > 0 ? (effectiveRaw / pointsCount).toFixed(1) : '1.0';
  const activeSampleLabel = `${(pointsCount || effectiveRaw || 1200).toLocaleString()} pts`;
  const fullRawLabel = `${(effectiveRaw || pointsCount || 1200).toLocaleString()} pts`;
  const vcrResolutionLabel = `${(vcrRawPointsCount ?? effectiveRaw).toLocaleString()} pts${vcrRawSampleRateHz ? ` @ ${vcrRawSampleRateHz} Hz` : ''}`;
  const duckdbResolutionLabel = `${(duckdbRawPointsCount ?? effectiveRaw).toLocaleString()} pts${duckdbRawSampleRateHz ? ` @ ${duckdbRawSampleRateHz} Hz` : ''}`;

  return (
    <div
      ref={popoverRef}
      className="absolute top-9 right-0 z-[100] w-80 sm:w-96 p-4 rounded-xl bg-lmu-card border border-lmu-border shadow-2xl text-xs font-sans space-y-3 animate-fadeIn backdrop-blur-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-lmu-border/60 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-lmu-aqua-strong/20 text-lmu-aqua">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-white text-xs">Telemetry Resolution & Fidelity</h4>
            <p className="text-[10px] text-lmu-muted">Sample Rate & Precision</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Replay Fidelity Stats Card */}
      <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 space-y-1.5 font-mono text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-lmu-muted">Source Max Fidelity:</span>
          <span className="font-bold text-lmu-warn-soft">
            {effectiveRaw.toLocaleString()} raw pts {rawSampleRateHz ? `@ ${rawSampleRateHz} Hz` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lmu-muted">Active In Inspector:</span>
          <span className="font-bold text-lmu-info">
            {activeSampleLabel} {isFullResolution ? '(100% Full Raw)' : `(${downsampleRatio}x downsampled)`}
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
      <div className="flex items-start gap-2 p-2 rounded-lg bg-lmu-card/50 border border-lmu-border/40 text-[10px] text-lmu-muted leading-relaxed">
        <Info className="w-3.5 h-3.5 text-lmu-accent-text shrink-0 mt-0.5" />
        <span>
          <strong className="text-white font-semibold">Trade-off:</strong> Points are spaced along the lap, so every track gets the same detail.
          Fewer points load faster; scrubbing costs the same at any resolution. Full Raw keeps every recorded sample.
        </span>
      </div>

      {/* Resolution Selector Options */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-lmu-muted">Select Resolution Mode</label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              onChangeResolution('standard');
              onClose();
            }}
            className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
              telemetryResolution === 'standard' && !isFullResolution
                ? 'bg-lmu-info-strong/20 border-lmu-info-strong/60 text-white shadow-sm'
                : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-bold text-[11px]">
              <Cpu className="w-3 h-3 text-lmu-info" />
              Standard
            </div>
            <span className="text-[9px] text-lmu-muted mt-1 font-mono">1 pt / {TELEMETRY_POINT_SPACING_M.standard} m</span>
            <span className="text-[9px] text-lmu-info-soft/80 mt-0.5">Lighter payload</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeResolution('high');
              onClose();
            }}
            className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
              telemetryResolution === 'high' && !isFullResolution
                ? 'bg-lmu-gain-strong/20 border-lmu-gain-strong/60 text-white shadow-sm'
                : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-bold text-[11px]">
              <Zap className="w-3 h-3 text-lmu-gain" />
              High
            </div>
            <span className="text-[9px] text-lmu-muted mt-1 font-mono">1 pt / {TELEMETRY_POINT_SPACING_M.high} m</span>
            <span className="text-[9px] text-lmu-gain-soft/80 mt-0.5">Default</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeResolution('full');
              onClose();
            }}
            className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
              telemetryResolution === 'full' || isFullResolution
                ? 'bg-lmu-purple-strong/20 border-lmu-purple-strong/60 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-bold text-[11px]">
              <Sparkles className="w-3 h-3 text-lmu-purple" />
              Full Raw
            </div>
            <span className="text-[9px] text-lmu-muted mt-1 font-mono">{fullRawLabel}</span>
            <span className="text-[9px] text-lmu-purple-soft/80 mt-0.5">1:1 Raw Telemetry</span>
          </button>
        </div>
      </div>

      {/* Telemetry Data Source Selector */}
      {(hasDuckDb || duckdbFilename) && onSelectSource && (
        <div className="space-y-1.5 pt-2 border-t border-lmu-border/60">
          <label className="text-[10px] font-bold uppercase tracking-wider text-lmu-muted">Telemetry Data Source</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                if (!duckdbUnavailableReason) onSelectSource('duckdb');
              }}
              disabled={Boolean(duckdbUnavailableReason)}
              className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                duckdbUnavailableReason
                  ? 'border-lmu-border/50 bg-black/20 text-lmu-muted opacity-60 cursor-not-allowed'
                  : source === 'duckdb'
                  ? 'bg-lmu-warn-strong/20 border-lmu-warn-strong/60 text-white shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                  : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-lmu-warn-soft">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${source === 'duckdb' ? 'bg-lmu-warn animate-pulse' : 'bg-lmu-warn/40'}`} />
                ⚡ 100Hz DuckDB
              </div>
              <span className="text-[9px] text-lmu-muted mt-1 font-mono">
                {duckdbResolutionLabel}
              </span>
              {duckdbUnavailableReason && (
                <span className="text-[9px] text-lmu-warn-soft/90 mt-1 leading-tight">{duckdbUnavailableReason}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectSource('vcr')}
              className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                source === 'vcr'
                  ? 'bg-lmu-info-strong/20 border-lmu-info-strong/60 text-white shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                  : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-lmu-info-soft">
                🎬 Native VCR
              </div>
              <span className="text-[9px] text-lmu-muted mt-1 font-mono">{vcrResolutionLabel}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
