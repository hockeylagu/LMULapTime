import { DriverData } from '../../../server/types.js';
import { formatElapsedSeconds } from '../../utils/formatters.js';
import {
  getTrackLimitSeverity,
  getWorstTrackLimitSeverity,
  getTrackLimitBadgeClasses,
} from '../../utils/trackLimits.js';

export interface SessionStewardsLogProps {
  selectedDriver: DriverData;
  showIncidentsLog: boolean;
  setShowIncidentsLog: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SessionStewardsLog: React.FC<SessionStewardsLogProps> = ({
  selectedDriver,
  showIncidentsLog,
  setShowIncidentsLog,
}) => {
  const hasIncidents = (selectedDriver.totalIncidents ?? 0) > 0;
  const hasTrackLimits = (selectedDriver.totalTrackLimits ?? 0) > 0;
  const hasPenalties = (selectedDriver.totalPenalties ?? 0) > 0;

  if (!hasIncidents && !hasTrackLimits && !hasPenalties) {
    return null;
  }

  const allEvents: Array<{
    kind: 'incident' | 'trackLimit' | 'penalty';
    et?: number;
    description: string;
    badge: string;
    badgeClass: string;
    lapNum?: number;
  }> = [];

  const seenTrackLimits = new Set();

  selectedDriver.laps?.forEach((l) => {
    l.incidents?.forEach((inc) => {
      allEvents.push({
        kind: 'incident',
        et: inc.elapsedSeconds,
        description: inc.description,
        badge: inc.isWallImpact ? '🧱 Wall Contact' : inc.type === 'damage' ? '🔧 Damage' : '💥 Collision',
        badgeClass: inc.isWallImpact
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          : inc.type === 'damage'
          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        lapNum: l.lapNum,
      });
    });
    l.trackLimits?.forEach((tl) => {
      seenTrackLimits.add(tl);
      const severity = getTrackLimitSeverity(tl);
      allEvents.push({
        kind: 'trackLimit',
        et: tl.elapsedSeconds,
        description: tl.description,
        badge: '⚠️ Track Limit',
        badgeClass: getTrackLimitBadgeClasses(severity),
        lapNum: l.lapNum,
      });
    });
    l.penalties?.forEach((pen) => {
      allEvents.push({
        kind: 'penalty',
        et: pen.elapsedSeconds,
        description: pen.description,
        badge: `🛑 ${pen.penalty}`,
        badgeClass: 'bg-red-600/30 text-red-200 border-red-500/50',
        lapNum: l.lapNum,
      });
    });
  });

  selectedDriver.trackLimits?.forEach((tl) => {
    if (!seenTrackLimits.has(tl)) {
      const severity = getTrackLimitSeverity(tl);
      allEvents.push({
        kind: 'trackLimit',
        et: tl.elapsedSeconds,
        description: tl.description,
        badge: '⚠️ Track Limit',
        badgeClass: getTrackLimitBadgeClasses(severity),
        lapNum: tl.lapNum,
      });
    }
  });

  allEvents.sort((a, b) => (a.et ?? 0) - (b.et ?? 0));

  return (
    <div className="glass-panel p-4 rounded-2xl space-y-3">
      <div
        onClick={() => setShowIncidentsLog((prev) => !prev)}
        className="flex items-center justify-between cursor-pointer group select-none"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">💥</span>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider group-hover:text-lmu-gold transition-colors">
            Incidents & Stewards Log ({selectedDriver.name})
          </h3>
          <div className="flex items-center gap-1.5 ml-2 flex-wrap">
            {hasIncidents && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                💥 {selectedDriver.totalIncidents} Incident{(selectedDriver.totalIncidents ?? 0) !== 1 ? 's' : ''}
              </span>
            )}
            {hasTrackLimits && (() => {
              const allTls = selectedDriver.trackLimits && selectedDriver.trackLimits.length > 0
                ? selectedDriver.trackLimits
                : selectedDriver.laps?.flatMap((l) => l.trackLimits || []) || [];
              const tlSeverity = getWorstTrackLimitSeverity(allTls);
              const badgeClass = getTrackLimitBadgeClasses(tlSeverity);
              return (
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badgeClass}`}>
                  ⚠️ {selectedDriver.totalTrackLimits} Track Limit{(selectedDriver.totalTrackLimits ?? 0) !== 1 ? 's' : ''}
                </span>
              );
            })()}
            {hasPenalties && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-600/25 text-red-200 border border-red-500/40">
                🛑 {selectedDriver.totalPenalties} Penalt{(selectedDriver.totalPenalties ?? 0) !== 1 ? 'ies' : 'y'}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs font-semibold text-lmu-muted group-hover:text-white shrink-0">
          {showIncidentsLog ? 'Hide Details ▲' : 'Show Details ▼'}
        </span>
      </div>

      {showIncidentsLog && (
        <div className="pt-2 border-t border-lmu-border/50 divide-y divide-lmu-border/30 max-h-64 overflow-y-auto">
          {allEvents.map((evt, idx) => (
            <div key={idx} className="py-2 flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${evt.badgeClass}`}>
                  {evt.badge}
                </span>
                <span className="font-mono text-lmu-gold text-xs shrink-0">
                  {evt.lapNum ? `Lap ${evt.lapNum}` : '-'}
                </span>
                <span className="text-white truncate" title={evt.description}>
                  {evt.description}
                </span>
              </div>
              {evt.et !== undefined && evt.et > 0 && (
                <span className="text-lmu-muted font-mono text-[11px] shrink-0">
                  {formatElapsedSeconds(evt.et)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
