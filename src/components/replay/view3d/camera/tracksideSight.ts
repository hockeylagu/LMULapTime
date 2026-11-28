import { PerspectiveCamera, Vector3 } from 'three';
import type { RaySpan } from '../scene/pointerSurface.js';
import type { TracksideSpots } from './tracksideCameras.js';

/**
 * Keeps the trackside camera's view of the car clear of trees, buildings and banks (driver, 2026-11-28). The scenery's ray trees
 * hold the ground only, so the check asks what the frame actually draws: one pixel drawn from a camera place towards the car
 * (`PointerSurface.within`, cut-out leaves and fences as drawn). Ahead of the car, each spot's places are tried in their order of
 * preference over the stretch it covers, and the first that sees the car all along is used; the one that sees it most where none
 * does. While a spot shows, the view itself is checked: a car hidden at two checks in a row cuts to the spot's next place.
 */

/** Asks whether an opaque surface lies on `span` along the centre pixel of `view`: the span's index, −1 for none. */
export type SightQuery = (view: PerspectiveCamera, spans: readonly RaySpan[]) => Promise<number>;

/** What the checker reads and sets on the rig (`CameraRig.trackside`). */
export interface TracksideState {
  readonly spots: TracksideSpots;
  /** The spot showing now; −1 for none. */
  readonly spot: number;
  /** The place shown at a spot (`TracksideSpots.candidates`). */
  placeOf(spot: number): number;
  choose(spot: number, place: number): void;
}

/** Metres of the sight line left out at the car's end (the car's own body) and at the eye's (a lamp post at the camera). */
const CAR_CLEARANCE_M = 3, EYE_CLEARANCE_M = 1;
/** The live check's interval, ms: a car hidden this long twice over cuts to another place. */
const LIVE_CHECK_MS = 150;

export function createTracksideSight(query: SightQuery) {
  const view = new PerspectiveCamera(50, 1, 0.5, 20000);
  let spots: TracksideSpots | null = null, assessed = new Set<number>(), busy = false, lastLive = 0, hiddenStreak = 0;
  /** Live checks that found each spot's places hidden, so a cut never goes back to one. */
  let blocked = new Map<number, Set<number>>();
  const direction = new Vector3();

  /** Whether the car at `target` is hidden from `eye`. The query reads the shared `view` as it is called, so checks may overlap. */
  const hidden = async (eye: Vector3, target: Vector3) => {
    const length = eye.distanceTo(target);
    if (length <= CAR_CLEARANCE_M + EYE_CLEARANCE_M) return false;
    view.position.copy(eye); view.lookAt(target); view.updateMatrixWorld(); view.updateProjectionMatrix();
    direction.subVectors(target, eye).divideScalar(length);
    const span: RaySpan = [eye.clone().addScaledVector(direction, EYE_CLEARANCE_M), target.clone().addScaledVector(direction, -CAR_CLEARANCE_M)];
    return (await query(view, [span])) === 0;
  };

  /** The spot whose places are being tried, one place per frame: the first clear all along its stretch wins, else the one hidden least. */
  let trying: {spot: number; place: number; best: number; fewest: number} | null = null;
  const tryPlace = async (state: TracksideState, at: NonNullable<typeof trying>) => {
    const eye = state.spots.candidates(at.spot)[at.place];
    const hides = await Promise.all(state.spots.stretch(at.spot).map(target => hidden(eye, target)));
    const count = hides.filter(Boolean).length;
    if (count < at.fewest) { at.best = at.place; at.fewest = count; }
    at.place++;
    if (count > 0 && at.place < state.spots.candidates(at.spot).length) return;
    trying = null;
    if (state.spots === spots) state.choose(at.spot, at.best);
  };

  return {
    /** After a frame: one check at a time (a place per frame), the shown and coming spots first, then the shown view. `camera` and `focus` are the frame's. */
    update(state: TracksideState | null, camera: PerspectiveCamera, focus: Vector3, now: number): void {
      if (busy || !state || state.spot < 0) return;
      if (state.spots !== spots) { spots = state.spots; assessed = new Set(); blocked = new Map(); hiddenStreak = 0; trying = null; }
      const done = () => { busy = false; };
      const next = [state.spot, state.spot + 1].find(spot => spot < state.spots.count && !assessed.has(spot));
      if (!trying && next !== undefined) { assessed.add(next); trying = {spot: next, place: 0, best: 0, fewest: Infinity}; }
      if (trying) {
        busy = true;
        tryPlace(state, trying).then(done, done);
        return;
      }
      if (now - lastLive < LIVE_CHECK_MS) return;
      busy = true; lastLive = now;
      const spot = state.spot, eye = camera.position.clone(), target = focus.clone();
      hidden(eye, target).then(isHidden => {
        hiddenStreak = isHidden ? hiddenStreak + 1 : 0;
        if (hiddenStreak < 2 || state.spots !== spots || state.spot !== spot) return;
        hiddenStreak = 0;
        const places = state.spots.candidates(spot).length, shown = state.placeOf(spot);
        const tried = blocked.get(spot) ?? new Set<number>(); tried.add(shown); blocked.set(spot, tried);
        const free = Array.from({length: places}, (_, k) => (shown + 1 + k) % places).find(place => !tried.has(place));
        if (free !== undefined) state.choose(spot, free);
      }).then(done, done);
    },
  };
}
