import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, CheckCircle2, AlertCircle, RefreshCw, HardDrive, Database, Globe, ExternalLink, User } from 'lucide-react';

interface FileUploaderProps {
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
    };
  } | null;
  onUpdatePaths: (resultsDir?: string, replaysDir?: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ status, onUpdatePaths }) => {
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
  const [pathMessage, setPathMessage] = useState<string | null>(null);
  const [laptimesMessage, setLaptimesMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status?.playerName && !playerNameInput) {
      setPlayerNameInput(status.playerName);
    }
  }, [status?.playerName]);

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
      .then(res => res.json())
      .then(data => {
        setIsScanning(false);
        if (data.success) {
          onUpdatePaths(resultsDirInput, replaysDirInput);
          setPathMessage(`Scanned ${data.sessionsCount} sessions successfully! Driver profile: "${data.playerName}"`);
        } else {
          setPathMessage('Failed to scan directories. Please check paths.');
        }
      })
      .catch(err => {
        setIsScanning(false);
        setPathMessage(`Error scanning: ${err.message}`);
      });
  };

  const handleUpdateReferenceLaptimes = () => {
    setIsUpdatingLaptimes(true);
    setLaptimesMessage(null);

    fetch('/api/reference-laptimes/refresh', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setIsUpdatingLaptimes(false);
        if (data.success) {
          onUpdatePaths();
          setLaptimesMessage(`Updated ${data.entriesCount} benchmark entries from Google Sheets!`);
        } else {
          setLaptimesMessage('Failed to update reference laptimes.');
        }
      })
      .catch(err => {
        setIsUpdatingLaptimes(false);
        setLaptimesMessage(`Error updating: ${err.message}`);
      });
  };

  const lastUpdatedStr = status?.referenceLaptimes?.lastUpdated
    ? new Date(status.referenceLaptimes.lastUpdated).toLocaleString()
    : 'Not cached yet';

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
            Manage LMU telemetry log paths & sync reference lap time benchmarks from Google Sheets
          </p>
        </div>
      </div>

      {/* Reference Laptimes Benchmark Settings */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-lmu-gold" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Reference Laptimes Benchmark</h3>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30">
            {status?.referenceLaptimes?.entriesCount || 0} Benchmarks Cached
          </span>
        </div>

        <p className="text-xs text-lmu-muted leading-relaxed">
          The reference lap times are used to classify each of your laps into pace categories (<strong>Alien</strong>, <strong>Competitive</strong>, <strong>Good</strong>, <strong>Midpack</strong>, <strong>Tail-ender</strong>, <strong>Offline</strong>). Benchmark data is fetched from the official published spreadsheet and cached locally.
        </p>

        <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-lmu-muted">
              <Globe className="w-4 h-4 text-lmu-cyan shrink-0" />
              <span>Source: Published Google Sheets CSV</span>
              <a
                href="https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-lmu-accent hover:underline ml-1"
              >
                <span>View Sheet</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-white">
              Last Cached/Updated: <span className="font-mono text-lmu-gold font-semibold">{lastUpdatedStr}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleUpdateReferenceLaptimes}
            disabled={isUpdatingLaptimes}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lmu-gold text-lmu-bg font-extrabold text-xs uppercase tracking-wider hover:bg-amber-400 transition-all shadow-md shadow-lmu-gold/20 shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isUpdatingLaptimes ? 'animate-spin' : ''}`} />
            {isUpdatingLaptimes ? 'Fetching Spreadsheet...' : 'Update Reference Laptimes'}
          </button>
        </div>

        {laptimesMessage && (
          <div className="p-3 rounded-xl bg-lmu-green/10 border border-lmu-green/20 text-xs font-semibold text-lmu-green flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{laptimesMessage}</span>
          </div>
        )}
      </div>

      {/* LMU Telemetry & Replays Folder Paths */}
      <div className="glass-panel p-6 rounded-2xl space-y-6">
        <div className="border-b border-lmu-border/50 pb-3">
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-lmu-accent" />
            LMU UserData Directory Paths
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Configure local paths where Le Mans Ultimate writes result XML files and replay VCR files
          </p>
        </div>

        {/* Current status indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-lmu-muted uppercase">Results Log Directory</span>
              <span className={`inline-flex items-center gap-1 text-xs font-bold ${status?.resultsExist ? 'text-lmu-green' : 'text-lmu-accent'
                }`}>
                {status?.resultsExist ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Detected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" /> Not Found
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-white font-mono truncate">{status?.resultsDir}</p>
          </div>

          <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-lmu-muted uppercase">Replays (.VCR) Directory</span>
              <span className={`inline-flex items-center gap-1 text-xs font-bold ${status?.replaysExist ? 'text-lmu-green' : 'text-lmu-accent'
                }`}>
                {status?.replaysExist ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Detected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" /> Not Found
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-white font-mono truncate">{status?.replaysDir}</p>
          </div>

        </div>

        {/* Path Form */}
        <form onSubmit={handleScanPaths} className="space-y-4">

          <div>
            <label className="block text-xs font-semibold text-lmu-muted uppercase mb-1.5 flex items-center justify-between">
              <span>Player Driver Profile Name</span>
              <span className="text-lmu-accent text-[11px] font-normal normal-case">
                (Auto-detected from LMU settings.json or user editable)
              </span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-lmu-muted absolute left-3.5 top-3" />
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="e.g. Bob"
                className="w-full bg-lmu-bg border border-lmu-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-sans focus:outline-none focus:border-lmu-accent"
              />
            </div>
            <p className="text-[11px] text-lmu-muted mt-1">
              Personal track records, sector splits, and star icons (⭐) are attributed to this driver profile name.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-lmu-muted uppercase mb-1.5">
              UserData Results XML Folder Path
            </label>
            <div className="relative">
              <HardDrive className="w-4 h-4 text-lmu-muted absolute left-3.5 top-3" />
              <input
                type="text"
                value={resultsDirInput}
                onChange={(e) => setResultsDirInput(e.target.value)}
                className="w-full bg-lmu-bg border border-lmu-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-lmu-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-lmu-muted uppercase mb-1.5">
              UserData Replays (.VCR) Folder Path
            </label>
            <div className="relative">
              <HardDrive className="w-4 h-4 text-lmu-muted absolute left-3.5 top-3" />
              <input
                type="text"
                value={replaysDirInput}
                onChange={(e) => setReplaysDirInput(e.target.value)}
                className="w-full bg-lmu-bg border border-lmu-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-lmu-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={isScanning}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lmu-accent text-white font-bold text-xs uppercase tracking-wider hover:bg-lmu-accent/90 transition-all shadow-md shadow-lmu-accent/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning Directory...' : 'Rescan & Load Telemetry'}
            </button>

            {pathMessage && (
              <span className="text-xs font-semibold text-lmu-green">
                {pathMessage}
              </span>
            )}
          </div>

        </form>

      </div>

    </div>
  );
};
