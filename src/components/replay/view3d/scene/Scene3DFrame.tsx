import { useEffect, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { MapViewSwitchButton } from '../../map/display/MapViewSwitchButton.js';
import { MapControlsOverlay } from '../../map/MapControlsOverlay.js';
import { CameraModeControl, carLockedCamera, followsCar, useCameraModeShortcuts, type CameraMode } from '../camera/cameraModes.js';
import { Replay3DLoading, Replay3DStreaming } from './Replay3DLoading.js';
import type { SceneHostState } from './useSceneHost.js';

/**
 * In a narrow scene (a container query on the scene area) the camera controls stand in a column down the right edge, as the 2D
 * map's do: their row (about 370 px from the right) would cover the minimap (about 190 px from the left).
 */
const NARROW_SCENE_CONTROLS = '@max-[600px]:flex-col @max-[600px]:gap-1 @max-[600px]:p-1';
/** A panel under the controls' row (the race timing) moves beside their column in a narrow scene. */
export const NARROW_SCENE_BESIDE_CONTROLS = '@max-[600px]:top-2 @max-[600px]:right-[58px]';

/** The camera moves the frame's buttons and shortcuts make on a scene (lap and race scenes both have them). */
interface CameraControls {
  zoom(direction: number): void;
  reset(): void;
  center(): void;
  pan?(horizontal: number, vertical: number): void;
}

/** Shared camera actions for `Scene3DFrame` and the lap/race keyboard shortcuts. */
export function cameraActions(
  scene: RefObject<CameraControls | null>,
  mode: CameraMode,
  onModeChange: Dispatch<SetStateAction<CameraMode>>,
  followMode: CameraMode,
) {
  return {
    onZoomIn: () => scene.current?.zoom(1),
    onZoomOut: () => scene.current?.zoom(-1),
    onReset: () => scene.current?.reset(),
    onCenter: () => scene.current?.center(),
    onPan: (horizontal: number, vertical: number) => {
      if (carLockedCamera(mode)) onModeChange('orbit');
      scene.current?.pan?.(horizontal, vertical);
    },
    onToggleFollow: () => onModeChange(value => (followsCar(value) ? 'orbit' : followMode)),
  };
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
  const actions = cameraActions(scene, mode, onModeChange, followMode);
  return (
    <div ref={surface} data-replay-surface="map" data-replay-view="3d" data-map-expanded={expanded ? '' : undefined} tabIndex={0} aria-label={ariaLabel}
      className={`relative flex flex-col overflow-hidden bg-lmu-deep outline-none ${className}`}>
      {top}
      <div className="@container relative flex-1 min-h-0 overflow-hidden">
        <div ref={host} tabIndex={0} onPointerDown={event => event.currentTarget.focus({preventScroll: true})}
          aria-label={hostLabel} className="relative w-full h-full outline-none" />
        {children}
        <MapControlsOverlay onZoomIn={actions.onZoomIn} onZoomOut={actions.onZoomOut} onReset={actions.onReset}
          followCar={followsCar(mode)} onToggleFollowCar={actions.onToggleFollow}
          onCenterCar={actions.onCenter} isPlaying={isPlaying} onTogglePlay={onTogglePlay}
          orientation="horizontal" className={`top-2 right-3 bottom-auto ${NARROW_SCENE_CONTROLS}`}>
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
