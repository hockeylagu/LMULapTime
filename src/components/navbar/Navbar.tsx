import React from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Gauge, Flag, Settings as SettingsIcon, RefreshCw, Trophy, Film } from 'lucide-react';
import { ReplayScanStatus, ScanStatus } from '../../../shared/types/index.js';

/** Status chips on the right: an inset well like the tab group, lifting to white on hover. */
const STATUS_CHIP =
  'h-8 flex items-center gap-2 px-3 rounded-lg bg-lmu-bg border border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-rule cursor-pointer transition-colors';

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
    `flex items-center gap-2 h-8 px-3.5 rounded-lg text-sm font-medium transition-colors ${isActive
      ? 'bg-lmu-accent text-white'
      : 'text-lmu-muted hover:text-white hover:bg-lmu-raised/60'
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
      return t > 0 ? `Syncing Sessions… ${p}/${t}` : 'Syncing Sessions…';
    }

    if (replayScanStatus.running) {
      return `Syncing Replays… ${replayScanStatus.processed}/${replayScanStatus.total}`;
    }

    if (fullStatus?.telemetryScan?.running) {
      const p = fullStatus.telemetryScan.processed;
      const t = fullStatus.telemetryScan.total;
      return t > 0 ? `Syncing Telemetry… ${p}/${t}` : 'Syncing Telemetry…';
    }

    const totalReplays = replayScanStatus.result?.total ?? status?.replaysCount ?? 0;
    return `${totalReplays} Replays`;
  })();

  const scanTooltip = (() => {
    if (!replayScanStatus) return 'View Replays in Settings';
    if (replayScanStatus.currentFile) {
      const stage = 'currentStage' in replayScanStatus && replayScanStatus.currentStage ? ` (${replayScanStatus.currentStage})` : '';
      return `Syncing Replay: ${replayScanStatus.currentFile}${stage}`;
    }
    const fullStatus =
      'sessionScan' in replayScanStatus || 'telemetryScan' in replayScanStatus || 'allComplete' in replayScanStatus
        ? (replayScanStatus as ScanStatus)
        : null;
    if (fullStatus?.sessionScan?.currentFile) {
      const stage = fullStatus.sessionScan.currentStage ? ` (${fullStatus.sessionScan.currentStage})` : '';
      return `Syncing Session: ${fullStatus.sessionScan.currentFile}${stage}`;
    }
    if (fullStatus?.telemetryScan?.currentFile) return `Syncing Telemetry: ${fullStatus.telemetryScan.currentFile}`;
    if (fullStatus?.allComplete || fullStatus?.allCached) return 'All sessions, replays, and telemetry are synchronized';
    return 'View Replays in Settings';
  })();

  return (
    <header className="sticky top-0 z-50 bg-lmu-card/75 backdrop-blur-md border-b border-lmu-border px-8 py-3">
      {/* Equal side columns keep the tabs on the page's true center line. */}
      <div className="max-w-[1500px] w-full mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-6">

        {/* Brand logo & title */}
        <Link
          to={{ pathname: '/dashboard', search: tabSearch }}
          className="justify-self-start flex items-center gap-3 cursor-pointer group select-none rounded-xl"
          title="Return to Dashboard"
        >
          <span className="w-10 h-10 grid place-items-center rounded-xl bg-lmu-accent/10 border border-lmu-accent/30 text-lmu-accent-text transition-colors group-hover:bg-lmu-accent/20 group-hover:border-lmu-accent/50">
            <Gauge className="w-5 h-5" />
          </span>
          <h1 className="font-extrabold text-lg text-white tracking-wide uppercase leading-none">
            LMU <span className="text-lmu-accent-text">Lap Time</span> Analyzer
          </h1>
        </Link>

        {/* Navigation Tabs */}
        <nav aria-label="Main" className="flex items-center gap-1 bg-lmu-bg p-1 rounded-xl border border-lmu-border">
          <NavLink to={{ pathname: '/dashboard', search: tabSearch }} className={tabClass}>
            <Gauge className="w-4 h-4" />
            Dashboard
          </NavLink>

          <NavLink to={{ pathname: '/tracks', search: tabSearch }} className={tabClass}>
            <Flag className="w-4 h-4" />
            Tracks
          </NavLink>

          <NavLink to={{ pathname: '/leaderboard', search: tabSearch }} className={tabClass}>
            <Trophy className="w-4 h-4" />
            Leaderboard
          </NavLink>

          <NavLink to={{ pathname: '/settings', search: tabSearch }} className={tabClass}>
            <SettingsIcon className="w-4 h-4" />
            Settings
          </NavLink>
        </nav>

        {/* Directory & Scan Status */}
        <div className="justify-self-end flex items-center gap-2 text-xs">
          <Link
            to={{ pathname: '/dashboard', search: tabSearch }}
            className={STATUS_CHIP}
            title={status?.resultsExist === false ? 'No LMU results found yet' : 'Return to Dashboard'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${!status ? 'bg-lmu-muted' : status.resultsExist ? 'bg-lmu-gain' : 'bg-lmu-warn'}`}
              aria-hidden="true"
            />
            <span className="tabular-nums">{status ? `${status.sessionsCount.toLocaleString()} Sessions` : 'Scanning…'}</span>
          </Link>

          <Link
            to={{ pathname: '/settings', search: tabSearch }}
            className={STATUS_CHIP}
            title={scanTooltip}
          >
            <Film className={`w-3.5 h-3.5 ${isScanRunning ? 'animate-pulse text-lmu-info' : ''}`} />
            <span className="tabular-nums">{scanStatusText}</span>
          </Link>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-8 w-8 grid place-items-center rounded-lg bg-lmu-bg border border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-rule transition-colors cursor-pointer disabled:cursor-default disabled:hover:text-lmu-muted disabled:hover:border-lmu-border"
            title="Refresh LMU Directory Scan"
            aria-label="Refresh LMU directory scan"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-lmu-info' : ''}`} />
          </button>
        </div>

      </div>
    </header>
  );
};
