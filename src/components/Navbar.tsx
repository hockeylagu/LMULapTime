import React from 'react';
import { Gauge, TrendingUp, Flag, Settings, RefreshCw } from 'lucide-react';

interface NavbarProps {
  activeTab: 'dashboard' | 'improvement' | 'tracks' | 'sessions' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'improvement' | 'tracks' | 'sessions' | 'settings') => void;
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
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand logo & title */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-lmu-accent/10 border border-lmu-accent/30 text-lmu-accent shadow-lg shadow-lmu-accent/10">
            <Gauge className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg text-white tracking-wide uppercase">
                LMU <span className="text-lmu-accent">Lap Time</span> Analyzer
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30">
                v1.0
              </span>
            </div>
            <p className="text-xs text-lmu-muted">
              Le Mans Ultimate Sector & Session Improvement Progression
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-lmu-card p-1 rounded-xl border border-lmu-border">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
                : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
            }`}
          >
            <Gauge className="w-4 h-4" />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab('improvement')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'improvement'
                ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
                : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Progression
          </button>

          <button
            onClick={() => setActiveTab('tracks')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'tracks'
                ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
                : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
            }`}
          >
            <Flag className="w-4 h-4" />
            Tracks
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'settings'
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-lmu-card border border-lmu-border text-lmu-muted">
            <span className={`w-2 h-2 rounded-full ${status?.resultsExist ? 'bg-lmu-green' : 'bg-lmu-accent'}`} />
            <span>{status ? `${status.sessionsCount} Sessions Parsed` : 'Scanning...'}</span>
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
