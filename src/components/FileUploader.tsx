import React, { useState } from 'react';
import { FolderSearch, CheckCircle2, AlertCircle, RefreshCw, HardDrive } from 'lucide-react';

interface FileUploaderProps {
  status: {
    resultsDir: string;
    resultsExist: boolean;
    replaysDir: string;
    replaysExist: boolean;
    sessionsCount: number;
    tracksCount: number;
  } | null;
  onUpdatePaths: (resultsDir: string, replaysDir: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ status, onUpdatePaths }) => {
  const [resultsDirInput, setResultsDirInput] = useState<string>(
    status?.resultsDir || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\LOG\\Results'
  );
  const [replaysDirInput, setReplaysDirInput] = useState<string>(
    status?.replaysDir || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays'
  );
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsScanning(true);
    setMessage(null);

    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resultsDir: resultsDirInput,
        replaysDir: replaysDirInput,
      }),
    })
      .then(res => res.json())
      .then(data => {
        setIsScanning(false);
        if (data.success) {
          onUpdatePaths(resultsDirInput, replaysDirInput);
          setMessage(`Scanned ${data.sessionsCount} sessions successfully!`);
        } else {
          setMessage('Failed to scan directories. Please check paths.');
        }
      })
      .catch(err => {
        setIsScanning(false);
        setMessage(`Error scanning: ${err.message}`);
      });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {/* Title */}
      <div className="glass-panel p-6 rounded-2xl">
        <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
          <FolderSearch className="w-6 h-6 text-lmu-accent" />
          LMU Directory & Data Paths Configuration
        </h2>
        <p className="text-xs text-lmu-muted mt-1">
          Configure the path where Le Mans Ultimate stores XML session logs and `.Vcr` replay files
        </p>

        {/* Current status indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          
          <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-lmu-muted uppercase">Results Log Directory</span>
              <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                status?.resultsExist ? 'text-lmu-green' : 'text-lmu-accent'
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
              <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                status?.replaysExist ? 'text-lmu-green' : 'text-lmu-accent'
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
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          
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

            {message && (
              <span className="text-xs font-semibold text-lmu-green">
                {message}
              </span>
            )}
          </div>

        </form>

      </div>

    </div>
  );
};
