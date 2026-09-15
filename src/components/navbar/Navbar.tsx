import React from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Gauge, Flag, Settings as SettingsIcon, RefreshCw, ArrowLeftRight, Film } from 'lucide-react';
import { ReplayScanStatus } from '../../../server/types.js';

export interface NavbarProps {
  status: {
    resultsExist: boolean;
    replaysExist: boolean;
    sessionsCount: number;
  } | null;
  replayScanStatus?: ReplayScanStatus | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  status,
  replayScanStatus,
  onRefresh,
  isRefreshing,
}) => {
  const location = useLocation();
  const tabSearch = location.pathname === '/telemetry' ? '' : location.search;
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive
      ? 'bg-lmu-accent text-white shadow-md shadow-lmu-accent/20'
      : 'text-lmu-muted hover:text-white hover:bg-lmu-border/50'
    }`;

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-lmu-border px-4 lg:px-8 py-3.5">
      <div className="max-w-[1500px] w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-4">

        {/* Brand logo & title */}
        <Link
          to={{ pathname: '/dashboard', search: tabSearch }}
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
        </Link>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-lmu-card p-1 rounded-xl border border-lmu-border">
          <NavLink to={{ pathname: '/dashboard', search: tabSearch }} className={tabClass}>
            <Gauge className="w-4 h-4" />
            Dashboard
          </NavLink>

          <NavLink to={{ pathname: '/tracks', search: tabSearch }} className={tabClass}>
            <Flag className="w-4 h-4" />
            Tracks
          </NavLink>

          <NavLink to={{ pathname: '/compare', search: tabSearch }} className={tabClass}>
            <ArrowLeftRight className="w-4 h-4" />
            Compare Laps
          </NavLink>

          <NavLink to={{ pathname: '/settings', search: tabSearch }} className={tabClass}>
            <SettingsIcon className="w-4 h-4" />
            Settings
          </NavLink>
        </nav>

        {/* Directory & Scan Status */}
        <div className="flex items-center gap-3 text-xs">
          <Link
            to={{ pathname: '/dashboard', search: tabSearch }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-lmu-card border border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-accent/60 cursor-pointer transition-all group"
            title="Return to Dashboard"
          >
            <span className={`w-2 h-2 rounded-full ${status?.resultsExist ? 'bg-lmu-green' : 'bg-lmu-accent'} group-hover:scale-110 transition-transform`} />
            <span className="group-hover:text-white transition-colors">{status ? `${status.sessionsCount} Sessions Parsed` : 'Scanning...'}</span>
          </Link>

          <Link
            to={{ pathname: '/settings', search: tabSearch }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-lmu-card border border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-accent/60 cursor-pointer transition-all group"
            title="View Replay Cache in Settings"
          >
            <Film className={`w-3.5 h-3.5 ${replayScanStatus?.running ? 'animate-pulse text-lmu-accent' : 'group-hover:scale-110 transition-transform'}`} />
            <span className="group-hover:text-white transition-colors">
              {replayScanStatus?.running
                ? `Parsing Replays... ${replayScanStatus.processed}/${replayScanStatus.total}`
                : replayScanStatus?.result
                  ? `${replayScanStatus.result.total} Replays Parsed`
                  : 'Replays Pending...'}
            </span>
          </Link>

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
