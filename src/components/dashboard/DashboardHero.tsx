import React from 'react';
import { Gauge, Trophy, Zap, Video, ChevronRight, Calendar, Activity } from 'lucide-react';
import { useDashboardTrends } from './useDashboardTrends.js';
import { DashboardPaceSparkline } from './DashboardPaceSparkline.js';
import { TrackCircuitLayout } from '../track-detail/TrackCircuitLayout.js';
import type { TrackBoundaryGeometry } from '../replay/map/index.js';
import { PACE_CATEGORY_STYLES } from '../../utils/paceCategoryStyles.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import type { SessionSummary } from './dashboardTypes.js';

export interface DashboardHeroProps {
  sessions: SessionSummary[];
  onSelectSession: (id: string) => void;
  onOpenReplay?: (id: string) => void;
  trackGeometry?: TrackBoundaryGeometry | null;
  className?: string;
}

export const DashboardHero: React.FC<DashboardHeroProps> = ({
  sessions,
  onSelectSession,
  onOpenReplay,
  trackGeometry,
  className = '',
}) => {
  const {
    hasData,
    driverName,
    latestOuting,
    todayActivity,
    recentPaceTrend,
    paceDelta,
    paceTrendDirection,
    recentCleanRate,
    recentConsistency,
    recentNetPositions,
  } = useDashboardTrends(sessions);

  if (!hasData || !latestOuting) {
    return null;
  }

  const paceStyle = latestOuting.paceCategory ? PACE_CATEGORY_STYLES[latestOuting.paceCategory] : null;

  return (
    <div
      data-testid="dashboard-hero-command-center"
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-lmu-card via-lmu-surface to-lmu-deep border border-sky-500/20 shadow-xl shadow-black/50 p-5 ${className}`}
    >
      {/* Background motorsport telemetry glow accents */}
      <div className="absolute top-0 right-1/4 w-96 h-32 bg-sky-500/5 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-10 w-80 h-28 bg-emerald-500/5 blur-3xl pointer-events-none rounded-full" />

      {/* Driver Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-600/10 border border-sky-400/30 flex items-center justify-center text-sky-400 shadow-inner">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">{driverName}</span>
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active Stint
              </span>
            </div>
            <p className="text-xs text-lmu-muted">Here is your latest session telemetry and driving momentum.</p>
          </div>
        </div>

        {todayActivity && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 self-start sm:self-auto">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400">Activity ({todayActivity.dateString}):</span>
            <span className="text-white font-bold">{todayActivity.sessionsCount}</span>
            <span className="text-slate-500">runs ·</span>
            <span className="text-white font-bold">{todayActivity.lapsCount}</span>
            <span className="text-slate-500">laps ·</span>
            <span className="text-emerald-400 font-bold">{todayActivity.distanceKm} km</span>
          </div>
        )}
      </div>

      {/* Grid: Latest Outing Spotlight + Recent Pace Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Latest Outing Spotlight (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 hover:border-slate-700/80 transition-colors">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold tracking-wider uppercase text-sky-400">
                <Gauge className="w-3.5 h-3.5" /> Latest Outing Spotlight
              </span>
              <span className="text-[11px] font-mono text-lmu-muted">{latestOuting.timeString}</span>
            </div>

            <div className="flex items-start justify-between gap-3 mt-1">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <TrackCircuitLayout
                  trackName={latestOuting.trackVenue || latestOuting.trackName}
                  trackCourse={latestOuting.trackCourse}
                  trackGeometry={trackGeometry}
                  size="card"
                  onClick={() => onSelectSession(latestOuting.id)}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-wide truncate">{latestOuting.trackName}</h3>
                    <span
                      data-testid="hero-session-type-badge"
                      className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold shrink-0 ${
                        latestOuting.sessionType === 'Race'
                          ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30'
                          : latestOuting.sessionType === 'Qualifying'
                          ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30'
                          : 'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                      }`}
                    >
                      {latestOuting.sessionType}
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-slate-400 mt-1 truncate">
                    <span className="truncate">{latestOuting.carName}</span>
                    {latestOuting.carClass && (
                      <CarClassBadge
                        carClass={latestOuting.carClass}
                        carType={latestOuting.carName}
                        size="xs"
                        className="ml-2"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Race Position Pill */}
              {latestOuting.sessionType === 'Race' && latestOuting.position && (
                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 font-mono">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-extrabold text-white">P{latestOuting.position}</span>
                    {latestOuting.positionGain !== null && latestOuting.positionGain !== undefined && (
                      <span
                        className={`text-[11px] font-bold ${
                          latestOuting.positionGain > 0
                            ? 'text-emerald-400'
                            : latestOuting.positionGain < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        ({latestOuting.positionGain > 0 ? `+${latestOuting.positionGain}` : latestOuting.positionGain})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Lap Metrics Badges */}
            <div className="flex flex-wrap items-start gap-6 mt-4 pt-3 border-t border-slate-800/60 font-mono">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Best Lap</span>
                <span className="text-base font-extrabold text-white leading-6 mt-0.5">
                  {latestOuting.bestLapTimeString || '--:--.---'}
                </span>
              </div>

              {paceStyle && latestOuting.pacePercentage && (
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Benchmark Pace</span>
                  <div className="h-6 flex items-center mt-0.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${paceStyle.badgeClass}`}>
                      <span>{paceStyle.emoji}</span>
                      <span>{paceStyle.label}</span>
                      <span>({latestOuting.pacePercentage.toFixed(1)}%)</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col ml-auto text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Laps</span>
                <span className="text-base font-extrabold text-slate-200 leading-6 mt-0.5">
                  {latestOuting.lapsCount}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-4 pt-2">
            {latestOuting.hasReplay && onOpenReplay && (
              <button
                type="button"
                onClick={() => onOpenReplay(latestOuting.id)}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border ${
                  latestOuting.hasDuckDbTelemetry
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:border-amber-500/60'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50'
                }`}
                data-testid="hero-launch-replay-btn"
              >
                {latestOuting.hasDuckDbTelemetry ? (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                    <span>Launch 100Hz Replay</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Launch Replay</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectSession(latestOuting.id)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs transition-colors cursor-pointer"
              data-testid="hero-inspect-session-btn"
            >
              Session Details
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Recent Momentum & Pace Progression (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 hover:border-slate-700/80 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-emerald-400 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" /> Recent Form & Momentum
              </span>
              <span className="text-[11px] font-mono text-lmu-muted">Last {recentPaceTrend.length} Stints</span>
            </div>

            <DashboardPaceSparkline
              points={recentPaceTrend}
              paceDelta={paceDelta}
              paceTrendDirection={paceTrendDirection}
              className="my-1"
            />
          </div>

          {/* Quick Momentum Metrics */}
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/60 font-mono text-xs">
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/80">
              <div className="text-[10px] text-lmu-muted uppercase tracking-wider">Clean Lap Rate</div>
              <div className="text-white font-bold mt-0.5">
                {recentCleanRate !== null ? `${recentCleanRate}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/80">
              <div className="text-[10px] text-lmu-muted uppercase tracking-wider">Lap Consistency</div>
              <div className="text-white font-bold mt-0.5">
                {recentConsistency !== null ? `${recentConsistency}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800/80">
              <div className="text-[10px] text-lmu-muted uppercase tracking-wider">Race Net Positions</div>
              <div
                className={`font-bold mt-0.5 ${
                  recentNetPositions > 0
                    ? 'text-emerald-400'
                    : recentNetPositions < 0
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {recentNetPositions > 0 ? `+${recentNetPositions}` : recentNetPositions}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
