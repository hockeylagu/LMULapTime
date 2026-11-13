import { useMemo, useRef, useState } from 'react';
import type { RaceReplayCar, RaceReplayOverview, RaceReplayProgress } from '../../../../shared/types/index.js';
import { MapControlsOverlay } from '../map/MapControlsOverlay.js';
import { MapViewSwitchButton } from '../map/display/MapViewSwitchButton.js';
import { CameraModeControl, followsCar, useCameraModeShortcuts, type CameraMode } from '../view3d/camera/cameraModes.js';
import { Replay3DLoading, Replay3DStreaming } from '../view3d/scene/Replay3DLoading.js';
import { useRaceScene } from '../view3d/race/useRaceScene.js';
import { RaceLapTiming } from './RaceLapTiming.js';
import { RaceMinimap } from './RaceMinimap.js';
import { raceLapCount } from './raceLaps.js';
import type { RaceClock } from './raceClock.js';
import type { RacePoseCache } from './racePoseCache.js';

interface Props {
  overview: RaceReplayOverview;
  clock: RaceClock;
  poses: RacePoseCache;
  followSlot: number | null;
  progress: RaceReplayProgress | null;
  onToggleView: () => void;
  className?: string;
}

/** The race replay in 3D: the cameras ride on the followed car (its full model), the other cars are boxes in their class colour. */
export default function Race3DView({ overview, clock, poses, followSlot, progress, onToggleView, className = '' }: Props) {
  const map = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CameraMode>('chase'), [retry, setRetry] = useState(0);
  const { scene, state } = useRaceScene({ host, overview, clock, poses, followSlot, progress, mode, retry });
  const cars = useMemo(() => new Map<number, RaceReplayCar>(overview.cars.map(car => [car.slot, car])), [overview.cars]);
  const totalLaps = useMemo(() => raceLapCount(overview), [overview]);
  useCameraModeShortcuts(map, setMode);

  return (
    <div ref={map} tabIndex={0} data-replay-surface="map" data-replay-view="3d" aria-label="Race 3D view"
      className={`relative overflow-hidden bg-lmu-deep outline-none ${className}`}>
      <div ref={host} tabIndex={0} onPointerDown={event => event.currentTarget.focus({ preventScroll: true })}
        aria-label="3D track. Drag to orbit, scroll to zoom." className="relative h-full w-full outline-none" />
      {/* As the lap view's 3D page: the minimap top left, the camera controls top right with the timing under them. */}
      <RaceMinimap overview={overview} clock={clock} poses={poses} followSlot={followSlot} />
      <RaceLapTiming clock={clock} car={followSlot === null ? undefined : cars.get(followSlot)} laps={overview.laps}
        totalLaps={totalLaps} className="absolute right-3 top-14 z-10" />
      <MapControlsOverlay onZoomIn={() => scene.current?.zoom(1)} onZoomOut={() => scene.current?.zoom(-1)} onReset={() => scene.current?.reset()}
        followCar={followsCar(mode)} onToggleFollowCar={() => setMode(value => (followsCar(value) ? 'orbit' : 'chase'))}
        onCenterCar={() => scene.current?.center()} orientation="horizontal" className="top-2 right-3 bottom-auto">
        <CameraModeControl mode={mode} onChange={setMode} />
        <MapViewSwitchButton view="3d" onToggleView={onToggleView} />
      </MapControlsOverlay>
      {state?.ready && <Replay3DStreaming progress={state.progress} className="bottom-2" />}
      {!state?.ready && <Replay3DLoading progress={state?.progress} error={state?.error} onRetry={() => setRetry(value => value + 1)} />}
    </div>
  );
}
