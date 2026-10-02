import React from 'react';
import { Trash2 } from 'lucide-react';
import { AppStatus } from '../../../shared/types/index.js';
import { SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { InlineConfirm } from './controls/InlineConfirm.js';
import { useInlineConfirm } from './controls/useInlineConfirm.js';
import { AiSettingsState } from './hooks/useAiSettings.js';
import { ReplayCacheState } from './replays/useReplayCache.js';
import { FeedbackMessage, SettingsFeedback, SettingsPanel } from './SettingsPanel.js';
import { formatBytes, formatDateTime, formatNumber, pluralize } from './settingsFormat.js';
import { getMissingPaths } from './settingsSections.js';
import { READOUT_LABEL } from './labelStyles.js';

interface ReadoutProps {
  label: string;
  value: string;
  hint?: string;
  /** Signal colour for the value; white when everything is fine. */
  tone?: 'warn';
  /** Set the value in sans: words ("All found") rather than figures. */
  text?: boolean;
}

const Readout: React.FC<ReadoutProps> = ({ label, value, hint, tone, text }) => (
  <div className="min-w-0">
    <span className={`${READOUT_LABEL} block`}>{label}</span>
    <span className={`text-sm font-bold ${text ? '' : 'font-mono'} mt-0.5 block break-words ${tone === 'warn' ? 'text-lmu-warn' : 'text-lmu-text'}`}>{value}</span>
    {hint && <span className="text-[11px] text-lmu-muted mt-0.5 block break-words">{hint}</span>}
  </div>
);

export interface OverviewCardProps {
  status: AppStatus | null;
  replay: ReplayCacheState;
  ai: AiSettingsState;
  isClearingCache: boolean;
  /** A file scan is running on the server; clearing waits for it. */
  isScanRunning?: boolean;
  onClearCache: () => void;
  cacheMessage: SettingsFeedback | null;
}

/**
 * The page's one status card: what the app has found and stored, and the way to clear the session cache.
 * Benchmark figures live in their own card, so each number appears once on the page.
 */
export const OverviewCard: React.FC<OverviewCardProps> = ({ status, replay, ai, isClearingCache, isScanRunning = false, onClearCache, cacheMessage }) => {
  const confirm = useInlineConfirm('overview-heading');
  const missing = getMissingPaths(status);
  const cache = status?.sqliteCache;
  const sessionsKnown = cache?.sessionsCount ?? status?.sessionsCount;
  const sessionsCount = sessionsKnown ?? 0;
  const sessionsLabel = `${pluralize(sessionsCount, 'parsed session')}`;
  const counts = replay.counts;
  const telemetryFiles = cache?.telemetryFilesCount;

  const aiValue = ai.settings
    ? (ai.settings.configured ? 'Ready' : 'Optional · not set up')
    : (ai.loadError ? 'Unavailable' : '—');

  return (
    <SettingsPanel sectionId="overview">
      <div role="group" aria-label="Settings status" className="grid grid-cols-4 gap-x-6 gap-y-4">
        <Readout
          text
          label="Folders"
          value={!status ? '—' : missing.length === 0 ? 'All found' : `${missing.length} missing`}
          tone={missing.length > 0 ? 'warn' : undefined}
        />
        <Readout
          label="Sessions"
          value={status ? formatNumber(sessionsKnown) : '—'}
          hint={status && sessionsCount === 0 ? 'No sessions parsed yet' : undefined}
        />
        <Readout
          label="Replays"
          value={counts ? formatNumber(counts.total) : '—'}
          hint={counts ? (counts.total === 0 ? 'No replays cached yet' : `${formatNumber(counts.archived)} archived`) : undefined}
        />
        <Readout
          label="Telemetry files"
          value={formatNumber(telemetryFiles)}
          hint={telemetryFiles === 0 ? 'No telemetry cached yet' : undefined}
        />
        <Readout text label="AI reports" value={aiValue} />
        <Readout label="Total app database" value={cache ? formatBytes(cache.dbSizeBytes) : '—'} hint="Sessions, replays and telemetry" />
        <Readout
          label="Last synced"
          value={!status ? '—' : formatDateTime(cache?.lastSyncedAt, 'Never')}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-lmu-border pt-4">
        <p className="text-xs text-lmu-muted leading-relaxed max-w-xl">
          {sessionsCount === 0 && status
            ? 'No sessions are parsed yet, so there is nothing to clear. Set the folders below and save.'
            : 'Parsed sessions are cached in SQLite; a sync reads only new or changed logs. Clearing re-reads them from your XML logs and keeps replays and telemetry.'}
        </p>

        {confirm.isOpen ? (
          <InlineConfirm
            label="Confirm clearing the session cache"
            message={`Clear ${sessionsLabel}?`}
            confirmIcon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
            onConfirm={() => confirm.confirm(onClearCache)}
            onCancel={confirm.cancel}
          />
        ) : (
          <button
            ref={confirm.triggerRef}
            type="button"
            onClick={confirm.open}
            disabled={isClearingCache || isScanRunning || sessionsCount === 0}
            title={isScanRunning ? 'Wait for the running scan to finish' : undefined}
            className={`${SECONDARY_BUTTON} shrink-0`}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            {isClearingCache ? 'Clearing…' : 'Clear parsed sessions'}
          </button>
        )}
      </div>

      <FeedbackMessage feedback={cacheMessage} />
    </SettingsPanel>
  );
};
