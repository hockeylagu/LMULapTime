import { createContext, useContext, useEffect, useState } from 'react';
import type { SceneryLayoutResource } from '../../../../../shared/types/scenes/scenery.js';
import { createSceneShell, type SceneShell, type SceneShellOptions } from './sceneShell.js';

/**
 * The scene shell the lap and race views share on a circuit: one renderer and WebGL context, its scenery, textures, shadows and car
 * templates loaded once. A view takes it (`acquire`), attaches its element and shows its content; leaving, it detaches and drops its
 * content, and the next view on the same layout carries on with the same shell.
 */
export interface SceneShells {
  /** The shell for `layout`: the current one when it is of that layout and not broken, else a new one (the old one disposed). */
  acquire(layout: SceneryLayoutResource, options: SceneShellOptions): SceneShell;
  /** Disposes `shell` if it never started (its first view failed or left while it loaded): the next view starts a new one. */
  discardUnstarted(shell: SceneShell): void;
  dispose(): void;
}

const layoutKey = (layout: SceneryLayoutResource) => `${layout.layoutKey}:${layout.sourceGeometryRevision}:${layout.packageRevision}`;

export function createSceneShells(): SceneShells {
  let current: {key: string; shell: SceneShell} | null = null;
  const drop = () => { current?.shell.dispose(); current = null; };
  return {
    acquire(layout, options) {
      const key = layoutKey(layout);
      if (current?.key === key && !current.shell.broken) return current.shell;
      drop();
      current = {key, shell: createSceneShell(layout, options)};
      return current.shell;
    },
    discardUnstarted(shell) { if (current?.shell === shell && !shell.started) drop(); },
    dispose: drop,
  };
}

/** The page's shared shells (the replay inspector provides them for its lap and race views). */
export const SceneShellsContext = createContext<SceneShells | null>(null);

/** The shells the page shares, or this view's own (one view without the page: its shell lives and dies with it). */
export function useSceneShells(): SceneShells {
  const shared = useContext(SceneShellsContext);
  const [own] = useState(() => (shared ? null : createSceneShells()));
  useEffect(() => () => own?.dispose(), [own]);
  return shared ?? own!;
}

/** The page's shells, disposed when it unmounts: a view's own `SceneShellsContext` value. */
export function useSharedSceneShells(): SceneShells {
  const [shells] = useState(createSceneShells);
  useEffect(() => () => shells.dispose(), [shells]);
  return shells;
}
