import React from 'react';
import { Zap, Trash2, CheckCircle2 } from 'lucide-react';
import { AppStatus } from '../../../server/types.js';

export interface CacheSettingsCardProps {
  status: AppStatus | null;
  isClearingCache: boolean;
  onClearCache: () => void;
  cacheMessage: string | null;
}

export const CacheSettingsCard: React.FC<CacheSettingsCardProps> = ({
  status,
  isClearingCache,
  onClearCache,
  cacheMessage,
}) => {
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const cacheLastSyncedStr = status?.sqliteCache?.lastSyncedAt
    ? new Date(status.sqliteCache.lastSyncedAt).toLocaleString()
    : 'Never';

  return (
    <div className="glass-panel p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-lmu-accent" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider">Session XML SQLite Cache</h3>
        </div>
        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30">
          {status?.sqliteCache?.sessionsCount ?? status?.sessionsCount ?? 0} Sessions Cached
        </span>
      </div>

      <p className="text-xs text-lmu-muted leading-relaxed">
        LMU XML result logs are parsed and cached into a local high-performance SQLite database. When launching the server or rescanning, an <strong>incremental delta sync</strong> checks file modification timestamps to parse only new or modified sessions, providing instant startup.
      </p>

      {/* Cache Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-lmu-bg p-3.5 rounded-xl border border-lmu-border">
          <span className="text-[11px] font-semibold text-lmu-muted uppercase block">Cached Sessions</span>
          <span className="text-base font-bold text-white font-mono mt-0.5 block">
            {status?.sqliteCache?.sessionsCount ?? status?.sessionsCount ?? 0}
          </span>
        </div>

        <div className="bg-lmu-bg p-3.5 rounded-xl border border-lmu-border">
          <span className="text-[11px] font-semibold text-lmu-muted uppercase block">Database Size</span>
          <span className="text-base font-bold text-lmu-gold font-mono mt-0.5 block">
            {formatBytes(status?.sqliteCache?.dbSizeBytes)}
          </span>
        </div>

        <div className="bg-lmu-bg p-3.5 rounded-xl border border-lmu-border col-span-2">
          <span className="text-[11px] font-semibold text-lmu-muted uppercase block">Last Delta Sync / Update</span>
          <span className="text-xs font-medium text-white font-mono mt-1 block truncate">
            {cacheLastSyncedStr}
          </span>
        </div>
      </div>

      <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-xs text-lmu-muted">
          <span>Cache Engine: </span>
          <span className="text-white font-semibold font-mono">SQLite 3 (WAL mode)</span>
          <p className="text-[11px] text-lmu-muted/80 mt-0.5">
            Clearing the cache deletes SQLite stored telemetry and allows a fresh re-parse of XML logs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClearCache}
            disabled={isClearingCache}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold text-xs uppercase tracking-wider hover:bg-red-500/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isClearingCache ? 'Clearing...' : 'Clear Cache'}
          </button>
        </div>
      </div>

      {cacheMessage && (
        <div className="p-3 rounded-xl bg-lmu-green/10 border border-lmu-green/20 text-xs font-semibold text-lmu-green flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{cacheMessage}</span>
        </div>
      )}
    </div>
  );
};
