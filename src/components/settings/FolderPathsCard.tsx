import React from 'react';
import { HardDrive, User, RefreshCw } from 'lucide-react';
import { AppStatus, SessionScanStatus } from '../../../shared/types/index.js';
import { PathField } from './PathField.js';
import { FeedbackMessage, SettingsFeedback, SettingsPanel } from './SettingsPanel.js';

export interface FolderPathsCardProps {
  status: AppStatus | null;
  resultsDirInput: string;
  setResultsDirInput: (val: string) => void;
  replaysDirInput: string;
  setReplaysDirInput: (val: string) => void;
  telemetryDirInput: string;
  setTelemetryDirInput: (val: string) => void;
  playerNameInput: string;
  setPlayerNameInput: (val: string) => void;
  isScanning: boolean;
  onScanPaths: (e: React.FormEvent) => void;
  pathMessage: SettingsFeedback | null;
  sessionScanStatus?: SessionScanStatus | null;
}

export const FolderPathsCard: React.FC<FolderPathsCardProps> = ({
  status,
  resultsDirInput,
  setResultsDirInput,
  replaysDirInput,
  setReplaysDirInput,
  telemetryDirInput,
  setTelemetryDirInput,
  playerNameInput,
  setPlayerNameInput,
  isScanning,
  onScanPaths,
  pathMessage,
  sessionScanStatus,
}) => {
  const sessionScanPercent = sessionScanStatus?.total && sessionScanStatus.total > 0
    ? Math.round(((sessionScanStatus.processed ?? 0) / sessionScanStatus.total) * 100)
    : 0;
  const folderIcon = <HardDrive className="w-4 h-4" aria-hidden="true" />;

  return (
    <SettingsPanel sectionId="folder-paths">
      <p className="text-xs text-lmu-muted">
        Where Le Mans Ultimate writes XML results, VCR replays and DuckDB telemetry.
      </p>

      {sessionScanStatus?.running && (
        <div className="bg-lmu-bg p-4 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-lmu-muted uppercase tracking-wider">Parsing XML Session Logs</span>
            <span className="font-bold text-white">
              {sessionScanStatus.processed ?? 0} / {sessionScanStatus.total ?? 0}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-lmu-border/50 overflow-hidden">
            <div className="h-full bg-lmu-info transition-all duration-300" style={{ width: `${sessionScanPercent}%` }} />
          </div>
          {sessionScanStatus.currentFile && (
            <div className="flex flex-col gap-0.5 text-[11px] text-lmu-muted font-mono">
              <div className="flex items-center justify-between">
                <span className="truncate">{sessionScanStatus.currentFile}</span>
                {sessionScanStatus.filePercent !== undefined && sessionScanStatus.filePercent !== null && (
                  <span className="text-lmu-info font-semibold ml-2 shrink-0">{sessionScanStatus.filePercent}%</span>
                )}
              </div>
              {sessionScanStatus.currentStage && (
                <span className="text-[10px] text-lmu-faint font-sans truncate">{sessionScanStatus.currentStage}</span>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={onScanPaths} className="space-y-4">
        <PathField
          id="player-name"
          label="Driver name"
          help="Personal records and sector bests are credited to this name. It is read from LMU's settings when available."
          value={playerNameInput}
          onChange={setPlayerNameInput}
          icon={<User className="w-4 h-4" aria-hidden="true" />}
          placeholder="Your LMU driver name"
          plain
        />
        <PathField
          id="results-dir"
          label="Results logs"
          help="XML session logs, usually UserData\LOG\Results."
          value={resultsDirInput}
          onChange={setResultsDirInput}
          icon={folderIcon}
          savedValue={status?.resultsDir}
          exists={status?.resultsExist}
        />
        <PathField
          id="replays-dir"
          label="Replays"
          help="VCR replay files, usually UserData\Replays."
          value={replaysDirInput}
          onChange={setReplaysDirInput}
          icon={folderIcon}
          savedValue={status?.replaysDir}
          exists={status?.replaysExist}
        />
        <PathField
          id="telemetry-dir"
          label="Telemetry"
          help="DuckDB telemetry files, the primary source for your own laps."
          value={telemetryDirInput}
          onChange={setTelemetryDirInput}
          icon={folderIcon}
          savedValue={status?.telemetryDir}
          exists={status?.telemetryExist}
          placeholder="C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry"
        />

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={isScanning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-lmu-accent text-white font-semibold text-xs hover:bg-lmu-accent/90 transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning folders...' : 'Rescan & load telemetry'}
          </button>
          <FeedbackMessage feedback={pathMessage} />
        </div>
      </form>
    </SettingsPanel>
  );
};
