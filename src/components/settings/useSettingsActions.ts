import React, { useState, useEffect } from 'react';
import { AppStatus, ReferenceBenchmarkDiff } from '../../../shared/types/index.js';
import { apiErrorMessage, postJson } from '../../api/apiClient.js';
import { invalidateReferenceLaptimes } from '../../api/referenceApi.js';
import { clearSessionDetailCache } from '../session-detail/useSessionDetailData.js';

interface ReferenceRefreshResponse {
  success?: boolean;
  entriesCount?: number;
  diff?: ReferenceBenchmarkDiff | null;
}

export interface UseSettingsActionsProps {
  status: AppStatus | null;
  onUpdatePaths: (resultsDir?: string, replaysDir?: string, telemetryDir?: string) => void;
  onReplayScanTriggered?: () => void;
}

export function useSettingsActions({ status, onUpdatePaths, onReplayScanTriggered }: UseSettingsActionsProps) {
  const [resultsDirInput, setResultsDirInput] = useState<string>(
    status?.resultsDir || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results'
  );
  const [replaysDirInput, setReplaysDirInput] = useState<string>(
    status?.replaysDir || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays'
  );
  const [telemetryDirInput, setTelemetryDirInput] = useState<string>(
    status?.telemetryDir || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Telemetry'
  );
  const [playerNameInput, setPlayerNameInput] = useState<string>(
    status?.playerName || ''
  );
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isUpdatingLaptimes, setIsUpdatingLaptimes] = useState<boolean>(false);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [pathMessage, setPathMessage] = useState<string | null>(null);
  const [laptimesMessage, setLaptimesMessage] = useState<string | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [updateDiff, setUpdateDiff] = useState<ReferenceBenchmarkDiff | null>(
    status?.referenceLaptimes?.lastUpdateDiff || null
  );

  useEffect(() => {
    if (!status) return;
    if (status.resultsDir && (!resultsDirInput || resultsDirInput.includes('Le Mans Ultimate\\UserData\\LOG\\Results'))) {
      setResultsDirInput(status.resultsDir);
    }
    if (status.replaysDir && (!replaysDirInput || replaysDirInput.includes('Le Mans Ultimate\\UserData\\Replays'))) {
      setReplaysDirInput(status.replaysDir);
    }
    if (status.telemetryDir && (!telemetryDirInput || telemetryDirInput.includes('Le Mans Ultimate\\UserData\\Telemetry'))) {
      setTelemetryDirInput(status.telemetryDir);
    }
    if (status.playerName && !playerNameInput) {
      setPlayerNameInput(status.playerName);
    }
    if (status.referenceLaptimes?.lastUpdateDiff) {
      setUpdateDiff(status.referenceLaptimes.lastUpdateDiff);
    }
  }, [status]);

  const handleScanPaths = (e: React.FormEvent) => {
    e.preventDefault();
    setIsScanning(true);
    setPathMessage(null);

    postJson<{ success?: boolean; playerName?: string }>('/api/scan', {
      resultsDir: resultsDirInput,
      replaysDir: replaysDirInput,
      telemetryDir: telemetryDirInput,
      playerName: playerNameInput,
    })
      .then((data) => {
        setIsScanning(false);
        if (data.success) {
          onUpdatePaths(resultsDirInput, replaysDirInput, telemetryDirInput);
          setPathMessage(`Scanning session, replay, and telemetry data in the background. Driver profile: "${data.playerName}"`);
          onReplayScanTriggered?.();
        } else {
          setPathMessage('Failed to scan directories. Please check paths.');
        }
      })
      .catch((err) => {
        setIsScanning(false);
        setPathMessage(`Error scanning: ${apiErrorMessage(err, 'request failed')}`);
      });
  };

  const handleUpdateReferenceLaptimes = () => {
    setIsUpdatingLaptimes(true);
    setLaptimesMessage(null);

    postJson<ReferenceRefreshResponse>('/api/reference-laptimes/refresh')
      .then((data) => {
        setIsUpdatingLaptimes(false);
        if (data.success) {
          invalidateReferenceLaptimes();
          onUpdatePaths();
          if (data.diff) {
            setUpdateDiff(data.diff);
          }
          const diffSummary = data.diff?.hasChanges
            ? ` (${data.diff.addedCount} new, ${data.diff.updatedCount} updated, ${data.diff.removedCount} removed)`
            : ' (no changes detected)';
          setLaptimesMessage(`Updated ${data.entriesCount} benchmark entries from Google Sheets!${diffSummary}`);
        } else {
          setLaptimesMessage('Failed to update reference lap time benchmarks.');
        }
      })
      .catch((err) => {
        setIsUpdatingLaptimes(false);
        setLaptimesMessage(`Error updating: ${apiErrorMessage(err, 'request failed')}`);
      });
  };

  const handleClearCache = () => {
    if (!window.confirm('Are you sure you want to clear the SQLite session cache? Cached session data will be deleted and can be rescanned.')) {
      return;
    }
    setIsClearingCache(true);
    setCacheMessage(null);

    postJson<{ success?: boolean }>('/api/cache/clear')
      .then((data) => {
        setIsClearingCache(false);
        if (data.success) {
          onUpdatePaths();
          clearSessionDetailCache();
          setCacheMessage('Session SQLite cache cleared successfully! You can rescan anytime.');
        } else {
          setCacheMessage('Failed to clear SQLite cache.');
        }
      })
      .catch((err) => {
        setIsClearingCache(false);
        setCacheMessage(`Error clearing cache: ${apiErrorMessage(err, 'request failed')}`);
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
