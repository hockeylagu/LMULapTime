/**
 * The scenery the game switches between day and night (docs/SCENE_PACKAGE.md "Visibility"): a chunk node with `extras.lmuVisibility`
 * draws only in its state. `day` and `night` are the two states of a day/night pair (the ambient's night switch); `lightsOn` is the
 * track lights' glow card, drawn while the track lights are on (nightLight.ts `trackLightsOn`). A node without the extra always draws.
 * Switched nodes keep their own draws (sceneryBatches.ts leaves them out of the shared batches), so switching is a visibility flag.
 */
import { Mesh, type Object3D } from 'three';

export type SceneVisibility = 'day' | 'night' | 'lightsOn';

/** The scene's switches: night by the ambient's night level, the track lights by the light level against the scene's threshold. */
export interface NightState {night: boolean; lightsOn: boolean}

/** The day: what the scene draws until a night state is set. */
export const DAY_STATE: NightState = Object.freeze({night: false, lightsOn: false});

/** A scenery mesh's switched state (the extra sits on the mesh, or for a node of several primitives on its group). */
export function sceneVisibility(object: Object3D): SceneVisibility | undefined {
  const value: unknown = object.userData.lmuVisibility ?? object.parent?.userData.lmuVisibility;
  return value === 'day' || value === 'night' || value === 'lightsOn' ? value : undefined;
}

/** Whether a switched node draws in a state. */
export function drawnIn(visibility: SceneVisibility, state: NightState): boolean {
  switch (visibility) {
    case 'day': return !state.night;
    case 'night': return state.night;
    case 'lightsOn': return state.lightsOn;
  }
}

export interface NightSwitch {
  /** Takes a chunk's switched meshes and draws them for the current state. Before the chunk is shown. */
  add(root: Object3D): void;
  /** Draws every switched mesh for a new state. Cheap when it did not change. */
  set(state: NightState): void;
  readonly state: NightState;
}

export function createNightSwitch(initial: NightState = DAY_STATE): NightSwitch {
  const switched: {mesh: Object3D; visibility: SceneVisibility}[] = [];
  let state = initial;
  return {
    add(root) {
      root.traverse(object => {
        const visibility = sceneVisibility(object);
        if (!(object instanceof Mesh) || !visibility) return;
        switched.push({mesh: object, visibility});
        object.visible = drawnIn(visibility, state);
      });
    },
    set(next) {
      if (next.night === state.night && next.lightsOn === state.lightsOn) return;
      state = {...next};
      for (const {mesh, visibility} of switched) mesh.visible = drawnIn(visibility, state);
    },
    get state() { return state; },
  };
}
