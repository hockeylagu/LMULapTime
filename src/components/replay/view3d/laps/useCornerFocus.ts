import { useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from 'react';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import type { CornerSegmentComparison } from '../../../../utils/cornerAnalysis/types.js';
import { findIndexAtDistance } from '../../../../utils/lapAlignment.js';
import { ReplayPlaybackCursorContext } from '../../inspector/replayPlaybackCursor.js';
import type { CameraMode } from '../camera/cameraModes.js';
import type { ReplaySceneHandle } from './replayScene.js';
import { cornerDrivingMarks } from './drivingMarks.js';

interface Options {
  scene: RefObject<ReplaySceneHandle | null>;
  /** The scene's state: a new one (the scene ready, or other laps shown) frames a pending corner. */
  sceneState: {ready?: boolean} | null | undefined;
  points: ReplayTrajectoryPoint[];
  primaryDists: number[];
  /** The corner picked in the inspector, null for none. */
  corner: CornerSegmentComparison | null;
  /** A comparison lap is shown: its driving marks show too. */
  compared: boolean;
  /** False while the 3D view is hidden behind the 2D map. */
  active: boolean;
  mode: CameraMode;
  setMode: (mode: CameraMode) => void;
  onSelectIndex: (index: number) => void;
}

/** A corner's samples on the primary lap that the focus repeats and frames: before the braking, the slowest point, the exit. */
export interface CornerStretch {
  start: number;
  apex: number;
  end: number;
}

/** How far before the brake point the focus starts, metres: the car is seen arriving. */
const BRAKING_LEAD_M = 30;

/**
 * The corner's stretch in lap distance. Its segment runs from the speed peak before it to the one after it, a whole straight
 * each side; the focus starts just before the brake point instead (at the entry for a corner taken flat) and ends as far past the
 * slowest point as it started before it, within the segment.
 */
export function cornerFocusRange(corner: CornerSegmentComparison): {startDistM: number; apexDistM: number; endDistM: number} {
  const braking = corner.primaryBrakingDistM;
  const startDistM = braking === null ? corner.entryDistM : Math.max(corner.entryDistM, Math.min(corner.minDistM, braking - BRAKING_LEAD_M));
  const endDistM = Math.min(corner.exitDistM, corner.minDistM + (corner.minDistM - startDistM));
  return {startDistM, apexDistM: corner.minDistM, endDistM};
}

/**
 * Corner focus: picking a corner while the 3D view shows puts the cursor at the start of its stretch (`cornerFocusRange`), and
 * playback repeats the stretch
 * (both laps: the ghost follows the primary car) until the loop is turned off. The camera stays as it is; `frame` asks for the
 * corner view, the free camera standing outside the turn with the whole corner in sight. Each lap's driving marks (brake point,
 * turn-in, slowest point, throttle on) lie on its line while the corner is focused.
 */
export function useCornerFocus({scene, sceneState, points, primaryDists, corner, compared, active, mode, setMode, onSelectIndex}: Options) {
  const cursor = useContext(ReplayPlaybackCursorContext);
  const [looping, setLooping] = useState(true);
  // Each ask for the corner view counts up; the view is placed once per ask, when the free camera and the scene are ready.
  const [frameAsks, setFrameAsks] = useState(0);
  const framed = useRef(0);
  const stretch = useMemo<CornerStretch | null>(() => {
    if (!corner || primaryDists.length < 2) return null;
    const {startDistM, apexDistM, endDistM} = cornerFocusRange(corner);
    return {start: findIndexAtDistance(primaryDists, startDistM), apex: findIndexAtDistance(primaryDists, apexDistM), end: findIndexAtDistance(primaryDists, endDistM)};
  }, [corner, primaryDists]);
  const focused = active && stretch !== null && stretch.end > stretch.start;

  // A corner picked (or the laps it is picked on changing) starts at its stretch's start.
  const enter = useEffectEvent(() => { if (stretch) onSelectIndex(stretch.start); });
  useEffect(() => { if (focused) enter(); }, [focused, stretch]);
  // The corner view is placed once the free camera is in place.
  const frame = () => {
    setFrameAsks(asks => asks + 1);
    setMode('orbit');
  };
  useEffect(() => {
    const handle = scene.current;
    if (framed.current === frameAsks || !focused || !stretch || mode !== 'orbit' || !sceneState?.ready || !handle) return;
    framed.current = frameAsks;
    handle.frameStretch(points, stretch.start, stretch.end, stretch.apex);
  }, [scene, sceneState, focused, stretch, mode, points, frameAsks]);

  const ready = sceneState?.ready === true;
  useEffect(() => {
    if (ready) scene.current?.showMarks(focused && corner ? cornerDrivingMarks(corner, compared) : null);
  }, [scene, ready, focused, corner, compared]);

  useEffect(() => {
    if (!cursor || !focused || !looping || !stretch) return;
    cursor.setLoop({points, start: stretch.start, end: stretch.end});
    return () => cursor.setLoop(null);
  }, [cursor, focused, looping, stretch, points]);

  return {focused, looping, toggleLoop: () => setLooping(value => !value), frame};
}
