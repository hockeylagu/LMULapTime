import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Flag } from 'lucide-react';
import type { RaceReplayOverview } from '../../../../shared/types/index.js';
import { fetchRaceOverview, fetchRacePoseWindow } from '../../../api/replayApi.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { createRaceClock, type RaceClock } from './raceClock.js';
import { createRacePoseCache } from './racePoseCache.js';
import { indexRaceStandings } from './raceStandings.js';
import { RaceMapScene } from './RaceMapScene.js';
import { RaceStandingsTower } from './RaceStandingsTower.js';
import { RacePlaybackBar } from './RacePlaybackBar.js';
import { useRaceReplayKeys, useRaceUrlSync } from './useRaceReplayControls.js';

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

  return (
    <div className="flex h-screen min-w-[1480px] flex-col bg-lmu-bg text-lmu-text">
      {current?.overview ? <RaceReplayBody key={current.overview.replayName} {...props} overview={current.overview} /> : (
        <>
          <RaceHeader onClose={onClose} />
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

/** Where the clock starts: the URL's time, else the start of the asked lap, else the session start. */
export function initialRaceTime(overview: RaceReplayOverview, timeSec?: number | null, slot?: number | null, lapNumber?: number | null): number {
  if (timeSec !== null && timeSec !== undefined && Number.isFinite(timeSec)) return timeSec;
  const lap = overview.laps.find(entry => entry.slot === slot && entry.lapNumber === lapNumber);
  return lap?.startSec ?? overview.startSec;
}

/** The session driver and lap the followed car is on at `timeSec`, for the lap view; null when it is not a session driver. */
export function lapAt(overview: RaceReplayOverview, slot: number | null, timeSec: number): { driverOrdinal: number; lapOrdinal: number; lapNumber: number } | null {
  const car = overview.cars.find(entry => entry.slot === slot);
  if (!car || car.sessionDriverOrdinal === undefined || !car.sessionLapOrdinals) return null;
  const laps = overview.laps.filter(lap => lap.slot === slot);
  const lap = laps.find(entry => entry.startSec <= timeSec && timeSec < entry.endSec)
    ?? [...laps].reverse().find(entry => entry.endSec <= timeSec) ?? laps[0];
  const lapOrdinal = lap ? car.sessionLapOrdinals[String(lap.lapNumber)] : undefined;
  return lap && lapOrdinal !== undefined ? { driverOrdinal: car.sessionDriverOrdinal, lapOrdinal, lapNumber: lap.lapNumber } : null;
}

const RaceReplayBody: React.FC<RaceReplayViewProps & { overview: RaceReplayOverview }> = ({
  sessionId, overview, initialTimeSec, initialSlot, initialLapNumber, onClose, onOpenLap, onStateChange,
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
  const index = useMemo(() => indexRaceStandings(overview), [overview]);
  const carsBySlot = useMemo(() => new Map(overview.cars.map(car => [car.slot, car])), [overview]);
  useRaceReplayKeys(clock);
  useRaceUrlSync(clock, followSlot, onStateChange);

  return (
    <>
      <RaceHeader onClose={onClose} overview={overview} clock={clock} followSlot={followSlot} onOpenLap={onOpenLap} />
      <div className="flex min-h-0 flex-1">
        <RaceMapScene className="min-w-0 flex-1" overview={overview} index={index} clock={clock} poses={poses}
          followSlot={followSlot} hoverSlot={hoverSlot} onFollow={setFollowSlot} onHover={setHoverSlot} />
        <RaceStandingsTower className="w-[360px] shrink-0" index={index} clock={clock} followSlot={followSlot}
          onFollow={setFollowSlot} onHover={setHoverSlot} />
      </div>
      <RacePlaybackBar clock={clock} events={overview.events} cars={carsBySlot} followSlot={followSlot} />
    </>
  );
};

const RaceHeader: React.FC<{
  onClose: () => void;
  overview?: RaceReplayOverview;
  clock?: RaceClock;
  followSlot?: number | null;
  onOpenLap?: (driverOrdinal: number, lapOrdinal: number) => void;
}> = ({ onClose, overview, clock, followSlot = null, onOpenLap }) => {
  const followed = overview?.cars.find(car => car.slot === followSlot);
  const openLap = () => {
    if (!overview || !clock || !onOpenLap) return;
    const lap = lapAt(overview, followSlot, clock.getState().timeSec);
    if (lap) onOpenLap(lap.driverOrdinal, lap.lapOrdinal);
  };
  const canOpenLap = Boolean(followed?.sessionDriverOrdinal !== undefined && followed?.sessionLapOrdinals);
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-lmu-border bg-lmu-strip px-4">
      <button type="button" onClick={onClose} aria-label="Back" title="Back"
        className={`grid h-8 w-8 place-items-center rounded-md text-lmu-text-soft hover:bg-lmu-card ${FOCUS_RING}`}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <div className="min-w-0">
        <h1 className="text-sm font-semibold">Race replay</h1>
        <p className="truncate text-xs text-lmu-muted">
          {[overview?.trackVenue, overview?.trackCourse, overview?.sessionType].filter(Boolean).join(' · ')}
          {overview ? ` · ${overview.cars.length} cars` : ''}
        </p>
      </div>
      {overview && (
        <button type="button" onClick={openLap} disabled={!canOpenLap}
          title={canOpenLap ? `Open ${followed!.name}'s lap at this time in the lap view` : 'Select a car of this session to open its lap'}
          className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-lmu-border bg-lmu-bg px-3 text-xs text-lmu-text-soft hover:bg-lmu-card disabled:opacity-40 ${FOCUS_RING}`}>
          <Flag aria-hidden="true" className="h-3.5 w-3.5 text-lmu-accent-text" />Lap view
        </button>
      )}
    </header>
  );
};
