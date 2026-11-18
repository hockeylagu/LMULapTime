import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import type { SceneLoadProgress } from './loadProgress.js';
import type { SceneShellListener } from './sceneShell.js';

/**
 * What the host reports for a scene key; a view adds its own fields (the lap view's car and wheel sources). `shown`: the other view's
 * scene already shows in the host while this one builds (`showEarly`), so no loading card covers it.
 */
export type SceneHostState<Extra extends object = Record<never, never>> = {key: string; error?: string; ready?: boolean; shown?: boolean; progress?: SceneLoadProgress} & Extra;

/** The parts of a scene handle the host needs. */
interface Disposable { dispose(): void }

/** What `create` is given for one scene (one key, one container). */
export interface SceneCreateContext {
  container: HTMLDivElement;
  signal: AbortSignal;
  /** False once the scene was replaced or unmounted: late results are dropped. */
  isActive: () => boolean;
  /** Reports the load's steps; merged into the state unless the load already failed. */
  showProgress: (progress: SceneLoadProgress) => void;
  /** Reports an error (also the scene's own, after the load). */
  fail: (message: string) => void;
  /** Runs when this scene is replaced or unmounted (for what lives and dies with it). */
  onDispose: (cleanup: () => void) => void;
}

interface Options<Handle extends Disposable> {
  host: RefObject<HTMLDivElement | null>;
  /** Names the scene; a new key disposes the old scene and builds another (layout, revision, retry). */
  key: string;
  /** False holds the build back (the race scene waits for its first pose window). */
  enabled?: boolean;
  /** The message for a failure that has none of its own. */
  errorMessage: string;
  /** Validates, fetches and builds the scene. Throwing (or an abort) fails the load. */
  create: (context: SceneCreateContext) => Promise<Handle>;
  /** Setup for the built scene, after it is current (the camera mode, drawing the first frame). */
  onCreated: (handle: Handle, context: SceneCreateContext) => void;
  /**
   * Puts a scene that already shows this circuit (the other view's, kept by the page) in the host at once, reporting to `listener`;
   * false when there is none. Runs on mount and each key, before the build is enabled.
   */
  showEarly?: (container: HTMLDivElement, listener: SceneShellListener) => boolean;
}

/**
 * The lifecycle every 3D view shares: one scene per key in the host element, an abort signal for its loads, progress and error
 * state, and disposal on a new key or unmount. What the scene shows (lap or race) is the caller's `create` and its own effects.
 * `ready` holds the scene being built for the current key, for effects that wait on it.
 */
export function useSceneHost<Handle extends Disposable, Extra extends object = Record<never, never>>(
  {host, key, enabled = true, errorMessage, create, onCreated, showEarly}: Options<Handle>,
) {
  const scene = useRef<Handle | null>(null);
  const ready = useRef<{key: string; scene: Promise<Handle>} | null>(null);
  const [result, setResult] = useState<SceneHostState<Extra> | null>(null);
  const build = useEffectEvent(create), setup = useEffectEvent(onCreated), early = useEffectEvent((container: HTMLDivElement, listener: SceneShellListener) => showEarly?.(container, listener) ?? false);
  // Before the first paint: the loading card the first render holds never shows over a scene already there.
  useLayoutEffect(() => {
    const container = host.current;
    if (!container) return;
    let active = true;
    const shown = early(container, {
      onFailure: message => { if (active) setResult({key, error: message} as SceneHostState<Extra>); },
      onProgress: progress => { if (active) setResult(current => current?.error ? current : {...(current?.key === key ? current : {key}), progress} as SceneHostState<Extra>); },
    });
    // oxlint-disable-next-line react/set-state-in-effect -- reports what the attach to the shell (outside React) did, once per key
    if (shown) setResult(current => ({...(current?.key === key ? current : {key}), shown: true}) as SceneHostState<Extra>);
    return () => { active = false; };
  }, [key, host]);
  useEffect(() => {
    const container = host.current;
    if (!container || !enabled) return;
    const abort = new AbortController(), cleanups: Array<() => void> = [];
    let active = true, created: Handle | null = null;
    const fail = (message: string) => { if (active) setResult({key, error: message} as SceneHostState<Extra>); };
    const showProgress = (progress: SceneLoadProgress) => {
      if (active) setResult(current => current?.error ? current : {...(current?.key === key ? current : {key}), progress} as SceneHostState<Extra>);
    };
    const context: SceneCreateContext = {container, signal: abort.signal, isActive: () => active, showProgress, fail, onDispose: cleanup => { cleanups.push(cleanup); }};
    const built = build(context).then(handle => {
      if (!active) { handle.dispose(); abort.signal.throwIfAborted(); }
      created = handle; scene.current = handle; setup(handle, context);
      return handle;
    });
    ready.current = {key, scene: built};
    built.catch((error: unknown) => { if (active && !isAbortError(error)) fail(apiErrorMessage(error, errorMessage)); });
    return () => {
      active = false; abort.abort();
      for (const cleanup of cleanups) cleanup();
      created?.dispose();
      if (scene.current === created) scene.current = null;
    };
  }, [key, host, enabled, errorMessage]);
  return {scene, ready, state: result?.key === key ? result : null, setState: setResult};
}
