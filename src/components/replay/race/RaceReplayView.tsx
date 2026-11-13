import React, { useEffect, useMemo, useState } from 'react';
import type { RaceReplayOverview, RaceReplayProgress, ReplayMetadata } from '../../../../shared/types/index.js';
import { fetchRaceOverview, fetchRacePoseWindow, fetchRaceProgress, fetchSessionTelemetryMetadata, lastSessionTelemetryMetadata } from '../../../api/replayApi.js';
import { racePitSlots } from '../../../../shared/domain/raceReplay/poseWindow.js';
import { isNonRaceSession } from '../../../../shared/domain/raceTraffic.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { createRaceClock } from './raceClock.js';
import { createRacePoseCache } from './racePoseCache.js';
import { indexRaceStandings } from './raceStandings.js';
import { RaceMapScene } from './RaceMapScene.js';
import { RaceStandingsTower } from './RaceStandingsTower.js';
import { RacePlaybackBar } from './RacePlaybackBar.js';
import { useRaceReplayKeys, useRaceUrlSync } from './useRaceReplayControls.js';
import { RaceReplayHeader } from './RaceReplayHeader.js';
import { initialRaceTime } from './raceLaps.js';

export interface RaceReplayViewProps {
  sessionId: string;
  /** Replay clock to open at; else the start of `initialLapNumber` of `initialSlot`, else the session start. */
  initialTimeSec?: number | null;
  initialSlot?: number | null;
  initialLapNumber?: number | null;
  onClose: () => void;
  /** Opens a session driver's lap in the lap view. */
  onOpenLap: (driverOrdinal: number, lapOrdinal: number) => void;
  /** The clock and followed car to keep in the URL (written while paused). */
  onStateChange: (timeSec: number, slot: number | null) => void;
}

/** The race mode of the replay inspector: every car of the session on one clock. */
export const RaceReplayView: React.FC<RaceReplayViewProps> = (props) => {
  const { sessionId, onClose } = props;
  const [state, setState] = useState<{ sessionId: string; overview?: RaceReplayOverview; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchRaceOverview(sessionId, { signal: controller.signal }).then(
      overview => setState({ sessionId, overview }),
      (error: unknown) => { if (!isAbortError(error)) setState({ sessionId, error: apiErrorMessage(error, 'The race replay could not load') }); },
    );
    return () => controller.abort();
  }, [sessionId, attempt]);
  const current = state?.sessionId === sessionId ? state : null;
  // The replay's metadata names the track, the conditions and each car's model in the header; the race shows without it.
  // The lap view already fetched it: reuse it so the header does not blank out on the switch.
  const [metadata, setMetadata] = useState<{ sessionId: string; value: ReplayMetadata } | null>(() => {
    const value = lastSessionTelemetryMetadata(sessionId);
    return value ? { sessionId, value } : null;
  });
  useEffect(() => {
    if (lastSessionTelemetryMetadata(sessionId)) return;
    const controller = new AbortController();
    fetchSessionTelemetryMetadata(sessionId, { signal: controller.signal }).then(value => setMetadata({ sessionId, value }), () => {});
    return () => controller.abort();
  }, [sessionId]);
  const replayMetadata = metadata?.sessionId === sessionId ? metadata.value : null;

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
            ) : <span role="status">Loading the race replay…</span>}
          </div>
        </>
      )}
    </div>
  );
};

const RaceReplayBody: React.FC<RaceReplayViewProps & { overview: RaceReplayOverview; metadata: ReplayMetadata | null }> = ({
  sessionId, overview, metadata, initialTimeSec, initialSlot, initialLapNumber, onClose, onOpenLap, onStateChange,
}) => {
  const [followSlot, setFollowSlot] = useState<number | null>(
    initialSlot ?? overview.cars.find(car => car.isPlayer)?.slot ?? null);
  // Made once (the body is keyed by replay): the URL's time only seeds the clock.
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [clock] = useState(() => createRaceClock(overview.startSec, overview.endSec,
    initialRaceTime(overview, initialTimeSec, initialSlot, initialLapNumber)));
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
    fetchRaceProgress(sessionId, { signal: controller.signal }).then(setProgress, () => {});
    return () => controller.abort();
  }, [sessionId, overview]);
  const index = useMemo(() => indexRaceStandings(overview, progress), [overview, progress]);
  const carsBySlot = useMemo(() => new Map(overview.cars.map(car => [car.slot, car])), [overview]);
  useRaceReplayKeys(clock);
  // Each double click in the standings puts the map on the followed car.
  const [trackRequest, setTrackRequest] = useState(0);
  useRaceUrlSync(clock, followSlot, onStateChange);

  return (
    <>
      <RaceReplayHeader onClose={onClose} metadata={metadata} overview={overview} clock={clock} followSlot={followSlot}
        onFollow={setFollowSlot} onOpenLap={onOpenLap} />
      <div className="flex min-h-0 flex-1">
        <RaceMapScene className="min-w-0 flex-1" overview={overview} index={index} clock={clock} poses={poses}
          followSlot={followSlot} hoverSlot={hoverSlot} trackRequest={trackRequest} onFollow={setFollowSlot} onHover={setHoverSlot} />
        <RaceStandingsTower className="w-[360px] shrink-0" index={index} clock={clock} followSlot={followSlot}
          onFollow={setFollowSlot} pittedAt={timeSec => racePitSlots(poses.windowAt(timeSec), timeSec)} onTrack={slot => { setFollowSlot(slot); setTrackRequest(n => n + 1); }} onHover={setHoverSlot} />
      </div>
      <RacePlaybackBar clock={clock} events={overview.events} cars={carsBySlot} followSlot={followSlot} laps={overview.laps} />
    </>
  );
};
