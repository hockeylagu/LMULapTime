import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { RaceReplayOverview, RaceReplayProgress, ReplayMetadata } from '../../../../shared/types/index.js';
import { fetchRaceOverview, fetchRacePoseWindow, lastRaceOverview, fetchRaceDistances, fetchSessionReplayMetadata, lastSessionReplayMetadata } from '../../../api/replayApi.js';
import { loadedRace3DView, loadRace3DView } from './raceModeContext.js';
import { racePitSlots } from '../../../../shared/domain/raceReplay/poseWindow.js';
import { isNonRaceSession } from '../../../../shared/domain/raceTraffic.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { LoadingState } from '../../common/LoadingState.js';
import { createRaceClock } from './raceClock.js';
import { createRacePoseCache, findRaceStartSec } from './racePoseCache.js';
import { indexRaceStandings } from './raceStandings.js';
import { RaceMapScene } from './RaceMapScene.js';
import { RaceStandingsTower } from './RaceStandingsTower.js';
import { RacePlaybackBar } from './RacePlaybackBar.js';
import { RaceCarHud } from './RaceCarHud.js';
import { useRaceReplayKeys, useRaceUrlSync } from './useRaceReplayControls.js';
import { RaceReplayHeader } from './RaceReplayHeader.js';
import { initialRaceTime } from './raceLaps.js';
import { Replay3DLoading } from '../view3d/scene/Replay3DLoading.js';

const Race3DView = lazy(loadRace3DView);

export interface RaceReplayViewProps {
  sessionId: string;
  /** Replay clock to open at; else the start of `initialLapNumber` of `initialSlot`, else the session start. */
  initialTimeSec?: number | null;
  initialSlot?: number | null;
  initialLapNumber?: number | null;
  /** Seconds into `initialLapNumber` to open at (the lap view's cursor). */
  initialLapSec?: number | null;
  onClose: () => void;
  /** Opens a session driver's lap in the lap view, `lapSec` seconds into it. */
  onOpenLap: (driverOrdinal: number, lapOrdinal: number, lapSec: number) => void;
  /** The 2D map or the 3D view, shared with the lap view. */
  view: '2d' | '3d';
  onViewChange: (view: '2d' | '3d') => void;
  /** The clock and followed car to keep in the URL (written while paused). */
  onStateChange: (timeSec: number, slot: number | null) => void;
}

/** The race mode of the replay inspector: every car of the session on one clock. */
export const RaceReplayView: React.FC<RaceReplayViewProps> = (props) => {
  const { sessionId, onClose, view } = props;
  // The lap view asked for the overview ahead: the race shows at once, without the loading page.
  const [state, setState] = useState<{ sessionId: string; overview?: RaceReplayOverview; error?: string } | null>(() => {
    const overview = lastRaceOverview(sessionId);
    return overview ? { sessionId, overview } : null;
  });
  const [attempt, setAttempt] = useState(0);
  // The 3D view's code loads beside the overview: coming from the lap view in 3D, no loading card waits for it.
  useEffect(() => { if (view === '3d') loadRace3DView().catch(() => {}); /* A failed load surfaces from the lazy view. */ }, [view]);
  // Asked even when the first render had it: an overview that arrives between the first render and this effect only shows from
  // here, as one the session changed to (the request is shared, so a fetched one costs nothing more).
  useEffect(() => {
    const controller = new AbortController();
    fetchRaceOverview(sessionId, controller.signal).then(
      overview => setState(current => (current?.sessionId === sessionId && current.overview === overview ? current : { sessionId, overview })),
      (error: unknown) => { if (!isAbortError(error)) setState({ sessionId, error: apiErrorMessage(error, 'The race replay could not load') }); },
    );
    return () => controller.abort();
  }, [sessionId, attempt]);
  const current = state?.sessionId === sessionId ? state : null;
  // The replay's metadata names the track, the conditions and each car's model in the header; the race shows without it.
  // The lap view already fetched it: reuse it so the header does not blank out on the switch.
  const [metadata, setMetadata] = useState<{ sessionId: string; value: ReplayMetadata } | null>(() => {
    const value = lastSessionReplayMetadata(sessionId);
    return value ? { sessionId, value } : null;
  });
  useEffect(() => {
    if (lastSessionReplayMetadata(sessionId)) return;
    const controller = new AbortController();
    fetchSessionReplayMetadata(sessionId, { signal: controller.signal }).then(value => setMetadata({ sessionId, value }), () => {});
    return () => controller.abort();
  }, [sessionId]);
  // The cache covers a session changed to whose metadata the lap view already fetched (the effect above skips it).
  const replayMetadata = metadata?.sessionId === sessionId ? metadata.value : lastSessionReplayMetadata(sessionId);

  return (
    <div className="flex h-screen min-w-[1480px] flex-col bg-lmu-bg text-lmu-text">
      {current?.overview ? <RaceReplayBody key={current.overview.replayName} {...props} overview={current.overview} metadata={replayMetadata} /> : (
        <>
          <RaceReplayHeader onClose={onClose} metadata={replayMetadata} />
          <div className="flex flex-1 items-center justify-center text-sm text-lmu-muted">
            {current?.error ? (
              <div role="alert" className="flex items-center gap-3">
                <span>{current.error}</span>
                <button type="button" onClick={() => setAttempt(n => n + 1)} className={`underline underline-offset-4 text-lmu-text-soft ${FOCUS_RING}`}>Retry</button>
              </div>
            ) : (
              <LoadingState
                card={false}
                title="Loading Session Replay"
                subtitle="Preparing session overview and car standings..."
                dataTestId="race-replay-loading"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

const RaceReplayBody: React.FC<RaceReplayViewProps & { overview: RaceReplayOverview; metadata: ReplayMetadata | null }> = ({
  sessionId, overview, metadata, initialTimeSec, initialSlot, initialLapNumber, initialLapSec, onClose, onOpenLap, onStateChange, view, onViewChange,
}) => {
  const [followSlot, setFollowSlot] = useState<number | null>(
    initialSlot ?? overview.cars.find(car => car.isPlayer)?.slot ?? null);
  // Made once (the body is keyed by replay): the URL's time only seeds the clock.
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [clock] = useState(() => createRaceClock(overview.startSec, overview.endSec,
    initialRaceTime(overview, initialTimeSec, initialSlot, initialLapNumber, initialLapSec)));
  useEffect(() => () => clock.dispose(), [clock]);
  const [, setPoseVersion] = useState(0);
  const [poses] = useState(() => createRacePoseCache(overview.windowSec,
    (index, signal) => fetchRacePoseWindow(sessionId, index, { signal }), () => setPoseVersion(n => n + 1)));
  useEffect(() => () => poses.dispose(), [poses]);
  // Live gaps between line crossings; without it (no centreline, still building) the gaps stay those of the last crossing.
  const [progress, setProgress] = useState<RaceReplayProgress | null>(null);
  useEffect(() => {
    if (isNonRaceSession(overview.sessionType)) return;
    const controller = new AbortController();
    fetchRaceDistances(sessionId, { signal: controller.signal }).then(setProgress, () => {});
    return () => controller.abort();
  }, [sessionId, overview]);
  // A race's cars wait on the grid before the formation lap: the playback bar skips to where the followed car starts.
  const [raceStart, setRaceStart] = useState<{ slot: number | null; sec: number | null } | null>(null);
  useEffect(() => {
    if (isNonRaceSession(overview.sessionType)) return;
    const controller = new AbortController();
    findRaceStartSec(overview.windowSec, overview.startSec, followSlot, poses.read, controller.signal).then(sec => setRaceStart({ slot: followSlot, sec }), () => {});
    return () => controller.abort();
  }, [poses, overview, followSlot]);
  const raceStartSec = raceStart?.slot === followSlot ? raceStart.sec : null;
  const index = useMemo(() => indexRaceStandings(overview, progress), [overview, progress]);
  const carsBySlot = useMemo(() => new Map(overview.cars.map(car => [car.slot, car])), [overview]);
  useRaceReplayKeys(clock);
  // Each double click in the standings puts the map on the followed car.
  const [trackRequest, setTrackRequest] = useState(0);
  useRaceUrlSync(clock, followSlot, onStateChange);
  // Once opened, the 3D view stays loaded while the page shows the 2D map: hidden, its keys and drawing stop.
  const [kept3d, setKept3d] = useState(false), is3d = view === '3d';
  if (is3d && !kept3d) setKept3d(true);
  // Its code loaded ahead (the lap view in 3D asks for it), the view draws at once; chosen once, as a switch would remount it.
  const [Race3D] = useState(() => loadedRace3DView?.default ?? Race3DView);
  const view3d = (is3d || kept3d) && (
    <div className="contents" hidden={!is3d}>
      <Suspense fallback={<div className="relative min-w-0 flex-1 bg-lmu-deep"><Replay3DLoading onRetry={() => {}} /></div>}>
        <Race3D className="min-w-0 flex-1" sessionId={sessionId} overview={overview} index={index} clock={clock} poses={poses} followSlot={followSlot} progress={progress}
          active={is3d} onToggleView={() => onViewChange('2d')} />
      </Suspense>
    </div>
  );

  return (
    <>
      <RaceReplayHeader onClose={onClose} metadata={metadata} overview={overview} clock={clock} followSlot={followSlot}
        onFollow={setFollowSlot} onOpenLap={onOpenLap} />
      <div className="flex min-h-0 flex-1">
        {view3d}
        {view === '2d' && (
          <RaceMapScene className="min-w-0 flex-1" sessionId={sessionId} overview={overview} index={index} clock={clock} poses={poses}
            followSlot={followSlot} hoverSlot={hoverSlot} trackRequest={trackRequest} onFollow={setFollowSlot} onHover={setHoverSlot}
            onToggleView={() => onViewChange('3d')} />
        )}
        <RaceStandingsTower className="w-[320px] shrink-0" index={index} clock={clock} followSlot={followSlot}
          onFollow={setFollowSlot} pittedAt={timeSec => racePitSlots(poses.windowAt(timeSec), timeSec)} onTrack={slot => { setFollowSlot(slot); setTrackRequest(n => n + 1); }} onHover={setHoverSlot} />
      </div>
      <RaceCarHud clock={clock} poses={poses} followSlot={followSlot} car={followSlot === null ? undefined : carsBySlot.get(followSlot)} />
      <RacePlaybackBar clock={clock} events={overview.events} cars={carsBySlot} followSlot={followSlot} laps={overview.laps} raceStartSec={raceStartSec} />
    </>
  );
};
