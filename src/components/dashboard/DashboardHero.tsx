import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useDashboardTrends } from './useDashboardTrends.js';
import { DashboardPaceSparkline } from './DashboardPaceSparkline.js';
import { TrackCircuitLayout } from '../track-detail/TrackCircuitLayout.js';
import type { TrackBoundaryGeometry } from '../replay/map/index.js';
import { PaceBadge } from '../common/PaceBadge.js';
import { CarClassBadge } from '../common/CarClassBadge.js';
import { ReplayLaunchButton } from '../common/ReplayLaunchButton.js';
import { VEHICLE_CLASS_OPTIONS } from '../../../shared/domain/paceCategory.js';
import { getSessionTypeStyle } from '../common/sessionTypeStyles.js';
import type { SessionSummary } from './dashboardTypes.js';

export interface DashboardHeroProps {
  sessions: SessionSummary[];
  onSelectSession: (id: string) => void;
  onOpenReplay?: (id: string, targetLap?: number) => void;
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
    paceTrendClass,
    recentCleanRate,
    recentConsistency,
    recentNetPositions,
  } = useDashboardTrends(sessions);

  if (!hasData || !latestOuting) {
    return null;
  }


  return (
    <div
      data-testid="dashboard-hero-command-center"
      className={`relative overflow-hidden rounded-2xl bg-lmu-card border border-lmu-border p-5 ${className}`}
    >
      {/* Greeting, and the last day driven on the same line */}
      <div className="flex items-baseline justify-between gap-6 pb-4 mb-4 border-b border-lmu-border">
        <h2 className="text-lg font-semibold text-lmu-muted tracking-tight">
          Welcome back, <span className="font-extrabold text-white">{driverName}</span>
        </h2>
        {todayActivity && (
          <p className="text-xs text-lmu-muted shrink-0">
            Last on track <span className="font-mono text-lmu-text-soft">{todayActivity.dateString}</span>
            {' · '}
            <span className="font-mono font-bold text-white">{todayActivity.sessionsCount}</span>{' '}
            {todayActivity.sessionsCount === 1 ? 'session' : 'sessions'}
            {' · '}
            <span className="font-mono font-bold text-white">{todayActivity.lapsCount}</span>{' '}
            {todayActivity.lapsCount === 1 ? 'lap' : 'laps'}
            {' · '}
            <span className="font-mono font-bold text-white">{todayActivity.distanceKm}</span> km
          </p>
        )}
      </div>

      {/* Grid: latest session + recent form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x lg:divide-lmu-border">
        {/* Left column: latest session (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between lg:pr-6">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-lmu-text-soft">Latest session</span>
              <span className="text-[11px] font-mono text-lmu-muted">{latestOuting.timeString}</span>
            </div>

            <div className="flex items-start justify-between gap-3 mt-1">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <TrackCircuitLayout
                  trackName={latestOuting.trackVenue || latestOuting.trackName}
                  trackCourse={latestOuting.trackCourse}
                  trackGeometry={trackGeometry}
                  size="session"
                  onClick={() => onSelectSession(latestOuting.id)}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white tracking-tight truncate">{latestOuting.trackName}</h3>
                    <span
                      data-testid="hero-session-type-badge"
                      className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold shrink-0 ${
                        getSessionTypeStyle(latestOuting.sessionType)?.chip ?? 'bg-lmu-raised text-lmu-text-soft border-lmu-rule'
                      }`}
                    >
                      {latestOuting.sessionType}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-lmu-muted mt-1.5 truncate">
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
            </div>

            {/* The best lap is the figure; finish, pace and laps support it */}
            <div className="flex flex-wrap items-end gap-8 mt-4 pt-3 border-t border-lmu-border/60 font-mono">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-lmu-muted">Best Lap</span>
                <span className="text-[28px] leading-8 font-extrabold text-white tabular-nums mt-0.5">
                  {latestOuting.bestLapTimeString || '--:--.---'}
                </span>
              </div>

              {latestOuting.sessionType === 'Race' && latestOuting.position && (
                <div className="flex flex-col" data-testid="hero-finish">
                  <span className="text-[10px] uppercase tracking-wider text-lmu-muted">Finish</span>
                  <span className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`text-xl font-extrabold ${latestOuting.position === 1 ? 'text-lmu-gold' : 'text-white'}`}>
                      P{latestOuting.position}
                    </span>
                    {latestOuting.positionGain !== null && latestOuting.positionGain !== undefined && (
                      <span
                        data-testid="hero-finish-gain"
                        className={`text-xs font-bold ${
                          latestOuting.positionGain > 0
                            ? 'text-lmu-gain'
                            : latestOuting.positionGain < 0
                            ? 'text-lmu-loss'
                            : 'text-lmu-muted'
                        }`}
                      >
                        {latestOuting.positionGain > 0 ? `+${latestOuting.positionGain}` : latestOuting.positionGain}
                      </span>
                    )}
                    {latestOuting.gridPosition && (
                      <span className="text-xs text-lmu-muted">from P{latestOuting.gridPosition}</span>
                    )}
                  </span>
                </div>
              )}

              {latestOuting.paceCategory && latestOuting.pacePercentage && (
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-lmu-muted">Benchmark Pace</span>
                  <div className="h-7 flex items-center mt-0.5">
                    <PaceBadge category={latestOuting.paceCategory} percentage={latestOuting.pacePercentage} showPercentage />
                  </div>
                </div>
              )}

              <div className="flex flex-col ml-auto text-right">
                <span className="text-[10px] uppercase tracking-wider text-lmu-muted">Laps</span>
                <span className="text-xl font-extrabold text-lmu-text mt-0.5">{latestOuting.lapsCount}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-5">
            {latestOuting.hasReplay && onOpenReplay && (
              <ReplayLaunchButton
                hasDuckDb={Boolean(latestOuting.hasDuckDbTelemetry)}
                onClick={() => onOpenReplay(latestOuting.id, latestOuting.bestLapNum ?? undefined)}
                data-testid="hero-launch-replay-btn"
                title={latestOuting.bestLapNum ? `Open telemetry for Best Lap (Lap ${latestOuting.bestLapNum})` : 'Open telemetry'}
              />
            )}
            <button
              type="button"
              onClick={() => onSelectSession(latestOuting.id)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-lmu-raised hover:bg-lmu-rule text-lmu-text border border-lmu-rule font-medium text-xs transition-colors cursor-pointer"
              data-testid="hero-inspect-session-btn"
            >
              Session Details
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right column: recent form (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between lg:pl-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-lmu-text-soft">Recent form</span>
              <span className="text-[11px] font-mono text-lmu-muted">
                Last {recentPaceTrend.length} {recentPaceTrend.length === 1 ? 'session' : 'sessions'}{paceTrendClass ? ` · ${VEHICLE_CLASS_OPTIONS.find(o => o.id === paceTrendClass)?.label ?? paceTrendClass}` : ''}
              </span>
            </div>

            <DashboardPaceSparkline
              points={recentPaceTrend}
              paceDelta={paceDelta}
              paceTrendDirection={paceTrendDirection}
              className="my-1"
            />
          </div>

          {/* Quick Momentum Metrics */}
          <div className="grid grid-cols-3 gap-4 mt-4 pt-3 border-t border-lmu-border/60 font-mono text-xs">
            <div>
              <div className="text-[10px] text-lmu-muted uppercase tracking-wider">Clean Lap Rate</div>
              <div className="text-white font-bold mt-0.5">
                {recentCleanRate !== null ? `${recentCleanRate}%` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-lmu-muted uppercase tracking-wider">Lap Consistency</div>
              <div className="text-white font-bold mt-0.5">
                {recentConsistency !== null ? `${recentConsistency}%` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-lmu-muted uppercase tracking-wider">Race Net Positions</div>
              <div
                className={`font-bold mt-0.5 ${
                  recentNetPositions > 0
                    ? 'text-lmu-gain'
                    : recentNetPositions < 0
                    ? 'text-lmu-loss'
                    : 'text-lmu-text-soft'
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
