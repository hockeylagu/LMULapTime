import React from 'react';
import { READOUT_LABEL } from '../labelStyles.js';
import { ReplayScanStatus, ReplayUpgradeStatus, ScanStatus } from '../../../../shared/types/index.js';

interface ProgressBlockProps {
  title: string;
  /** Right of the title: the count done. */
  count: React.ReactNode;
  percent: number;
  currentFile?: string | null;
  filePercent?: number | null;
  stage?: string | null;
  testId?: string;
  children?: React.ReactNode;
}

const ProgressBlock: React.FC<ProgressBlockProps> = ({ title, count, percent, currentFile, filePercent, stage, testId, children }) => (
  <div className="bg-lmu-bg p-4 rounded-lg space-y-2" data-testid={testId}>
    <div className="flex items-center justify-between text-xs">
      <span className={READOUT_LABEL}>{title}</span>
      <span className="font-mono font-bold text-lmu-text">{count}</span>
    </div>
    <div className="w-full h-2 rounded-full bg-lmu-border/50 overflow-hidden">
      <div className="h-full bg-lmu-info transition-all duration-300" style={{ width: `${percent}%` }} />
    </div>
    {children}
    {currentFile && (
      <div className="flex flex-col gap-0.5 text-[11px] text-lmu-muted font-mono">
        <div className="flex items-center justify-between">
          <span className="truncate">{currentFile}</span>
          {filePercent !== undefined && filePercent !== null && (
            <span className="text-lmu-info font-semibold ml-2 shrink-0">{filePercent}%</span>
          )}
        </div>
        {stage && <span className="text-[10px] text-lmu-muted font-sans truncate">{stage}</span>}
      </div>
    )}
  </div>
);

export interface ReplayProgressProps {
  replayScanStatus?: ScanStatus | ReplayScanStatus | null;
  activeUpgrade: ReplayUpgradeStatus | null;
  upgradeError?: string | null;
  /** On-disk replays waiting for the upgrade; null when not known yet. */
  pendingUpgrade?: number | null;
}

/** The replay scan and the background replay upgrade, the scan and upgrade bars show only while they run; at rest a quiet line says what the upgrade has left. */
export const ReplayProgress: React.FC<ReplayProgressProps> = ({ replayScanStatus, activeUpgrade, upgradeError, pendingUpgrade = null }) => {
  const scanPercent = replayScanStatus && replayScanStatus.total > 0
    ? Math.round((replayScanStatus.processed / replayScanStatus.total) * 100)
    : 0;
  const upgradePercent = activeUpgrade && activeUpgrade.driversTotal > 0
    ? Math.round((activeUpgrade.driversDone / activeUpgrade.driversTotal) * 100)
    : 0;

  return (
    <>
      {replayScanStatus?.running && (
        <ProgressBlock
          title="Parsing Replays in Background"
          count={`${replayScanStatus.processed ?? 0} / ${replayScanStatus.total ?? 0}`}
          percent={scanPercent}
          currentFile={replayScanStatus.currentFile}
          filePercent={replayScanStatus.filePercent}
          stage={replayScanStatus.currentStage}
        />
      )}

      {activeUpgrade?.running && (
        <ProgressBlock
          testId="replay-upgrade-running"
          title="Upgrading Replay Telemetry"
          count={`${activeUpgrade.driversDone} / ${activeUpgrade.driversTotal} ${activeUpgrade.driversTotal === 1 ? 'Driver' : 'Drivers'}`}
          percent={upgradePercent}
          currentFile={activeUpgrade.currentFile}
          filePercent={activeUpgrade.filePercent}
          stage={activeUpgrade.currentStage}
        >
          <div className="flex items-center justify-between text-[11px] text-lmu-muted">
            <span>
              Replay {Math.min(activeUpgrade.processed + 1, activeUpgrade.total)} of {activeUpgrade.total}
            </span>
            <span className="font-mono">{upgradePercent}%</span>
          </div>
        </ProgressBlock>
      )}

      {!activeUpgrade?.running && !upgradeError && pendingUpgrade !== null && (
        <p className="text-xs text-lmu-muted" data-testid="replay-upgrade-rest">
          {pendingUpgrade > 0
            ? `Replay upgrade: ${pendingUpgrade} on-disk ${pendingUpgrade === 1 ? 'replay' : 'replays'} will be upgraded in the background.`
            : 'Replay upgrade: nothing to do.'}
        </p>
      )}

      {upgradeError && (
        <p className="text-xs text-lmu-muted break-words">Replay upgrade status unavailable: {upgradeError}. Use Refresh to ask again.</p>
      )}
    </>
  );
};
