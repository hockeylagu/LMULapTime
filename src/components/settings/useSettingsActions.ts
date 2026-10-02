import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, ReferenceBenchmarkDiff } from '../../../shared/types/index.js';
import { folderPathProblem, normalizeFolderPath } from '../../../shared/domain/folderPath.js';
import { ApiError, apiErrorMessage, postJson } from '../../api/apiClient.js';
import { invalidateReferenceLaptimes } from '../../api/referenceApi.js';
import { SettingsFeedback } from './SettingsPanel.js';
import { pluralize } from './settingsFormat.js';

interface ReferenceRefreshResponse {
  success?: boolean;
  entriesCount?: number;
  diff?: ReferenceBenchmarkDiff | null;
}

export type FolderField = 'resultsDir' | 'replaysDir' | 'telemetryDir';
export type PathErrors = Partial<Record<FolderField, string>>;

/** Input ids of the folder fields, in form order, so the first invalid one can take focus. */
const FOLDER_INPUT_IDS: ReadonlyArray<readonly [FolderField, string]> = [
  ['resultsDir', 'results-dir'],
  ['replaysDir', 'replays-dir'],
  ['telemetryDir', 'telemetry-dir'],
];
const MAX_PLAYER_NAME_LENGTH = 64;

function isFolderField(value: unknown): value is FolderField {
  return value === 'resultsDir' || value === 'replaysDir' || value === 'telemetryDir';
}

/** The field a server validation error (HTTP 400 with `{ field }`) belongs to, if any. */
function serverErrorField(error: unknown): FolderField | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return null;
  const field = (error.body as { field?: unknown }).field;
  return isFolderField(field) ? field : null;
}

function focusFirstInvalid(errors: PathErrors): void {
  const first = FOLDER_INPUT_IDS.find(([field]) => errors[field]);
  if (first) document.getElementById(first[1])?.focus();
}

export interface UseSettingsActionsProps {
  status: AppStatus | null;
  onUpdatePaths: (resultsDir?: string, replaysDir?: string, telemetryDir?: string) => void;
  onReplayScanTriggered?: () => void;
  /** True while the server is scanning sessions, replays or telemetry: saving paths and clearing the cache wait for it. */
  isScanRunning?: boolean;
}

export function useSettingsActions({ status, onUpdatePaths, onReplayScanTriggered, isScanRunning = false }: UseSettingsActionsProps) {
  // Start from what the server uses; with no value the field stays empty and shows the Steam path as a placeholder.
  const [resultsDirInput, setResultsDirInputState] = useState<string>(status?.resultsDir ?? '');
  const [replaysDirInput, setReplaysDirInputState] = useState<string>(status?.replaysDir ?? '');
  const [telemetryDirInput, setTelemetryDirInputState] = useState<string>(status?.telemetryDir ?? '');
  const [playerNameInput, setPlayerNameInput] = useState<string>(
    status?.playerName || ''
  );
  const [pathErrors, setPathErrors] = useState<PathErrors>({});
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isUpdatingLaptimes, setIsUpdatingLaptimes] = useState<boolean>(false);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [pathMessage, setPathMessage] = useState<SettingsFeedback | null>(null);
  const [laptimesMessage, setLaptimesMessage] = useState<SettingsFeedback | null>(null);
  const [cacheMessage, setCacheMessage] = useState<SettingsFeedback | null>(null);
  const [updateDiff, setUpdateDiff] = useState<ReferenceBenchmarkDiff | null>(
    status?.referenceLaptimes?.lastUpdateDiff || null
  );
  // A state flag lags one render behind a fast second click; these refs close that gap.
  const inFlight = useRef({ scan: false, laptimes: false, cache: false });

  // Each input follows its saved server value only when that value changes, and only while the user has not
  // edited it away from the previous saved value, so clearing a field to retype it survives status refreshes.
  const lastSaved = useRef<Record<'resultsDir' | 'replaysDir' | 'telemetryDir' | 'playerName', string>>({
    resultsDir: status?.resultsDir ?? '',
    replaysDir: status?.replaysDir ?? '',
    telemetryDir: status?.telemetryDir ?? '',
    playerName: status?.playerName || '',
  });

  useEffect(() => {
    if (!status) return;
    const follow = (key: keyof typeof lastSaved.current, next: string, set: React.Dispatch<React.SetStateAction<string>>) => {
      const previous = lastSaved.current[key];
      if (next === previous) return;
      lastSaved.current[key] = next;
      set((current) => (current === previous ? next : current));
    };
    follow('resultsDir', status.resultsDir ?? '', setResultsDirInputState);
    follow('replaysDir', status.replaysDir ?? '', setReplaysDirInputState);
    follow('telemetryDir', status.telemetryDir ?? '', setTelemetryDirInputState);
    follow('playerName', status.playerName || '', setPlayerNameInput);
    if (status.referenceLaptimes?.lastUpdateDiff) {
      setUpdateDiff(status.referenceLaptimes.lastUpdateDiff);
    }
  }, [status]);

  /** Typing in a field clears that field's error; the rest of what was typed stays as it is. */
  const folderSetter = (field: FolderField, set: (value: string) => void) => (value: string) => {
    set(value);
    setPathErrors((errors) => (errors[field] ? { ...errors, [field]: undefined } : errors));
  };
  const setResultsDirInput = folderSetter('resultsDir', setResultsDirInputState);
  const setReplaysDirInput = folderSetter('replaysDir', setReplaysDirInputState);
  const setTelemetryDirInput = folderSetter('telemetryDir', setTelemetryDirInputState);

  const handleScanPaths = (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current.scan || isScanRunning) return;

    const folders: Record<FolderField, string> = {
      resultsDir: normalizeFolderPath(resultsDirInput),
      replaysDir: normalizeFolderPath(replaysDirInput),
      telemetryDir: normalizeFolderPath(telemetryDirInput),
    };
    const errors: PathErrors = {};
    for (const [field] of FOLDER_INPUT_IDS) {
      const problem = folderPathProblem(folders[field]);
      if (problem) errors[field] = problem;
    }
    setPathErrors(errors);
    setPathMessage(null);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid(errors);
      return;
    }
    const playerName = playerNameInput.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_PLAYER_NAME_LENGTH);

    inFlight.current.scan = true;
    setIsScanning(true);

    postJson<{ success?: boolean; playerName?: string }>('/api/scan', { ...folders, playerName })
      .then((data) => {
        if (data.success) {
          // Show the saved form of what was typed: no quotes, no trailing backslash, no stray spaces.
          setResultsDirInputState(folders.resultsDir);
          setReplaysDirInputState(folders.replaysDir);
          setTelemetryDirInputState(folders.telemetryDir);
          setPlayerNameInput(playerName);
          onUpdatePaths(folders.resultsDir, folders.replaysDir, folders.telemetryDir);
          const driver = data.playerName ? ` Driver: "${data.playerName}".` : '';
          setPathMessage({
            tone: 'ok',
            text: `Scanning sessions, replays and telemetry in the background.${driver}`,
          });
          onReplayScanTriggered?.();
        } else {
          setPathMessage({ tone: 'error', text: 'Scan failed: the server did not accept these folders.' });
        }
      })
      .catch((err: unknown) => {
        const field = serverErrorField(err);
        if (field) {
          setPathErrors({ [field]: apiErrorMessage(err, 'This folder was not accepted.') });
          focusFirstInvalid({ [field]: 'x' });
          return;
        }
        setPathMessage({ tone: 'error', text: `Scan failed: ${apiErrorMessage(err, 'request failed')}` });
      })
      .finally(() => {
        inFlight.current.scan = false;
        setIsScanning(false);
      });
  };

  const handleUpdateReferenceLaptimes = () => {
    if (inFlight.current.laptimes) return;
    inFlight.current.laptimes = true;
    setIsUpdatingLaptimes(true);
    setLaptimesMessage(null);

    postJson<ReferenceRefreshResponse>('/api/reference-laptimes/refresh')
      .then((data) => {
        if (data.success) {
          invalidateReferenceLaptimes();
          onUpdatePaths();
          if (data.diff) {
            setUpdateDiff(data.diff);
          }
          setLaptimesMessage({ tone: 'ok', text: `Updated ${pluralize(data.entriesCount ?? 0, 'benchmark target')} from the sheet.` });
        } else {
          setLaptimesMessage({ tone: 'error', text: 'The benchmark update did not complete. Your cached benchmarks are unchanged.' });
        }
      })
      .catch((err: unknown) => {
        setLaptimesMessage({ tone: 'error', text: `Benchmark update failed: ${apiErrorMessage(err, 'request failed')}` });
      })
      .finally(() => {
        inFlight.current.laptimes = false;
        setIsUpdatingLaptimes(false);
      });
  };

  const handleClearCache = () => {
    if (inFlight.current.cache || isScanRunning) return;
    inFlight.current.cache = true;
    setIsClearingCache(true);
    setCacheMessage(null);

    postJson<{ success?: boolean }>('/api/cache/clear')
      .then((data) => {
        if (data.success) {
          onUpdatePaths();
          invalidateReferenceLaptimes();
          setCacheMessage({ tone: 'ok', text: 'Session cache cleared. Sessions are read again from your XML logs on the next scan.' });
        } else {
          setCacheMessage({ tone: 'error', text: 'The session cache was not cleared.' });
        }
      })
      .catch((err: unknown) => {
        setCacheMessage({ tone: 'error', text: `Clearing the cache failed: ${apiErrorMessage(err, 'request failed')}` });
      })
      .finally(() => {
        inFlight.current.cache = false;
        setIsClearingCache(false);
      });
  };

  return {
    resultsDirInput,
    setResultsDirInput,
    replaysDirInput,
    setReplaysDirInput,
    telemetryDirInput,
    setTelemetryDirInput,
    playerNameInput,
    setPlayerNameInput,
    pathErrors,
    isScanning,
    handleScanPaths,
    pathMessage,
    isUpdatingLaptimes,
    handleUpdateReferenceLaptimes,
    laptimesMessage,
    updateDiff,
    isClearingCache,
    handleClearCache,
    cacheMessage,
  };
}
