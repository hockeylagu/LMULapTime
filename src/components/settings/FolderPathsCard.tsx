import React from 'react';
import { HardDrive, CheckCircle2, AlertCircle, User, RefreshCw } from 'lucide-react';

export interface FolderPathsCardProps {
  status: any;
  resultsDirInput: string;
  setResultsDirInput: (val: string) => void;
  replaysDirInput: string;
  setReplaysDirInput: (val: string) => void;
  playerNameInput: string;
  setPlayerNameInput: (val: string) => void;
  isScanning: boolean;
  onScanPaths: (e: React.FormEvent) => void;
  pathMessage: string | null;
}

export const FolderPathsCard: React.FC<FolderPathsCardProps> = ({
  status,
  resultsDirInput,
  setResultsDirInput,
  replaysDirInput,
  setReplaysDirInput,
  playerNameInput,
  setPlayerNameInput,
  isScanning,
  onScanPaths,
  pathMessage,
}) => {
  return (
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
            <span
              className={`inline-flex items-center gap-1 text-xs font-bold ${
                status?.resultsExist ? 'text-lmu-green' : 'text-lmu-accent'
              }`}
            >
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
            <span
              className={`inline-flex items-center gap-1 text-xs font-bold ${
                status?.replaysExist ? 'text-lmu-green' : 'text-lmu-accent'
              }`}
            >
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
      <form onSubmit={onScanPaths} className="space-y-4">
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
  );
};
