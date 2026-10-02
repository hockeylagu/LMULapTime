import React from 'react';
import { HardDrive, User, Save, RotateCcw } from 'lucide-react';
import { AppStatus, SessionScanStatus } from '../../../shared/types/index.js';
import { normalizeFolderPath } from '../../../shared/domain/folderPath.js';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { PathField } from './PathField.js';
import type { PathErrors } from './useSettingsActions.js';
import { READOUT_LABEL } from './labelStyles.js';
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
  /** Errors by field, shown under each input. */
  pathErrors?: PathErrors;
  /** A scan the server is already running (not started here): Saving waits for it. */
  isScanRunning?: boolean;
  onScanPaths: (e: React.FormEvent) => void;
  pathMessage: SettingsFeedback | null;
  sessionScanStatus?: SessionScanStatus | null;
}

/** Where Steam puts LMU by default: shown as a placeholder only, never filled into a field. */
const STEAM_USERDATA = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\';

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
  pathErrors = {},
  isScanRunning = false,
  onScanPaths,
  pathMessage,
  sessionScanStatus,
}) => {
  const sessionScanPercent = sessionScanStatus?.total && sessionScanStatus.total > 0
    ? Math.min(100, Math.round(((sessionScanStatus.processed ?? 0) / sessionScanStatus.total) * 100))
    : 0;
  const isDirty =
    normalizeFolderPath(resultsDirInput) !== (status?.resultsDir ?? '') ||
    normalizeFolderPath(replaysDirInput) !== (status?.replaysDir ?? '') ||
    normalizeFolderPath(telemetryDirInput) !== (status?.telemetryDir ?? '') ||
    playerNameInput.trim() !== (status?.playerName ?? '').trim();
  // Stay visible while the save is in flight, even if the fields already match the saved values.
  const showActions = isDirty || isScanning;
  const busy = isScanning || isScanRunning;
  const discard = () => {
    setResultsDirInput(status?.resultsDir ?? '');
    setReplaysDirInput(status?.replaysDir ?? '');
    setTelemetryDirInput(status?.telemetryDir ?? '');
    setPlayerNameInput(status?.playerName ?? '');
  };
  const folderIcon = <HardDrive className="w-4 h-4" aria-hidden="true" />;

  return (
    <SettingsPanel sectionId="folder-paths">
      <p className="text-xs text-lmu-muted">
        Where Le Mans Ultimate writes XML results, VCR replays and DuckDB telemetry.
      </p>

      {sessionScanStatus?.running && (
        <div className="bg-lmu-bg p-4 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className={READOUT_LABEL}>Parsing XML Session Logs</span>
            <span className="font-bold text-lmu-text">
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
          help={playerNameInput.trim()
            ? "Personal records and sector bests are credited to this name. It is read from LMU's settings when available."
            : "Empty: the name from LMU's settings is used, and nothing is credited until one is found."}
          value={playerNameInput}
          onChange={setPlayerNameInput}
          icon={<User className="w-4 h-4" aria-hidden="true" />}
          placeholder="Your LMU driver name"
          maxLength={64}
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
          error={pathErrors.resultsDir}
          placeholder={STEAM_USERDATA + 'LOG\\Results'}
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
          error={pathErrors.replaysDir}
          placeholder={STEAM_USERDATA + 'Replays'}
        />
        <PathField
          id="telemetry-dir"
          label="Telemetry"
          help="DuckDB telemetry files, usually UserData\Telemetry."
          value={telemetryDirInput}
          onChange={setTelemetryDirInput}
          icon={folderIcon}
          savedValue={status?.telemetryDir}
          exists={status?.telemetryExist}
          error={pathErrors.telemetryDir}
          placeholder={STEAM_USERDATA + 'Telemetry'}
        />

        {(showActions || pathMessage) && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {showActions && (
              <>
                <button
                  type="submit"
                  disabled={busy}
                  data-busy={busy}
                  className={PRIMARY_BUTTON}
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  {isScanning ? 'Saving…' : isScanRunning ? 'Scan in progress…' : 'Save changes'}
                </button>
                <button type="button" onClick={discard} disabled={isScanning} className={SECONDARY_BUTTON}>
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Discard
                </button>
              </>
            )}
            <FeedbackMessage feedback={pathMessage} />
          </div>
        )}
      </form>
    </SettingsPanel>
  );
};
