import { Group, type Object3D, type Vector3 } from 'three';
import type { SceneryLayout } from '../../../../../shared/types/scenes/scenery.js';
import type { ChunkLoader } from './chunkLoader.js';

/**
 * The game's car reflection set (the pipeline's docs/SCENE_PACKAGE.md#reflection-set): the instances the game draws into its car
 * cube, in one chunk per scenery sector cut into route blocks, each block's opaque and blended geometry merged with each material's
 * mean colour per vertex and its cut-outs keeping their scenery material. The car's probe draws it in place of the scenery
 * (car/carReflection.ts): a probe face is then a few draws instead of one per scenery material. A reflection chunk loads with its
 * sector and shows while the sector does; `root` itself stays hidden outside the probe's faces.
 */
export interface ReflectionSet {
  /** Null when the layout has no reflection chunk: the probe then draws the scenery. */
  readonly root: Group | null;
  /** Loads the reflection chunk of a scenery chunk, if it has one. */
  load(id: string, signal: AbortSignal): Promise<Object3D | null>;
  /** A scenery chunk and its loaded reflection chunk: from now on the reflection shows while the scenery does. */
  join(scenery: Object3D, reflection: Object3D): void;
  /** Shows each joined reflection chunk as its scenery chunk shows. */
  sync(): void;
}

/** `origin` is the scene origin the scenery root is shifted by; the set's root is shifted alike. */
export function createReflectionSet(layout: SceneryLayout, loader: ChunkLoader, origin: Vector3): ReflectionSet {
  const chunks = new Map(layout.reflection.chunks.map(chunk => [chunk.id, chunk]));
  const root = chunks.size > 0 ? new Group() : null;
  if (root) { root.position.copy(origin).negate(); root.visible = false; }
  const pairs: Array<readonly [Object3D, Object3D]> = [];
  return {
    root,
    load(id, signal) {
      const chunk = chunks.get(id);
      return chunk ? loader.load(chunk, signal) : Promise.resolve(null);
    },
    join(scenery, reflection) {
      if (!root) return;
      reflection.visible = false;
      root.add(reflection);
      // The scene's matrices update only where it shows, and the set never shows in a frame: placed once, here.
      reflection.updateWorldMatrix(true, true);
      pairs.push([scenery, reflection]);
    },
    sync() {
      for (const [scenery, reflection] of pairs) reflection.visible = scenery.visible && scenery.parent !== null;
    },
  };
}
