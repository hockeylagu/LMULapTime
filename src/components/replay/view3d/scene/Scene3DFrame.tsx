import { useEffect, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { MapViewSwitchButton } from '../../map/display/MapViewSwitchButton.js';
import { MapControlsOverlay } from '../../map/MapControlsOverlay.js';
import { CameraModeControl, followsCar, useCameraModeShortcuts, type CameraMode } from '../camera/cameraModes.js';
import { Replay3DLoading, Replay3DStreaming } from './Replay3DLoading.js';

/**
 * The minimap's place in a narrow scene (a container query on the scene area): under the camera controls, which would cover it
 * there (their bar spans about 370 px from the right, the minimap about 190 px from the left).
 */
export const NARROW_SCENE_MINIMAP = '@max-[600px]:top-[58px]';
import type { SceneHostState } from './useSceneHost.js';

/** The camera moves the frame's buttons make on a scene (lap and race scenes both have them). */
interface CameraControls {
  zoom(direction: number): void;
  reset(): void;
  center(): void;
}

interface Props {
  /** The focusable surface the keys act on; the view shares it with its own shortcuts. */
  surface: RefObject<HTMLDivElement | null>;
  /** The element the scene draws into (the one `useSceneHost` was given). */
  host: RefObject<HTMLDivElement | null>;
  scene: RefObject<CameraControls | null>;
  state: SceneHostState | null;
  mode: CameraMode;
  onModeChange: Dispatch<SetStateAction<CameraMode>>;
  /** The mode the follow button switches to from orbit. */
  followMode: CameraMode;
  onRetry: () => void;
  onToggleView: () => void;
  /** False while the view is kept loaded behind the 2D map: it takes the focus again when shown. */
  active?: boolean;
  expanded?: boolean;
  className?: string;
  ariaLabel?: string;
  /** The 3D track's own label: how its keys and pointer move the camera and the replay. */
  hostLabel?: string;
  /** Above the scene (the lap view's toolbar). */
  top?: ReactNode;
  /** Over the scene, under the controls (minimap, timing). */
  children?: ReactNode;
  /** Over the scene, above the controls (legends, expanded panels). */
  overlays?: ReactNode;
  /** After the camera mode control, before the view switch (help). */
  controlsBefore?: ReactNode;
  /** After the view switch (fullscreen). */
  controlsAfter?: ReactNode;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  /** Below the scene (telemetry). */
  bottom?: ReactNode;
  streamingClassName?: string;
}

/** The 3D view's frame, for lap and race: the host the scene draws into, the camera controls, and the loading and streaming cards; each view's own panels go in the slots. */
export function Scene3DFrame({
  surface, host, scene, state, mode, onModeChange, followMode, onRetry, onToggleView, active = true, expanded, className = '', ariaLabel,
  hostLabel = '3D track. Drag to orbit, scroll to zoom. Left/Right: step replay. WASD: pan camera.',
  top, children, overlays, controlsBefore, controlsAfter, isPlaying, onTogglePlay, bottom, streamingClassName = 'bottom-2',
}: Props) {
  useCameraModeShortcuts(surface, onModeChange);
  useEffect(() => { if (active) surface.current?.focus({preventScroll: true}); }, [active, surface]);
  return (
    <div ref={surface} data-replay-surface="map" data-replay-view="3d" data-map-expanded={expanded ? '' : undefined} tabIndex={0} aria-label={ariaLabel}
      className={`relative flex flex-col overflow-hidden bg-lmu-deep outline-none ${className}`}>
      {top}
      <div className="@container relative flex-1 min-h-0 overflow-hidden">
        <div ref={host} tabIndex={0} onPointerDown={event => event.currentTarget.focus({preventScroll: true})}
          aria-label={hostLabel} className="relative w-full h-full outline-none" />
        {children}
        <MapControlsOverlay onZoomIn={() => scene.current?.zoom(1)} onZoomOut={() => scene.current?.zoom(-1)} onReset={() => scene.current?.reset()}
          followCar={followsCar(mode)} onToggleFollowCar={() => onModeChange(value => (followsCar(value) ? 'orbit' : followMode))}
          onCenterCar={() => scene.current?.center()} isPlaying={isPlaying} onTogglePlay={onTogglePlay}
          orientation="horizontal" className="top-2 right-3 bottom-auto">
          <CameraModeControl mode={mode} onChange={onModeChange} />
          {controlsBefore}
          <MapViewSwitchButton view="3d" onToggleView={onToggleView} />
          {controlsAfter}
        </MapControlsOverlay>
        {overlays}
        {state?.ready && <Replay3DStreaming progress={state.progress} className={streamingClassName} />}
        {!state?.ready && <Replay3DLoading progress={state?.progress} error={state?.error} onRetry={onRetry} />}
      </div>
      {bottom}
    </div>
  );
}
