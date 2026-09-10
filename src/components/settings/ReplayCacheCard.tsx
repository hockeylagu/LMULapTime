import React, { useEffect, useRef, useState } from 'react';
import { Film, RefreshCw } from 'lucide-react';
import { ReplayCacheSummary, ReplayScanStatus } from '../../../server/types';

export interface ReplayCacheCardProps {
  replayScanStatus?: ReplayScanStatus | null;
}

export const ReplayCacheCard: React.FC<ReplayCacheCardProps> = ({ replayScanStatus }) => {
  const [replays, setReplays] = useState<ReplayCacheSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReplays = () => {
    setIsLoading(true);
    setError(null);
    fetch('/api/replays/cache')
      .then(res => res.json())
      .then(data => setReplays(Array.isArray(data) ? data : []))
      .catch(() => setError('Unable to load cached replays.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadReplays(); }, []);

  // Refresh the cached list right when a background scan finishes, so the count/table
  // don't sit stale until the user manually clicks refresh.
  const wasScanRunning = useRef(false);
  useEffect(() => {
    const isRunning = !!replayScanStatus?.running;
    if (wasScanRunning.current && !isRunning) {
      loadReplays();
    }
    wasScanRunning.current = isRunning;
  }, [replayScanStatus?.running]);

  const isReplayScanRunning = !!replayScanStatus?.running;
  const replayScanPercent = replayScanStatus && replayScanStatus.total > 0
    ? Math.round((replayScanStatus.processed / replayScanStatus.total) * 100)
    : 0;

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (ms: number) => {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="glass-panel p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-lmu-accent" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider">Cached Replays (.Vcr)</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30">
            {replays?.length ?? 0} Cached
          </span>
          <button
            type="button"
            onClick={loadReplays}
            disabled={isLoading}
            aria-label="Refresh cached replays"
            className="p-1.5 rounded-lg border border-lmu-border text-lmu-muted hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-xs text-lmu-muted leading-relaxed">
        Replay metadata, drivers, laps and full-resolution telemetry are parsed once and cached in SQLite (brotli-compressed) during each session scan, so they stay available even after LMU deletes the original .Vcr file.
      </p>

      {isReplayScanRunning && (
        <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-lmu-muted uppercase tracking-wider">
              Parsing Replays in Background
            </span>
            <span className="font-bold text-white">
              {replayScanStatus?.processed ?? 0} / {replayScanStatus?.total ?? 0}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-lmu-border/50 overflow-hidden">
            <div
              className="h-full bg-lmu-accent transition-all duration-300"
              style={{ width: `${replayScanPercent}%` }}
            />
          </div>
          {replayScanStatus?.currentFile && (
            <p className="text-[11px] text-lmu-muted font-mono truncate">
              {replayScanStatus.currentFile}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

      {replays && replays.length === 0 && !isLoading && (
        <p className="text-xs text-lmu-muted italic">No replays cached yet. Rescan from the folder paths section below.</p>
      )}

      {replays && replays.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-lmu-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-lmu-bg text-lmu-muted uppercase text-[10px]">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Replay</th>
                <th className="text-right font-semibold px-3 py-2">Drivers</th>
                <th className="text-right font-semibold px-3 py-2">Duration</th>
                <th className="text-right font-semibold px-3 py-2">Size</th>
                <th className="text-right font-semibold px-3 py-2">Compressed</th>
                <th className="text-right font-semibold px-3 py-2">Date</th>
                <th className="text-right font-semibold px-3 py-2">Trajectories</th>
              </tr>
            </thead>
            <tbody>
              {replays.map(r => (
                <tr key={r.filename} className="border-t border-lmu-border/50 hover:bg-lmu-card/50">
                  <td className="px-3 py-2 text-white font-medium truncate max-w-[220px]" title={r.filename}>{r.filename}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{r.driversCount}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{formatDuration(r.durationSec)}</td>
                  <td className="px-3 py-2 text-right font-mono text-lmu-gold">{formatBytes(r.fileSizeBytes)}</td>
                  <td className="px-3 py-2 text-right font-mono text-lmu-gold">{formatBytes(r.compressedSizeBytes)}</td>
                  <td className="px-3 py-2 text-right font-mono text-lmu-muted">{formatDate(r.replayDateMs)}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{r.trajectoriesCached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
