import { useMemo, useRef, useState } from 'react';
import type { RaceReplayCar, RaceReplayOverview, RaceReplayProgress } from '../../../../shared/types/index.js';
import type { CameraMode } from '../view3d/camera/cameraModes.js';
import { Scene3DFrame } from '../view3d/scene/Scene3DFrame.js';
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
  /** False while kept loaded behind the 2D map: the view is hidden and takes the focus again when shown. */
  active?: boolean;
}

/** The race replay in 3D: the cameras ride on the followed car (its full model), the other cars are boxes in their class colour. */
export default function Race3DView({ overview, clock, poses, followSlot, progress, onToggleView, className = '', active = true }: Props) {
  const map = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CameraMode>('chase'), [retry, setRetry] = useState(0);
  const { scene, state } = useRaceScene({ host, overview, clock, poses, followSlot, progress, mode, retry });
  const cars = useMemo(() => new Map<number, RaceReplayCar>(overview.cars.map(car => [car.slot, car])), [overview.cars]);
  const totalLaps = useMemo(() => raceLapCount(overview), [overview]);

  return (
    <Scene3DFrame surface={map} host={host} scene={scene} state={state} mode={mode} onModeChange={setMode} followMode="chase"
      onRetry={() => setRetry(value => value + 1)} onToggleView={onToggleView} active={active} ariaLabel="Race 3D view" hostLabel="3D track. Drag to orbit, scroll to zoom." className={className}>
      {/* As the lap view's 3D page: the minimap top left, the camera controls top right with the timing under them. */}
      <RaceMinimap overview={overview} clock={clock} poses={poses} followSlot={followSlot} />
      <RaceLapTiming clock={clock} car={followSlot === null ? undefined : cars.get(followSlot)} laps={overview.laps}
        totalLaps={totalLaps} className="absolute right-3 top-14 z-10" />
    </Scene3DFrame>
  );
}
