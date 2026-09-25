import React from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Gauge, Flag, Settings as SettingsIcon, RefreshCw, ArrowLeftRight, Film } from 'lucide-react';
import { ReplayScanStatus, ScanStatus } from '../../../server/core/types';

export interface NavbarProps {
  status: {
    resultsExist: boolean;
    replaysExist: boolean;
    sessionsCount: number;
    replaysCount?: number;
  } | null;
  replayScanStatus?: ScanStatus | ReplayScanStatus | null;
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

  const isScanRunning = Boolean(
    replayScanStatus?.running ||
    ('sessionScan' in (replayScanStatus || {}) && (replayScanStatus as ScanStatus)?.sessionScan?.running) ||
    ('telemetryScan' in (replayScanStatus || {}) && (replayScanStatus as ScanStatus)?.telemetryScan?.running)
  );

  const scanStatusText = (() => {
    if (!replayScanStatus) return status ? `${status.replaysCount} Replays` : 'Replays';
    const fullStatus =
      'sessionScan' in replayScanStatus || 'telemetryScan' in replayScanStatus || 'allComplete' in replayScanStatus
        ? (replayScanStatus as ScanStatus)
        : null;

    if (fullStatus?.sessionScan?.running) {
      const p = fullStatus.sessionScan.processed ?? 0;
      const t = fullStatus.sessionScan.total ?? 0;
      return t > 0 ? `Syncing Sessions... ${p}/${t}` : 'Syncing Sessions...';
    }

    if (replayScanStatus.running) {
      return `Syncing Replays... ${replayScanStatus.processed}/${replayScanStatus.total}`;
    }

    if (fullStatus?.telemetryScan?.running) {
      const p = fullStatus.telemetryScan.processed;
      const t = fullStatus.telemetryScan.total;
      return t > 0 ? `Syncing Telemetry... ${p}/${t}` : 'Syncing Telemetry...';
    }

    const totalReplays = replayScanStatus.result?.total ?? status?.replaysCount ?? 0;
    return `${totalReplays} Replays`;
  })();

  const scanTooltip = (() => {
    if (!replayScanStatus) return 'View Replays in Settings';
    if (replayScanStatus.currentFile) return `Syncing Replay: ${replayScanStatus.currentFile}`;
    const fullStatus =
      'sessionScan' in replayScanStatus || 'telemetryScan' in replayScanStatus || 'allComplete' in replayScanStatus
        ? (replayScanStatus as ScanStatus)
        : null;
    if (fullStatus?.sessionScan?.currentFile) return `Syncing Session: ${fullStatus.sessionScan.currentFile}`;
    if (fullStatus?.telemetryScan?.currentFile) return `Syncing Telemetry: ${fullStatus.telemetryScan.currentFile}`;
    if (fullStatus?.allComplete || fullStatus?.allCached) return 'All sessions, replays, and telemetry are synchronized';
    return 'View Replays in Settings';
  })();

  return (
    <header className="sticky top-0 z-50 bg-lmu-card/75 backdrop-blur-md border-b border-lmu-border px-4 lg:px-8 py-3.5">
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
            <span className="group-hover:text-white transition-colors">{status ? `${status.sessionsCount} Sessions` : 'Scanning...'}</span>
          </Link>

          <Link
            to={{ pathname: '/settings', search: tabSearch }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-lmu-card border border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-accent/60 cursor-pointer transition-all group"
            title={scanTooltip}
          >
            <Film className={`w-3.5 h-3.5 ${isScanRunning ? 'animate-pulse text-lmu-accent' : 'group-hover:scale-110 transition-transform'}`} />
            <span className="group-hover:text-white transition-colors">
              {scanStatusText}
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
