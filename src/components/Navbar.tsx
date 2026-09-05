import React from 'react';
import { Gauge, Flag, Settings, RefreshCw, ArrowLeftRight, Video } from 'lucide-react';

export type NavTab = 'dashboard' | 'tracks' | 'compare' | 'replays' | 'settings';

interface NavbarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  status: {
    resultsExist: boolean;
    replaysExist: boolean;
    sessionsCount: number;
  } | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  status,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-lmu-border px-4 lg:px-8 py-3.5">
      <div className="max-w-[1500px] w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-4">

        {/* Brand logo & title */}
        <div
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-3 cursor-pointer group select-none"
          title="Return to Dashboard"
        >
          <div className="p-2.5 rounded-xl bg-lmu-accent/10 border border-lmu-accent/30 text-lmu-accent shadow-lg shadow-lmu-accent/10 group-hover:scale-105 transition-transform">
            <Gauge className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg text-white tracking-wide uppercase group-hover:text-lmu-gold transition-colors">
                LMU <span className="text-lmu-accent">Lap Time</span> Analyzer
              </h1>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-lmu-card p-1 rounded-xl border border-lmu-border">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard'
              ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
              }`}
          >
            <Gauge className="w-4 h-4" />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab('tracks')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'tracks'
              ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
              }`}
          >
            <Flag className="w-4 h-4" />
            Tracks
          </button>

          <button
            onClick={() => setActiveTab('compare')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'compare'
              ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
              }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Compare Laps
          </button>

          <button
            onClick={() => setActiveTab('replays')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'replays'
              ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
              }`}
          >
            <Video className="w-4 h-4" />
            Replays
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'settings'
              ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
              : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
              }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </nav>

        {/* Directory & Scan Status */}
        <div className="flex items-center gap-3 text-xs">
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-lmu-card border border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-accent/60 cursor-pointer transition-all group"
            title="Return to Dashboard"
          >
            <span className={`w-2 h-2 rounded-full ${status?.resultsExist ? 'bg-lmu-green' : 'bg-lmu-accent'} group-hover:scale-110 transition-transform`} />
            <span className="group-hover:text-white transition-colors">{status ? `${status.sessionsCount} Sessions Parsed` : 'Scanning...'}</span>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-lmu-card border border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-accent transition-all disabled:opacity-50"
            title="Refresh LMU Directory Scan"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-lmu-accent' : ''}`} />
          </button>
        </div>

      </div>
    </header>
  );
};
