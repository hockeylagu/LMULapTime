import React, { useState } from 'react';
import { Car, ChevronRight, Video, AlertCircle, MapPin, LayoutGrid, Table as TableIcon, FilterX } from 'lucide-react';
import { isSessionEmpty, getDisplayTrackName } from '../utils/formatters.js';
import { getPaceCategoryStyle } from '../utils/paceCategory.js';
import { getHashRouteAndParams, updateHashParams } from '../utils/urlParams.js';
import { PaceCategory } from '../../server/types.js';

export interface SessionListItem {
  id: string;
  filename?: string;
  trackVenue?: string;
  trackCourse?: string;
  timeString: string;
  sessionType: string;
  sessionName?: string;
  weatherInfo?: string;
  driversCount?: number;
  matchingReplayFile?: {
    name: string;
    path: string;
  };
  playerDriver?: {
    name?: string;
    carType: string;
    carClass?: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    lapsCount: number;
  };
}

export interface SessionListProps {
  sessions: SessionListItem[];
  onSelectSession: (sessionId: string) => void;
  showTrackColumn?: boolean;
  getPaceBadge?: (session: SessionListItem) => { category: PaceCategory; percentage?: number | null } | null;
  emptyMessage?: string;
  onResetFilters?: () => void;
  hideEmptyNotice?: React.ReactNode;
  headerTitle?: React.ReactNode;
  headerSubtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  viewMode?: 'grid' | 'table';
  onViewModeChange?: (mode: 'grid' | 'table') => void;
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  onSelectSession,
  showTrackColumn = true,
  getPaceBadge,
  emptyMessage = 'No sessions found matching filters.',
  onResetFilters,
  hideEmptyNotice,
  headerTitle,
  headerSubtitle,
  headerActions,
  viewMode: controlledViewMode,
  onViewModeChange,
}) => {
  const { params: initialParams } = getHashRouteAndParams();
  const [internalViewMode, setInternalViewMode] = useState<'grid' | 'table'>(() => {
    const paramView = initialParams.get('view');
    if (paramView === 'table' || paramView === 'grid') return paramView;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lmu_dashboard_view');
      if (saved === 'table' || saved === 'grid') return saved;
    }
    return 'grid';
  });

  const viewMode = controlledViewMode ?? internalViewMode;

  const handleSetViewMode = (mode: 'grid' | 'table') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('lmu_dashboard_view', mode);
        } catch {}
      }
      updateHashParams({ view: mode });
    }
  };

  const resolvePaceBadge = (s: SessionListItem) => {
    if (getPaceBadge) {
      return getPaceBadge(s);
    }
    const p = s.playerDriver;
    if (p?.bestLapPaceCategory) {
      return {
        category: p.bestLapPaceCategory,
        percentage: p.bestLapPacePercentage,
      };
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Header with Title, Actions & View Mode Toggle */}
      {(headerTitle || headerSubtitle || headerActions) && (
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-lmu-border/50 pb-4">
          <div>
            {headerTitle && (
              <div className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                {headerTitle}
              </div>
            )}
            {headerSubtitle && (
              <div className="text-xs text-lmu-muted mt-0.5">
                {headerSubtitle}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {headerActions}

            {/* View Mode Toggle Button Group */}
            <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold shrink-0">
              <button
                onClick={() => handleSetViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-lmu-accent text-white shadow-sm font-bold'
                    : 'text-lmu-muted hover:text-white'
                }`}
                title="Cards view"
                aria-label="Cards view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                onClick={() => handleSetViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-lmu-accent text-white shadow-sm font-bold'
                    : 'text-lmu-muted hover:text-white'
                }`}
                title="Table view"
                aria-label="Table view"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* When no header was provided at all, still render view toggle */}
      {!headerTitle && !headerSubtitle && !headerActions && (
        <div className="flex justify-end mb-2">
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold">
            <button
              onClick={() => handleSetViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-lmu-accent text-white shadow-sm font-bold'
                  : 'text-lmu-muted hover:text-white'
              }`}
              title="Cards view"
              aria-label="Cards view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => handleSetViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-lmu-accent text-white shadow-sm font-bold'
                  : 'text-lmu-muted hover:text-white'
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {sessions.length === 0 ? (
        <div className="py-12 text-center text-lmu-muted">
          <p className="text-base font-medium">{emptyMessage}</p>
          {onResetFilters && (
            <div className="mt-3">
              <button
                onClick={onResetFilters}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-lmu-card hover:bg-lmu-accent text-white border border-lmu-border text-xs font-semibold transition-all cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            </div>
          )}
          {hideEmptyNotice && (
            <div className="text-xs text-lmu-muted mt-2">
              {hideEmptyNotice}
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Cards / Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map(s => {
            const p = s.playerDriver;
            const empty = isSessionEmpty(s);
            const pace = resolvePaceBadge(s);
            const displayTrack = s.trackVenue ? getDisplayTrackName(s.trackVenue, s.trackCourse) : '';

            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`glass-panel glass-panel-hover p-4 rounded-xl cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden ${
                  empty ? 'border-amber-500/30 bg-amber-950/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                        s.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
                        s.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30' :
                        'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                      }`}>
                        {s.sessionName || s.sessionType}
                      </span>
                      {s.weatherInfo && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-lmu-bg/80 border border-lmu-border/60 text-lmu-muted">
                          {s.weatherInfo}
                        </span>
                      )}
                      {empty && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Empty
                        </span>
                      )}
                    </div>

                    {showTrackColumn && displayTrack && (
                      <h4 className="font-bold text-white text-base mt-2 truncate leading-tight" title={displayTrack}>
                        {displayTrack}
                      </h4>
                    )}

                    <p className={`text-xs text-lmu-muted ${showTrackColumn && displayTrack ? 'mt-0.5' : 'mt-2'}`}>
                      {s.timeString}
                    </p>
                  </div>

                  {s.matchingReplayFile && (
                    <span className="p-1.5 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20 shrink-0 mt-0.5" title={`Replay VCR: ${s.matchingReplayFile.name}`}>
                      <Video className="w-4 h-4" />
                    </span>
                  )}
                </div>

                {/* Driver / Car / Lap info */}
                <div className="pt-2 border-t border-lmu-border/60 flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <p className="text-lmu-muted flex items-center gap-1">
                      <Car className="w-3.5 h-3.5 text-lmu-cyan" />
                      <span className="text-white font-medium truncate max-w-[160px]">
                        {p ? p.carType : 'N/A'}
                      </span>
                    </p>
                    <p className="text-lmu-muted">
                      Laps Driven: <span className="text-white font-semibold">{p ? p.lapsCount : 0}</span>
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lmu-muted">Best Lap</p>
                    <p className="font-mono font-bold text-sm text-lmu-gold">
                      {p?.bestLapTimeString || '--:--.---'}
                    </p>
                    {pace && (
                      <div className="mt-0.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${getPaceCategoryStyle(pace.category).badgeClass}`}>
                          <span>{getPaceCategoryStyle(pace.category).emoji}</span>
                          <span>{pace.category}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs text-lmu-accent font-semibold group">
                  <span>Analyze Sector Details</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-lmu-muted">
            <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
              <tr>
                {showTrackColumn && <th className="px-3.5 py-3">Track / Layout</th>}
                <th className="px-3.5 py-3">Session</th>
                <th className="px-3.5 py-3">Date & Time</th>
                <th className="px-3.5 py-3">Car / Class</th>
                <th className="px-3.5 py-3 text-center">Laps</th>
                <th className="px-3.5 py-3 text-right">Best Lap</th>
                <th className="px-3.5 py-3 text-center">Benchmark Pace</th>
                <th className="px-3.5 py-3 text-center">Replay</th>
                <th className="px-3.5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lmu-border/50">
              {sessions.map(s => {
                const p = s.playerDriver;
                const empty = isSessionEmpty(s);
                const pace = resolvePaceBadge(s);
                const displayTrack = s.trackVenue ? getDisplayTrackName(s.trackVenue, s.trackCourse) : '';

                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    className={`hover:bg-lmu-card/60 transition-colors cursor-pointer group ${
                      empty ? 'bg-amber-950/10' : ''
                    }`}
                  >
                    {/* Track */}
                    {showTrackColumn && (
                      <td className="px-3.5 py-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-lmu-accent shrink-0" />
                          <span className="font-bold text-white group-hover:text-lmu-accent transition-colors">
                            {displayTrack || 'Circuit'}
                          </span>
                        </div>
                      </td>
                    )}

                    {/* Session Type & Name */}
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded uppercase tracking-wider ${
                          s.sessionType === 'Race' ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30' :
                          s.sessionType === 'Qualifying' ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30' :
                          'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
                        }`}>
                          {s.sessionName || s.sessionType}
                        </span>
                        {s.weatherInfo && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-lmu-bg/80 border border-lmu-border/60 text-lmu-muted">
                            {s.weatherInfo}
                          </span>
                        )}
                        {empty && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Empty
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Date & Time */}
                    <td className="px-3.5 py-3 font-mono text-[11px] text-lmu-muted whitespace-nowrap">
                      {s.timeString}
                    </td>

                    {/* Car & Class */}
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-lmu-cyan shrink-0" />
                        <span className="text-white font-medium truncate max-w-[180px]" title={p?.carType || 'N/A'}>
                          {p?.carType || 'N/A'}
                        </span>
                        {p?.carClass && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-lmu-bg border border-lmu-border text-lmu-muted">
                            {p.carClass}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Laps */}
                    <td className="px-3.5 py-3 text-center font-mono font-semibold text-white">
                      {p ? p.lapsCount : 0}
                    </td>

                    {/* Best Lap */}
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-sm text-lmu-gold">
                      {p?.bestLapTimeString || '--:--.---'}
                    </td>

                    {/* Benchmark Pace */}
                    <td className="px-3.5 py-3 text-center">
                      {pace ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${getPaceCategoryStyle(pace.category).badgeClass}`}>
                          <span>{getPaceCategoryStyle(pace.category).emoji}</span>
                          <span>{pace.category}</span>
                          {pace.percentage && (
                            <span className="opacity-80 font-mono text-[10px]">({pace.percentage.toFixed(1)}%)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-lmu-muted text-xs">-</span>
                      )}
                    </td>

                    {/* Replay */}
                    <td className="px-3.5 py-3 text-center">
                      {s.matchingReplayFile ? (
                        <span className="inline-flex p-1 rounded-lg bg-lmu-green/10 text-lmu-green border border-lmu-green/20" title={`Replay VCR: ${s.matchingReplayFile.name}`}>
                          <Video className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="text-lmu-muted text-xs">-</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-3.5 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-lmu-accent group-hover:text-white transition-colors">
                        <span>Analyze</span>
                        <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
