import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  ReplayCacheSummary,
  ReplayScanStatus,
  ReplayUpgradeStatus,
  ScanStatus,
} from '../../../shared/types/index.js';
import { fetchJson } from '../../api/apiClient.js';
import { ReplayCacheTable } from './ReplayCacheTable.js';
import { SettingsPanel } from './SettingsPanel.js';

export interface ReplayUpgradeOverview {
  status: ReplayUpgradeStatus;
  pendingReplays: number;
  pendingDrivers: number;
}

function isUpgradeOverview(value: unknown): value is ReplayUpgradeOverview {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReplayUpgradeOverview>;
  return (
    typeof candidate.pendingReplays === 'number' &&
    typeof candidate.pendingDrivers === 'number' &&
    !!candidate.status
  );
}

const UPGRADE_POLL_MS = 3000;

export interface ReplayCacheCardProps {
  replayScanStatus?: ScanStatus | ReplayScanStatus | null;
}

export const ReplayCacheCard: React.FC<ReplayCacheCardProps> = ({ replayScanStatus }) => {
  const [replays, setReplays] = useState<ReplayCacheSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOverview, setUpgradeOverview] = useState<ReplayUpgradeOverview | null>(null);
  const upgradeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadReplays = useCallback(() => {
    setIsLoading(true);
    setError(null);
    fetchJson<ReplayCacheSummary[]>('/api/replays/cache')
      .then((data) => setReplays(Array.isArray(data) ? data : []))
      .catch(() => setError('Unable to load cached replays.'))
      .finally(() => setIsLoading(false));
  }, []);

  const loadUpgrade = useCallback(() => {
    if (upgradeTimer.current) clearTimeout(upgradeTimer.current);
    fetchJson<unknown>('/api/replays/upgrade')
      .then((data) => {
        if (!isUpgradeOverview(data)) return;
        setUpgradeOverview(data);
        if (data.status.running) {
          upgradeTimer.current = setTimeout(loadUpgrade, UPGRADE_POLL_MS);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadReplays();
    loadUpgrade();
    return () => {
      if (upgradeTimer.current) clearTimeout(upgradeTimer.current);
    };
  }, [loadReplays, loadUpgrade]);

  // Refresh cached replays and check upgrade status when a background scan ends
  const isScanRunning = !!replayScanStatus?.running;
  const wasScanRunning = useRef(isScanRunning);
  useEffect(() => {
    if (wasScanRunning.current && !isScanRunning) {
      loadReplays();
      loadUpgrade();
    }
    wasScanRunning.current = isScanRunning;
  }, [isScanRunning, loadReplays, loadUpgrade]);

  // Active upgrade status from either props or polled endpoint
  const scanUpgrade =
    replayScanStatus && 'replayUpgrade' in replayScanStatus
      ? (replayScanStatus as ScanStatus).replayUpgrade
      : null;
  const activeUpgrade =
    (scanUpgrade?.running ? scanUpgrade : null) ??
    (upgradeOverview?.status?.running ? upgradeOverview.status : null);
  const isUpgradeRunning = !!activeUpgrade?.running;

  // Refresh replays table once background upgrade completes
  const wasUpgradeRunning = useRef(isUpgradeRunning);
  useEffect(() => {
    if (wasUpgradeRunning.current && !isUpgradeRunning) {
      loadReplays();
    }
    wasUpgradeRunning.current = isUpgradeRunning;
  }, [isUpgradeRunning, loadReplays]);

  const replayScanPercent =
    replayScanStatus && replayScanStatus.total > 0
      ? Math.round((replayScanStatus.processed / replayScanStatus.total) * 100)
      : 0;

  const upgradePercent =
    activeUpgrade && activeUpgrade.driversTotal > 0
      ? Math.round((activeUpgrade.driversDone / activeUpgrade.driversTotal) * 100)
      : 0;

  return (
    <SettingsPanel
      sectionId="replay-cache"
      aside={
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-lmu-muted">
            {replays?.length ?? 0} Cached
          </span>
          <button
            type="button"
            onClick={loadReplays}
            disabled={isLoading}
            aria-label="Refresh cached replays"
            className="p-1.5 rounded-md text-lmu-muted hover:text-white hover:bg-lmu-card-hover transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-lmu-accent-text"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      <p className="text-xs text-lmu-muted leading-relaxed">
        Replay metadata, drivers, laps and full-resolution telemetry are parsed once and cached in
        SQLite (brotli-compressed) during each session scan, so they stay available even after LMU
        deletes the original .VCR file.
      </p>

      {/* Background Replay Scan Progress (when scanning disk) */}
      {isScanRunning && (
        <div className="bg-lmu-bg p-4 rounded-lg space-y-2">
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
              className="h-full bg-lmu-info transition-all duration-300"
              style={{ width: `${replayScanPercent}%` }}
            />
          </div>
          {replayScanStatus?.currentFile && (
            <div className="flex flex-col gap-0.5 text-[11px] text-lmu-muted font-mono">
              <div className="flex items-center justify-between">
                <span className="truncate">{replayScanStatus.currentFile}</span>
                {replayScanStatus.filePercent !== undefined &&
                  replayScanStatus.filePercent !== null && (
                    <span className="text-lmu-info font-semibold ml-2 shrink-0">
                      {replayScanStatus.filePercent}%
                    </span>
                  )}
              </div>
              {replayScanStatus.currentStage && (
                <span className="text-[10px] text-lmu-faint font-sans truncate">
                  {replayScanStatus.currentStage}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Background Replay Upgrade Progress (only shown when an upgrade is running) */}
      {isUpgradeRunning && activeUpgrade && (
        <div className="bg-lmu-bg p-4 rounded-lg space-y-2" data-testid="replay-upgrade-running">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-lmu-muted uppercase tracking-wider">
              Upgrading Replay Telemetry
            </span>
            <span className="font-mono font-bold text-white">
              {activeUpgrade.driversDone} / {activeUpgrade.driversTotal} Drivers
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-lmu-border/50 overflow-hidden">
            <div
              className="h-full bg-lmu-info transition-all duration-300"
              style={{ width: `${upgradePercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-lmu-muted">
            <span>
              Replay {Math.min(activeUpgrade.processed + 1, activeUpgrade.total)} of{' '}
              {activeUpgrade.total}
            </span>
            <span className="font-mono">{upgradePercent}%</span>
          </div>
          {activeUpgrade.currentFile && (
            <div className="flex flex-col gap-0.5 text-[11px] text-lmu-muted font-mono">
              <div className="flex items-center justify-between">
                <span className="truncate">{activeUpgrade.currentFile}</span>
                {activeUpgrade.filePercent !== null && activeUpgrade.filePercent !== undefined && (
                  <span className="text-lmu-info font-semibold ml-2 shrink-0">
                    {activeUpgrade.filePercent}%
                  </span>
                )}
              </div>
              {activeUpgrade.currentStage && (
                <span className="text-[10px] text-lmu-faint font-sans truncate">
                  {activeUpgrade.currentStage}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-lmu-loss">
          {error}
        </p>
      )}

      {replays && replays.length === 0 && !isLoading && (
        <p className="text-xs text-lmu-faint">
          No replays cached yet. Rescan from Folder Paths &amp; Driver.
        </p>
      )}

      {replays && replays.length > 0 && <ReplayCacheTable replays={replays} />}
    </SettingsPanel>
  );
};
