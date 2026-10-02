import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AppStatus } from '../../../shared/types/index.js';
import { FeedbackMessage, SettingsFeedback, SettingsPanel } from './SettingsPanel.js';
import { formatBytes, formatDateTime } from './settingsFormat.js';

export interface CacheSettingsCardProps {
  status: AppStatus | null;
  isClearingCache: boolean;
  onClearCache: () => void;
  cacheMessage: SettingsFeedback | null;
}

const STAT_LABEL = 'text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block';
const STAT_VALUE = 'text-base font-bold text-white font-mono mt-0.5 block';
const SECONDARY_BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lmu-card border border-lmu-rule text-lmu-text-soft font-semibold text-xs hover:bg-lmu-card-hover transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text';

export const CacheSettingsCard: React.FC<CacheSettingsCardProps> = ({
  status,
  isClearingCache,
  onClearCache,
  cacheMessage,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const sessionsCount = status?.sqliteCache?.sessionsCount ?? status?.sessionsCount ?? 0;
  const lastSynced = status?.sqliteCache?.lastSyncedAt ? formatDateTime(status.sqliteCache.lastSyncedAt) : 'Never';
  const sessionsLabel = `${sessionsCount} parsed session${sessionsCount === 1 ? '' : 's'}`;

  const confirmClear = () => {
    setIsConfirming(false);
    onClearCache();
  };

  return (
    <SettingsPanel sectionId="cache-settings">
      <p className="text-xs text-lmu-muted leading-relaxed">
        XML result logs are parsed once and kept in a local SQLite database. A rescan only reads new or changed logs, so the app starts fast.
      </p>

      <div className="grid grid-cols-5 gap-x-4 gap-y-4 border-y border-lmu-border py-4">
        <div>
          <span className={STAT_LABEL}>Cached Sessions</span>
          <span className={STAT_VALUE}>{sessionsCount}</span>
        </div>
        <div>
          <span className={STAT_LABEL}>Database Size</span>
          <span className={STAT_VALUE}>{formatBytes(status?.sqliteCache?.dbSizeBytes)}</span>
        </div>
        <div>
          <span className={STAT_LABEL}>Cached Replays</span>
          <span className={STAT_VALUE}>{status?.sqliteCache?.replaysCount ?? 0}</span>
        </div>
        <div>
          <span className={STAT_LABEL}>Cached Telemetry</span>
          <span className={STAT_VALUE}>{status?.sqliteCache?.telemetryFilesCount ?? 0}</span>
        </div>
        <div>
          <span className={STAT_LABEL}>Last Synced</span>
          <span className="text-xs font-medium text-white font-mono mt-1 block">{lastSynced}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-lmu-muted">
          Clearing deletes {sessionsLabel}; they are re-read from your XML logs. Cached replays and telemetry are kept.
        </p>

        {isConfirming ? (
          <div
            role="group"
            aria-label="Confirm clearing the session cache"
            onKeyDown={(e) => { if (e.key === 'Escape') setIsConfirming(false); }}
            className="flex items-center gap-2 shrink-0"
          >
            <span className="text-xs text-lmu-text-soft">Clear {sessionsLabel}?</span>
            <button type="button" onClick={confirmClear} className={SECONDARY_BUTTON}>
              <Trash2 className="w-3.5 h-3.5" />
              Confirm
            </button>
            <button type="button" autoFocus onClick={() => setIsConfirming(false)} className={SECONDARY_BUTTON}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            disabled={isClearingCache || sessionsCount === 0}
            className={`${SECONDARY_BUTTON} shrink-0`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isClearingCache ? 'Clearing...' : 'Clear cache'}
          </button>
        )}
      </div>

      <FeedbackMessage feedback={cacheMessage} />
    </SettingsPanel>
  );
};
