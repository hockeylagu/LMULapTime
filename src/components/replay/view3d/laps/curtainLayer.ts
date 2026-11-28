import { BufferGeometry, Float32BufferAttribute, Group, MathUtils, Mesh, Vector3, type OrthographicCamera, type PerspectiveCamera, type ShaderMaterial } from 'three';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import type { DisplayTransform } from '../autoExposure.js';
import { LMU_COLORS } from '../../../../utils/themeColors.js';
import type { CameraMode } from '../camera/cameraModes.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import { setCurtainHeight } from './curtainHeight.js';
import { colorRacingLine, makeDataMesh, syncRacingLine } from './racingLine.js';
import {
  CURTAIN_HEIGHT_M, CURTAIN_ORDER, CURTAIN_STEPS_M, curtainColourAt, curtainStep, curtainTopM, fadeTraceCurtain, makeTraceCurtain, metresPerPixel, refreshTraceCurtain, syncTraceCurtain,
  viewTraceCurtain,
  type CurtainValues,
} from './traceCurtain.js';

/** Both laps' curtain values for one channel; the baseline is absent without a comparison lap. */
export interface LapCurtains {
  primary: CurtainValues;
  baseline: CurtainValues | null;
}

/** A car's place on its lap: the sample and the share of the way to the next. */
export interface CursorAt { index: number; fraction: number }

/**
 * The cursor line's half width in pixels however far it is (as the curtain's edges): a standing and a lying band, one unit tall,
 * scaled to the curtain's height at the sample.
 */
const CURSOR_HALF_PX = 1;

/** A sample on one of the laps: where the pointer is over a curtain (`TracePick`). */
export interface CurtainHover { lap: 'primary' | 'baseline'; index: number }

/** The hover line: light grey and half see-through, so it never reads as a car's line (driver, 2026-11-28). */
const HOVER_COLOUR = LMU_COLORS.text, HOVER_OPACITY = 0.5;
/**
 * The hover line's bar lying across the lap at its foot (pixels): its standing bands are edge-on from straight above, so the overhead
 * view shows the bar (driver, 2026-11-28). Half its length and half its width.
 */
const ACROSS_HALF_PX = 12, ACROSS_HALF_WIDTH_PX = 2;

/** The colour each cursor line was last painted (it changes as the car crosses samples). */
const cursorColours = new WeakMap<Mesh, string>();

/**
 * A unit-tall cursor line in one colour, its width in pixels (scaled to the metres a pixel covers where it stands), as a data mesh (exposure divided out, colours baked like the lines); `across` adds a bar lying
 * along its local x at its foot (turned across the lap where it stands).
 */
function cursorLine(colour: string, display: () => DisplayTransform, across = false): Mesh<BufferGeometry, ShaderMaterial> {
  const h = CURSOR_HALF_PX, l = ACROSS_HALF_PX, w = ACROSS_HALF_WIDTH_PX, geometry = new BufferGeometry();
  const positions = [-h, 0, 0, h, 0, 0, -h, 1, 0, h, 1, 0, 0, 0, -h, 0, 0, h, 0, 1, -h, 0, 1, h], indices = [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6];
  if (across) { positions.push(-l, 0, -w, -l, 0, w, l, 0, -w, l, 0, w); indices.push(8, 9, 10, 9, 11, 10); }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  const mesh = makeDataMesh(geometry, new Array<string>(positions.length / 6).fill(colour), display, CURTAIN_ORDER.primary + 0.05, 'standing');
  mesh.name = 'curtain-cursor'; mesh.visible = false; mesh.frustumCulled = false;
  return mesh;
}

/**
 * The lap view's trace curtains (traceCurtain.ts): one per lap in place of its racing line, with a cursor line at each car's sample
 * and a hover line where the pointer is.
 * `show(null)` takes them away; the caller shows the ribbons again.
 */
export function createCurtainLayer(
  root: Group, origin: Vector3, surfaceHeight: SurfaceHeight, display: () => DisplayTransform,
  lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null,
) {
  // In the lap's root only while a trace shows.
  const group = new Group(); group.name = 'trace-curtains';
  let primary: Mesh<BufferGeometry, ShaderMaterial> | null = null, compared: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  let primaryCursor: Mesh<BufferGeometry, ShaderMaterial> | null = null, comparedCursor: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  let hoverLine: Mesh<BufferGeometry, ShaderMaterial> | null = null, hovered: CurtainHover | null = null;
  let opacities = [1, 1], viewer: PerspectiveCamera | OrthographicCamera | null = null, step = 0;
  const meshes = () => [primary, compared, primaryCursor, comparedCursor, hoverLine].filter((mesh): mesh is Mesh<BufferGeometry, ShaderMaterial> => mesh !== null);
  const clear = () => {
    for (const mesh of meshes()) { mesh.removeFromParent(); disposeObjects(mesh); }
    primary = compared = primaryCursor = comparedCursor = hoverLine = null;
    group.removeFromParent();
  };
  const applyOpacity = () => {
    const pairs: Array<[Mesh<BufferGeometry, ShaderMaterial> | null, number]> = [[primary, opacities[0]], [primaryCursor, opacities[0]], [compared, opacities[1]], [comparedCursor, opacities[1]]];
    for (const [mesh, opacity] of pairs) {
      if (!mesh) continue;
      mesh.material.opacity = opacity;
      if (opacity <= 0) mesh.visible = false;
      else if (mesh === primary || mesh === compared) mesh.visible = true;
    }
  };
  const along = new Vector3();
  /**
   * At the car's place between two samples, as the car is placed (`sampleRenderPose`), so the line keeps up with it; a car's line in
   * the trace's colour there (`paint`).
   */
  const placeCursor = (cursor: Mesh<BufferGeometry, ShaderMaterial> | null, curtain: Mesh | null, points: ReplayTrajectoryData['points'], at: CursorAt | null, paint = true) => {
    if (!cursor || !curtain) return;
    const a = at ? points[at.index] : undefined, b = at ? points[at.index + 1] ?? a : undefined;
    const t = b === a ? 0 : at?.fraction ?? 0, next = (at?.index ?? 0) + (b === a ? 0 : 1);
    const height = a && at ? MathUtils.lerp(curtainTopM(curtain, at.index), curtainTopM(curtain, next), t) : 0;
    cursor.visible = curtain.visible && height > 0.05;
    if (!cursor.visible || !a || !b || !at) return;
    along.set(MathUtils.lerp(a.x, b.x, t), MathUtils.lerp(a.y, b.y, t), MathUtils.lerp(a.z, b.z, t));
    const foot = surfaceHeight(along) ?? along.y;
    cursor.position.set(along.x - origin.x, foot - origin.y, along.z - origin.z);
    const width = viewer && cursor.parent ? metresPerPixel(viewer, cursor.parent.localToWorld(along.copy(cursor.position))) : 0;
    cursor.scale.set(width, height, width);
    // Its local x across the lap (the hover line's lying bar).
    const from = b === a ? points[at.index - 1] ?? a : a, to = b === a ? a : b;
    cursor.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    if (!paint) return;
    // The trace's colour where the car is: the pressed pedal's, the balance's sign, the channel's (`curtainColourAt`).
    const colour = curtainColourAt(curtain, t < 0.5 ? at.index : next);
    if (cursorColours.get(cursor) !== colour) { cursorColours.set(cursor, colour); colorRacingLine(cursor, [colour, colour, colour, colour]); }
  };
  const placeHover = () => {
    const onBaseline = hovered?.lap === 'baseline';
    placeCursor(hoverLine, onBaseline ? compared : primary, onBaseline ? baseline?.points ?? [] : lap.points, hovered && {index: hovered.index, fraction: 0}, false);
    if (hoverLine) hoverLine.material.opacity = HOVER_OPACITY * opacities[onBaseline ? 1 : 0];
  };
  return {
    get shown() { return primary !== null; },
    /** Shows one channel's curtains (values from `curtainValues`), replacing any shown; null takes them away. */
    show(values: LapCurtains | null) {
      clear();
      if (!values) return;
      root.add(group);
      primary = makeTraceCurtain(lap, origin, values.primary, surfaceHeight, display, CURTAIN_ORDER.primary);
      primaryCursor = cursorLine(values.primary.fillColours[0] ?? values.primary.edgeColours[0], display);
      group.add(primary, primaryCursor);
      if (baseline && values.baseline) {
        compared = makeTraceCurtain(baseline, origin, values.baseline, surfaceHeight, display, CURTAIN_ORDER.baseline);
        comparedCursor = cursorLine(values.baseline.fillColours[0] ?? values.baseline.edgeColours[0], display);
        group.add(compared, comparedCursor);
      }
      hoverLine = cursorLine(HOVER_COLOUR, display, true); hoverLine.name = 'curtain-hover';
      group.add(hoverLine);
      applyOpacity(); placeHover();
    },
    /** The Line menu's fades apply to the curtains standing in for the lines (0 hides one). */
    fade(primaryOpacity: number, baselineOpacity: number) { opacities = [primaryOpacity, baselineOpacity]; applyOpacity(); },
    /**
     * Each frame: the camera-distance fade for the camera mode, the curtains' height step for the camera's distance to the lap
     * where it looks (`lapInView`, `curtainStep`, named in the legend), and the camera drawing.
     */
    camera(mode: CameraMode, drawing: PerspectiveCamera | OrthographicCamera, lapInView: () => number) {
      viewer = drawing;
      step = curtainStep(mode, drawing, lapInView, step);
      setCurtainHeight(CURTAIN_STEPS_M[step]);
      const scale = CURTAIN_STEPS_M[step] / CURTAIN_HEIGHT_M;
      for (const mesh of [primary, compared]) if (mesh) { fadeTraceCurtain(mesh, mode); viewTraceCurtain(mesh, scale); }
    },
    /** The cursor lines at the lap's and the ghost's samples (null: that car is not shown). */
    cursor(primaryAt: CursorAt | null, baselineAt: CursorAt | null) {
      placeCursor(primaryCursor, primary, lap.points, primaryAt);
      if (baseline) placeCursor(comparedCursor, compared, baseline.points, baselineAt);
      placeHover();
    },
    /** The hover line at the sample under the pointer (null: none); it follows the curtain's height each frame (`cursor`). */
    hover(at: CurtainHover | null) { hovered = at; placeHover(); },
    /** The camera type changed: re-bake the colours. */
    sync() {
      for (const mesh of [primary, compared]) if (mesh) syncTraceCurtain(mesh);
      for (const mesh of [primaryCursor, comparedCursor, hoverLine]) if (mesh) syncRacingLine(mesh);
    },
    /** Scenery streamed in: re-drape on the road now resident. */
    refresh() { for (const mesh of [primary, compared]) if (mesh) refreshTraceCurtain(mesh, surfaceHeight); },
    /** The curtain meshes to pick (lap first). */
    pickable() { return {primary, baseline: compared}; },
    dispose() { clear(); },
  };
}

export type CurtainLayer = ReturnType<typeof createCurtainLayer>;
