import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Trophy } from 'lucide-react';
import type { LeaderboardLayout, LeaderboardScope } from '../../../shared/types/leaderboard.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { updateSearchParams } from '../../utils/urlParams.js';
import { CompareLaps, CompareLapsProps } from './CompareLaps.js';
import { TrackRibbon } from './ribbon/TrackRibbon.js';
import { LayoutClassPills } from './ribbon/LayoutClassPills.js';
import { useLeaderboardLayouts } from './ribbon/useLeaderboardLayouts.js';
import { LeaderboardSection } from './board/LeaderboardSection.js';
import { useLeaderboard } from './board/useLeaderboard.js';
import { useBoardActions, boardLapTag } from './board/useBoardActions.js';
import { boardLapToComparable } from './board/leaderboardLaps.js';
import { RivalCard } from './rivals/RivalCard.js';
import { useRival } from './rivals/useRival.js';

/** The lap a deep link asked for belongs to the previous pick: a new track or class drops it. */
const CLEARED_LAP_PARAMS = {
  model: null,
  sessionId: null,
  lapNum: null,
  compareSessionId: null,
  compareDriver: null,
  compareLapNum: null,
};

/** The ribbon layout a track name (from the URL or a link) refers to. */
export function findLayoutForTrack(layouts: LeaderboardLayout[], track: string | null): LeaderboardLayout | null {
  if (!track) return null;
  const byName = layouts.find((l) => l.trackName === track);
  if (byName) return byName;
  const layoutKey = getCircuitSpecification(track).layoutKey;
  return layouts.find((l) => l.layoutKey === layoutKey) ?? null;
}

/**
 * Rivals & leaderboards: the tracks the player drove (newest first, the last one open by
 * default), where the player stands among the real drivers met there, and lap comparison.
 */
export const LeaderboardPage: React.FC<CompareLapsProps> = (props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { layouts, loading, error, retry: retryLayouts } = useLeaderboardLayouts();
  const requestedTrack = searchParams.get('track') || props.initialTrack || null;
  const track = requestedTrack === 'All' ? null : requestedTrack;
  const requestedCarClass = searchParams.get('carClass') || props.initialCarClass || null;
  const selectedLayout = useMemo(() => findLayoutForTrack(layouts, track), [layouts, track]);
  const layoutDefaultClass = selectedLayout?.lastCarClass || selectedLayout?.classes[0]?.carClass || null;
  const requestedClassIsAvailable = Boolean(requestedCarClass && requestedCarClass !== 'All' &&
    selectedLayout?.classes.some(item => item.carClass === requestedCarClass));
  const carClass = selectedLayout
    ? requestedClassIsAvailable ? requestedCarClass : layoutDefaultClass
    : requestedCarClass === 'All' ? null : requestedCarClass;
  const layoutKey = selectedLayout?.layoutKey ?? (track ? getCircuitSpecification(track).layoutKey : null);
  const scope: LeaderboardScope = searchParams.get('scope') === 'car' ? 'car' : 'class';
  const playerCarType = selectedLayout?.classes.find((c) => c.carClass === carClass)?.lastCarType || null;
  const leaderboard = useLeaderboard(layoutKey, carClass, scope === 'car' ? playerCarType : null);
  const { compareRequest, compareRef, scrollToCompare, onPick, onCompare, onAnalyse, onTelemetry } = useBoardActions(leaderboard.board, carClass);
  const [comparedLapIds, setComparedLapIds] = useState<string[]>([]);
  const rival = useRival(layoutKey && carClass ? { layoutKey, carClass, carType: scope === 'car' ? playerCarType : null } : null);
  const rivalName = rival.status?.rival?.kind === 'driver' ? rival.status.rival.driverName : null;
  const rivalEntry = rival.status?.rivalEntry ?? null;
  const rivalLap = useMemo(
    () => (rivalEntry && carClass ? boardLapToComparable(rivalEntry, carClass, boardLapTag(rivalEntry)) : null),
    [rivalEntry, carClass]
  );

  // Pick a track if the URL has none, and resolve missing/All classes against that layout.
  useEffect(() => {
    if (layouts.length === 0) return;
    if (!track) {
      const layout = layouts[0];
      const keepRequested = requestedCarClass && requestedCarClass !== 'All' && layout.classes.some(item => item.carClass === requestedCarClass);
      updateSearchParams(searchParams, setSearchParams, {
        track: layout.trackName,
        carClass: keepRequested ? requestedCarClass : layout.lastCarClass || layout.classes[0]?.carClass,
      });
      return;
    }
    if (selectedLayout && carClass && searchParams.get('carClass') !== carClass) {
      updateSearchParams(searchParams, setSearchParams, { carClass });
    }
  }, [track, layouts, selectedLayout, requestedCarClass, carClass, searchParams, setSearchParams]);

  const selectLayout = (layout: LeaderboardLayout) => {
    if (layout.layoutKey === selectedLayout?.layoutKey) return;
    updateSearchParams(searchParams, setSearchParams, {
      ...CLEARED_LAP_PARAMS,
      track: layout.trackName,
      carClass: layout.lastCarClass,
    });
  };

  const selectClass = (nextClass: string) => {
    if (nextClass === carClass) return;
    updateSearchParams(searchParams, setSearchParams, { ...CLEARED_LAP_PARAMS, carClass: nextClass });
  };

  return (
    <div className="space-y-6">
      <section className="bg-lmu-card border border-lmu-border p-6 rounded-2xl space-y-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-lmu-gold" />
            Leaderboard
          </h2>
          <p className="text-xs text-lmu-muted mt-0.5">
            Where you stand among the drivers you raced online, track by track and class by class.
          </p>
        </div>
        <TrackRibbon
          layouts={layouts}
          selectedLayoutKey={selectedLayout?.layoutKey ?? null}
          loading={loading}
          error={error}
          onSelect={selectLayout}
          onRetry={retryLayouts}
        />
        {selectedLayout && carClass && (
          <LayoutClassPills layout={selectedLayout} selectedCarClass={carClass} onSelect={selectClass} />
        )}
      </section>

      <RivalCard rival={rival} player={leaderboard.board?.player ?? null} onCompare={onAnalyse} onTelemetry={onTelemetry} />

      {layoutKey && carClass && (
        <LeaderboardSection
          {...leaderboard}
          rivalName={rivalName}
          onPin={rival.pin}
          carClass={carClass}
          scope={scope}
          playerCarType={playerCarType}
          onScopeChange={(next) => updateSearchParams(searchParams, setSearchParams, { scope: next === 'car' ? 'car' : null })}
          onCompare={onCompare}
          onTelemetry={onTelemetry}
          comparedLapIds={comparedLapIds}
          onPick={onPick}
          onGoToCompare={scrollToCompare}
          onOpenSession={props.onSelectSession}
        />
      )}

      {track && (
        <div ref={compareRef} className="scroll-mt-4">
          <CompareLaps {...props} compareRequest={compareRequest} onComparedLapsChange={setComparedLapIds} rivalLap={rivalLap} />
        </div>
      )}
    </div>
  );
};
