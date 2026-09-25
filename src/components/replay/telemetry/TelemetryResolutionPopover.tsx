import React, { useRef, useEffect } from 'react';
import { Activity, Zap, Cpu, Sparkles, X, Info } from 'lucide-react';

export interface TelemetryResolutionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  telemetryResolution: number;
  onChangeResolution: (res: number) => void;
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
          <div className="p-1 rounded-lg bg-cyan-500/20 text-cyan-400">
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
          <span className="font-bold text-amber-300">
            {effectiveRaw.toLocaleString()} raw pts {rawSampleRateHz ? `@ ${rawSampleRateHz} Hz` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lmu-muted">Active In Inspector:</span>
          <span className="font-bold text-sky-400">
            {activeSampleLabel} {isFullResolution ? '(100% Full Raw)' : `(${downsampleRatio}x downsampled)`}
          </span>
        </div>
        {isZoomed && zoomedPointsCount !== undefined && (
          <div className="flex items-center justify-between border-t border-white/10 pt-1 text-emerald-400">
            <span>Zoom Window Detail:</span>
            <span className="font-bold">{zoomedPointsCount.toLocaleString()} pts in range</span>
          </div>
        )}
      </div>

      {/* Trade-off explanation */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-lmu-card/50 border border-lmu-border/40 text-[10px] text-lmu-muted leading-relaxed">
        <Info className="w-3.5 h-3.5 text-lmu-accent shrink-0 mt-0.5" />
        <span>
          <strong className="text-white font-semibold">Trade-off:</strong> Lower sample counts render faster on low-power devices.
          Higher resolution captures rapid pedal transitions, curb strikes, and eliminates apex interpolation jitter.
        </span>
      </div>

      {/* Resolution Selector Options */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wider text-lmu-muted">Select Resolution Mode</label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              onChangeResolution(1200);
              onClose();
            }}
            className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
              telemetryResolution === 1200 && !isFullResolution
                ? 'bg-sky-500/20 border-sky-500/60 text-white shadow-sm'
                : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-bold text-[11px]">
              <Cpu className="w-3 h-3 text-sky-400" />
              Standard
            </div>
            <span className="text-[9px] text-lmu-muted mt-1 font-mono">{Math.min(1200, effectiveRaw).toLocaleString()} pts</span>
            <span className="text-[9px] text-sky-300/80 mt-0.5">Fast 60fps</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeResolution(2400);
              onClose();
            }}
            className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
              telemetryResolution === 2400 && !isFullResolution
                ? 'bg-emerald-500/20 border-emerald-500/60 text-white shadow-sm'
                : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-bold text-[11px]">
              <Zap className="w-3 h-3 text-emerald-400" />
              High
            </div>
            <span className="text-[9px] text-lmu-muted mt-1 font-mono">{Math.min(2400, effectiveRaw).toLocaleString()} pts</span>
            <span className="text-[9px] text-emerald-300/80 mt-0.5">2x Precision</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeResolution(0);
              onClose();
            }}
            className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
              telemetryResolution === 0 || isFullResolution
                ? 'bg-purple-500/20 border-purple-500/60 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1 font-bold text-[11px]">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Full Raw
            </div>
            <span className="text-[9px] text-lmu-muted mt-1 font-mono">{fullRawLabel}</span>
            <span className="text-[9px] text-purple-300/80 mt-0.5">1:1 Raw Telemetry</span>
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
                  ? 'bg-amber-500/20 border-amber-500/60 text-white shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                  : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-300">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${source === 'duckdb' ? 'bg-amber-400 animate-pulse' : 'bg-amber-400/40'}`} />
                ⚡ 100Hz DuckDB
              </div>
              <span className="text-[9px] text-lmu-muted mt-1 font-mono">
                {duckdbResolutionLabel}
              </span>
              {duckdbUnavailableReason && (
                <span className="text-[9px] text-amber-300/90 mt-1 leading-tight">{duckdbUnavailableReason}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectSource('vcr')}
              className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                source === 'vcr'
                  ? 'bg-sky-500/20 border-sky-500/60 text-white shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                  : 'bg-lmu-card/40 hover:bg-lmu-card border-lmu-border text-lmu-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-[11px] text-sky-300">
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
