import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { ReplayScanStatus, ReplayUpgradeStatus } from '../../../shared/types/index.js';
import { fetchJson, postJson } from '../../api/apiClient.js';

// Progress of the background re-decode of on-disk replays stored by an older parser version.
// The job can run for hours, long after the app's scan polling has stopped, so the card polls
// its own endpoint while the job runs.

const POLL_MS = 3000;

export interface ReplayUpgradeOverview {
  status: ReplayUpgradeStatus;
  pendingReplays: number;
  pendingDrivers: number;
}

function isOverview(value: unknown): value is ReplayUpgradeOverview {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReplayUpgradeOverview>;
  return typeof candidate.pendingReplays === 'number' && typeof candidate.pendingDrivers === 'number' && !!candidate.status;
}

export interface ReplayUpgradeCardProps {
  replayScanStatus?: ReplayScanStatus | null;
}

export const ReplayUpgradeCard: React.FC<ReplayUpgradeCardProps> = ({ replayScanStatus }) => {
  const [overview, setOverview] = useState<ReplayUpgradeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    fetchJson<unknown>('/api/replays/upgrade')
      .then((data) => {
        if (!isOverview(data)) return;
        setOverview(data);
        setError(null);
        if (data.status.running) timer.current = setTimeout(load, POLL_MS);
      })
      .catch(() => setError('Unable to load the replay upgrade status.'));
  }, []);

  useEffect(() => {
    load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  // A replay scan pauses the upgrade, and the upgrade resumes when the scan ends.
  const scanRunning = !!replayScanStatus?.running;
  const wasScanRunning = useRef(scanRunning);
  useEffect(() => {
    if (wasScanRunning.current !== scanRunning) load();
    wasScanRunning.current = scanRunning;
  }, [scanRunning, load]);

  const toggle = () => {
    if (!overview) return;
    setIsToggling(true);
    postJson<unknown>('/api/replays/upgrade', { enabled: !overview.status.enabled })
      .then(() => load())
      .catch(() => setError('Unable to change the replay upgrade setting.'))
      .finally(() => setIsToggling(false));
  };

  const status = overview?.status;
  const runPercent = status && status.driversTotal > 0 ? Math.round((status.driversDone / status.driversTotal) * 100) : 0;

  const idleMessage = (): string => {
    if (!overview || !status) return '';
    if (overview.pendingDrivers === 0 && overview.pendingReplays === 0) return 'Every replay still on disk is stored at the current version.';
    const waiting = `${overview.pendingDrivers} drivers in ${overview.pendingReplays} replays are waiting`;
    if (!status.enabled) return `Turned off. ${waiting}.`;
    if (scanRunning) return `Paused while replays are scanned. ${waiting}.`;
    return `${waiting}; the upgrade continues after the next replay scan.`;
  };

  return (
    <div className="bg-lmu-card border border-lmu-border p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="w-5 h-5 text-lmu-accent-text" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider">Replay Upgrade</h3>
        </div>
        {status && (
          <button
            type="button"
            role="switch"
            aria-checked={status.enabled}
            aria-label="Upgrade replays in the background"
            onClick={toggle}
            disabled={isToggling}
            className={`px-2.5 py-0.5 rounded text-xs font-semibold border transition-all disabled:opacity-50 cursor-pointer ${
              status.enabled
                ? 'bg-lmu-gain-strong/15 text-lmu-gain border-lmu-gain-strong/30'
                : 'bg-lmu-bg text-lmu-muted border-lmu-border'
            }`}
          >
            {status.enabled ? 'On' : 'Off'}
          </button>
        )}
      </div>

      <p className="text-xs text-lmu-muted leading-relaxed">
        Replays cached by an older parser stay usable. While LMU still has the .VCR file, each driver is decoded again at the current version in the background, one at a time, after new files are scanned. Replays LMU has deleted are never touched.
      </p>

      {status?.running ? (
        <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-lmu-muted uppercase tracking-wider">Upgrading Drivers</span>
            <span className="font-mono font-bold text-white">
              {status.driversDone} / {status.driversTotal}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-lmu-border/50 overflow-hidden">
            <div className="h-full bg-lmu-accent transition-all duration-300" style={{ width: `${runPercent}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-lmu-muted">
            <span>Replay {Math.min(status.processed + 1, status.total)} of {status.total}</span>
            <span className="font-mono">{runPercent}%</span>
          </div>
          {status.currentFile && (
            <div className="flex flex-col gap-0.5 text-[11px] text-lmu-muted font-mono">
              <div className="flex items-center justify-between">
                <span className="truncate">{status.currentFile}</span>
                {status.filePercent !== null && (
                  <span className="text-lmu-info font-semibold ml-2 shrink-0">{status.filePercent}%</span>
                )}
              </div>
              {status.currentStage && (
                <span className="text-[10px] text-lmu-muted font-sans italic truncate">{status.currentStage}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        overview && <p className="text-xs text-white">{idleMessage()}</p>
      )}

      {status?.result && !status.running && (
        <p className="text-[11px] text-lmu-muted">
          Last run: <span className="font-mono text-lmu-gain">{status.result.upgraded}</span> drivers upgraded
          {status.result.failed > 0 && <>, <span className="font-mono text-lmu-loss">{status.result.failed}</span> failed (kept at their older version)</>}
          {status.result.interrupted && ' — paused'}
        </p>
      )}

      {(error || status?.error) && <p className="text-xs font-semibold text-lmu-loss">{error || status?.error}</p>}
    </div>
  );
};
