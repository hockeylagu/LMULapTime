import React, { useState, useEffect } from 'react';
import {
  Video,
  Search,
  Activity,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { ReplaySummary } from '../../../server/types.js';
import { ReplayInspectorModal } from '../replay/ReplayInspectorModal';
import { getHashRouteAndParams, updateHashParams } from '../../utils/urlParams.js';

export interface ReplaysViewProps {
  onSelectSession?: (sessionId: string) => void;
}

export const ReplaysView: React.FC<ReplaysViewProps> = ({ onSelectSession }) => {
  const [replays, setReplays] = useState<ReplaySummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [selectedReplayForModal, setSelectedReplayForModal] = useState<string | null>(() => {
    const { params } = getHashRouteAndParams();
    return params.get('replay') || null;
  });
  const [selectedLapForModal, setSelectedLapForModal] = useState<number | undefined>(() => {
    const { params } = getHashRouteAndParams();
    const l = params.get('lap') || params.get('lapNum');
    return l ? parseInt(l, 10) : undefined;
  });

  useEffect(() => {
    const syncFromUrl = () => {
      const { params } = getHashRouteAndParams();
      const rep = params.get('replay');
      const l = params.get('lap') || params.get('lapNum');
      setSelectedReplayForModal(rep || null);
      setSelectedLapForModal(l ? parseInt(l, 10) : undefined);
    };

    window.addEventListener('hashchange', syncFromUrl);
    window.addEventListener('popstate', syncFromUrl);
    return () => {
      window.removeEventListener('hashchange', syncFromUrl);
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, []);

  const fetchReplays = () => {
    setIsLoading(true);
    setError(null);
    fetch('http://localhost:3001/api/replays')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch replays');
        return res.json();
      })
      .then(data => {
        setReplays(data);
        setIsLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Error loading replays');
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchReplays();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (sec?: number): string => {
    if (!sec || sec <= 0) return '-';
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const filteredReplays = replays.filter(r => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      (r.trackName && r.trackName.toLowerCase().includes(q)) ||
      (r.eventTitle && r.eventTitle.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (sessionFilter === 'all') return true;
    if (sessionFilter === 'linked') return Boolean(r.matchedSessionId);
    if (sessionFilter === 'race') return r.sessionCode?.startsWith('R') || r.name.includes(' R');
    if (sessionFilter === 'qualify') return r.sessionCode?.startsWith('Q') || r.name.includes(' Q');
    if (sessionFilter === 'practice') return r.sessionCode?.startsWith('P') || r.name.includes(' P');

    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-lmu-card p-6 rounded-2xl border border-lmu-border shadow-md">
        <div>
          <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2.5">
            <Video className="w-6 h-6 text-lmu-accent" />
            Replay Recordings & Telemetry Hub
          </h2>
          <p className="text-xs text-lmu-muted mt-1">
            Browse high-frequency 50Hz session recordings, telemetry trajectories, and online driver rosters directly from Le Mans Ultimate.
          </p>
        </div>

        <button
          onClick={fetchReplays}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lmu-dark border border-lmu-border text-xs font-bold text-white hover:border-lmu-accent transition-all shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 text-lmu-accent ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Replays
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-lmu-card p-3 rounded-2xl border border-lmu-border">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-lmu-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search replays by circuit, event name, or file..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-lmu-dark border border-lmu-border rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
          {[
            { id: 'all', label: 'All Replays' },
            { id: 'linked', label: 'Linked to Logs' },
            { id: 'race', label: 'Races' },
            { id: 'qualify', label: 'Qualifying' },
            { id: 'practice', label: 'Practice' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSessionFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                sessionFilter === f.id
                  ? 'bg-lmu-accent text-white shadow-md'
                  : 'bg-lmu-dark text-lmu-muted hover:text-white border border-lmu-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-lmu-muted">
          <div className="w-8 h-8 border-2 border-lmu-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Scanning replay recordings...</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Grid of Replay Cards */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReplays.length > 0 ? (
            filteredReplays.map((replay, idx) => (
              <div
                key={idx}
                className="bg-lmu-card border border-lmu-border hover:border-lmu-accent/50 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 shadow-md group"
              >
                <div>
                  {/* Card Header: Event Title / Track */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-lmu-accent transition-colors line-clamp-1">
                        {replay.trackName || replay.name.replace(/\.vcr$/i, '')}
                      </h3>
                      <div className="text-[11px] text-lmu-muted font-mono truncate max-w-[220px]">
                        {replay.name}
                      </div>
                    </div>

                    {replay.matchedSessionId ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] shrink-0">
                        Linked Log
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-lmu-dark border border-lmu-border text-lmu-muted text-[10px] shrink-0">
                        Replay Only
                      </span>
                    )}
                  </div>

                  {/* Online Event Badge if detected */}
                  {replay.eventTitle && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-3">
                      <span>{replay.eventTitle}</span>
                      {typeof replay.splitNo === 'number' && (
                        <span className="text-emerald-400/80 font-normal">
                          • Split {replay.splitNo}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Metrics Bar */}
                  <div className="grid grid-cols-3 gap-2 py-3 border-y border-lmu-border/50 text-xs text-lmu-muted my-3">
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-lmu-muted">Duration</span>
                      <span className="font-semibold text-white">{formatDuration(replay.durationSec)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-lmu-muted">Size</span>
                      <span className="font-semibold text-white">{formatBytes(replay.sizeBytes)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-lmu-muted">Drivers</span>
                      <span className="font-semibold text-white">{replay.driversCount || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => {
                      setSelectedReplayForModal(replay.name);
                      updateHashParams({ replay: replay.name });
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-lmu-dark hover:bg-lmu-accent hover:text-white border border-lmu-border text-xs font-bold text-white transition-all shadow-sm"
                  >
                    <Activity className="w-3.5 h-3.5 text-lmu-accent" />
                    Inspect Replay
                  </button>

                  {replay.matchedSessionId && onSelectSession && (
                    <button
                      onClick={() => onSelectSession(replay.matchedSessionId!)}
                      className="flex items-center justify-center p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-colors"
                      title="Open correlated XML session telemetry"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-lmu-muted text-sm bg-lmu-card rounded-2xl border border-lmu-border">
              No replay files matched your search or filters.
            </div>
          )}
        </div>
      )}

      {/* Replay Inspector Modal */}
      <ReplayInspectorModal
        isOpen={Boolean(selectedReplayForModal)}
        onClose={() => {
          setSelectedReplayForModal(null);
          setSelectedLapForModal(undefined);
          updateHashParams({ replay: null, lap: null, lapNum: null });
        }}
        replayName={selectedReplayForModal}
        initialLapNumber={selectedLapForModal}
        onLapChange={(newLap) => {
          setSelectedLapForModal(newLap);
          updateHashParams({ lap: String(newLap) });
        }}
      />
    </div>
  );
};
