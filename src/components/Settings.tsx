import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { ReferenceBenchmarkDiff } from '../../server/types.js';
import { CacheSettingsCard } from './settings/CacheSettingsCard';
import { ReferenceLaptimesCard } from './settings/ReferenceLaptimesCard';
import { FolderPathsCard } from './settings/FolderPathsCard';

export interface SettingsProps {
  status: {
    resultsDir: string;
    resultsExist: boolean;
    replaysDir: string;
    replaysExist: boolean;
    playerName?: string;
    sessionsCount: number;
    tracksCount: number;
    referenceLaptimes?: {
      lastUpdated: string | null;
      entriesCount: number;
      lastUpdateDiff?: ReferenceBenchmarkDiff | null;
    };
    sqliteCache?: {
      enabled: boolean;
      dbPath: string;
      sessionsCount: number;
      lastSyncedAt: string | null;
      dbSizeBytes: number;
    };
  } | null;
  onUpdatePaths: (resultsDir?: string, replaysDir?: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({ status, onUpdatePaths }) => {
  const [resultsDirInput, setResultsDirInput] = useState<string>(
    status?.resultsDir || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results'
  );
  const [replaysDirInput, setReplaysDirInput] = useState<string>(
    status?.replaysDir || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays'
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
    if (status?.resultsDir && (!resultsDirInput || resultsDirInput.includes('Le Mans Ultimate\\UserData\\LOG\\Results'))) {
      setResultsDirInput(status.resultsDir);
    }
  }, [status?.resultsDir]);

  useEffect(() => {
    if (status?.replaysDir && (!replaysDirInput || replaysDirInput.includes('Le Mans Ultimate\\UserData\\Replays'))) {
      setReplaysDirInput(status.replaysDir);
    }
  }, [status?.replaysDir]);

  useEffect(() => {
    if (status?.playerName && !playerNameInput) {
      setPlayerNameInput(status.playerName);
    }
  }, [status?.playerName]);

  useEffect(() => {
    if (status?.referenceLaptimes?.lastUpdateDiff) {
      setUpdateDiff(status.referenceLaptimes.lastUpdateDiff);
    }
  }, [status?.referenceLaptimes?.lastUpdateDiff]);

  const handleScanPaths = (e: React.FormEvent) => {
    e.preventDefault();
    setIsScanning(true);
    setPathMessage(null);

    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resultsDir: resultsDirInput,
        replaysDir: replaysDirInput,
        playerName: playerNameInput,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setIsScanning(false);
        if (data.success) {
          onUpdatePaths(resultsDirInput, replaysDirInput);
          setPathMessage(`Scanned ${data.sessionsCount} sessions successfully! Driver profile: "${data.playerName}"`);
        } else {
          setPathMessage('Failed to scan directories. Please check paths.');
        }
      })
      .catch((err) => {
        setIsScanning(false);
        setPathMessage(`Error scanning: ${err.message}`);
      });
  };

  const handleUpdateReferenceLaptimes = () => {
    setIsUpdatingLaptimes(true);
    setLaptimesMessage(null);

    fetch('/api/reference-laptimes/refresh', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        setIsUpdatingLaptimes(false);
        if (data.success) {
          onUpdatePaths();
          if (data.diff) {
            setUpdateDiff(data.diff);
          }
          const diffSummary = data.diff?.hasChanges
            ? ` (${data.diff.addedCount} new, ${data.diff.updatedCount} updated, ${data.diff.removedCount} removed)`
            : ' (no changes detected)';
          setLaptimesMessage(`Updated ${data.entriesCount} benchmark entries from Google Sheets!${diffSummary}`);
        } else {
          setLaptimesMessage('Failed to update reference laptimes.');
        }
      })
      .catch((err) => {
        setIsUpdatingLaptimes(false);
        setLaptimesMessage(`Error updating: ${err.message}`);
      });
  };

  const handleClearCache = () => {
    if (!window.confirm('Are you sure you want to clear the SQLite session cache? Cached session data will be deleted and can be rescanned.')) {
      return;
    }
    setIsClearingCache(true);
    setCacheMessage(null);

    fetch('/api/cache/clear', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        setIsClearingCache(false);
        if (data.success) {
          onUpdatePaths();
          setCacheMessage('Session SQLite cache cleared successfully! You can rescan anytime.');
        } else {
          setCacheMessage('Failed to clear SQLite cache.');
        }
      })
      .catch((err) => {
        setIsClearingCache(false);
        setCacheMessage(`Error clearing cache: ${err.message}`);
      });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 glass-panel p-6 rounded-2xl">
        <div className="p-3 rounded-xl bg-lmu-accent/10 text-lmu-accent border border-lmu-accent/20">
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-white">Application Settings</h2>
          <p className="text-xs text-lmu-muted mt-0.5">
            Manage LMU telemetry log paths, SQLite session database cache & sync reference lap time benchmarks
          </p>
        </div>
      </div>

      <CacheSettingsCard
        status={status}
        isClearingCache={isClearingCache}
        onClearCache={handleClearCache}
        cacheMessage={cacheMessage}
      />

      <ReferenceLaptimesCard
        status={status}
        isUpdatingLaptimes={isUpdatingLaptimes}
        onUpdateReferenceLaptimes={handleUpdateReferenceLaptimes}
        laptimesMessage={laptimesMessage}
        updateDiff={updateDiff}
      />

      <FolderPathsCard
        status={status}
        resultsDirInput={resultsDirInput}
        setResultsDirInput={setResultsDirInput}
        replaysDirInput={replaysDirInput}
        setReplaysDirInput={setReplaysDirInput}
        playerNameInput={playerNameInput}
        setPlayerNameInput={setPlayerNameInput}
        isScanning={isScanning}
        onScanPaths={handleScanPaths}
        pathMessage={pathMessage}
      />
    </div>
  );
};
