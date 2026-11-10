import React from 'react';
import { READOUT_LABEL } from '../labelStyles.js';
import { ReplayScanStatus, ScanStatus } from '../../../../shared/types/index.js';

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
}

/** The replay scan bar, shown only while the scan runs. */
export const ReplayProgress: React.FC<ReplayProgressProps> = ({ replayScanStatus }) => {
  const scanPercent = replayScanStatus && replayScanStatus.total > 0
    ? Math.round((replayScanStatus.processed / replayScanStatus.total) * 100)
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
    </>
  );
};
