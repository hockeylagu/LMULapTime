import type { Group, Object3D } from 'three';
import type { SceneryChunk, SceneryLayout } from '../../../../../shared/types/scenes/scenery.js';
import { planResidency, type StreamView } from './residency.js';

export interface SceneryStreamDeps {
  /** Fetches and parses one chunk into a native-coordinate root. Must reject with the signal's reason when aborted. */
  load(chunk: SceneryChunk, signal: AbortSignal): Promise<Object3D>;
  /** Called with a loaded root before it joins the scene. */
  prepare(chunk: SceneryChunk, root: Object3D): void;
  /** A root leaves the scene (or never joined it): free its GPU resources. */
  unload(chunk: SceneryChunk, root: Object3D): void;
  /** The drawn scenery changed (a chunk joined the scene, or chunks were shown or hidden). */
  changed(): void;
  /** A chunk failed to load; it is not retried. */
  failed(chunk: SceneryChunk, error: Error): void;
}

export interface SceneryStream {
  /** Re-plans around the view: shows the resident-set rule's window, hides the rest, and queues what is not loaded yet. */
  update(view: StreamView): void;
  /** Resolves when the chunks under the last view are resident (the horizon may join later); rejects with the first load failure. */
  whenUnderView(): Promise<void>;
  dispose(): void;
}

interface Entry { chunk: SceneryChunk; root: Object3D | null; abort: AbortController | null }

const MAX_CONCURRENT_LOADS = 3;

/**
 * Loads the whole circuit and keeps it: the chunks under the view first, then the resident-set rule's window
 * (docs/SCENE_PACKAGE.md), then the rest of the lap ahead. Chunking only orders the load. Only the horizon and the window (plus
 * its hysteresis margin) are drawn; the other loaded chunks are hidden, so going back along the lap reloads nothing and the
 * frame draws what streaming drew. The loader frees the textures when it is disposed. A load failure is reported and never
 * retried.
 */
export function createSceneryStream(layout: SceneryLayout, parent: Group, deps: SceneryStreamDeps): SceneryStream {
  const chunks = new Map<string, SceneryChunk>([[layout.horizon.id, layout.horizon], ...layout.sectors.map(sector => [sector.id, sector] as const)]);
  const entries = new Map<string, Entry>(), failedIds = new Set<string>();
  let queue: string[] = [], shown = new Set<string>([layout.horizon.id]), under: string[] = [], disposed = false, failure: Error | null = null;
  let waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  /** Until the first view is resident, only the horizon and the chunks under the view load. */
  let firstViewResident = false;

  const resident = (id: string) => entries.get(id)?.root != null;
  // The first frame waits only for the chunks under the view: the horizon (the whole venue's backdrop) joins when it is ready.
  const underResident = () => under.every(resident);
  const settle = () => {
    if (failure) { const error = failure; waiters.splice(0).forEach(waiter => waiter.reject(error)); return; }
    if (!underResident()) return;
    waiters.splice(0).forEach(waiter => waiter.resolve());
    if (!firstViewResident) { firstViewResident = true; pump(); }
  };
  const start = (id: string) => {
    const chunk = chunks.get(id)!, abort = new AbortController(), entry: Entry = { chunk, root: null, abort };
    entries.set(id, entry);
    deps.load(chunk, abort.signal).then(root => {
      entry.abort = null;
      // Disposed while loading: the parsed root never joins the scene.
      if (disposed || entries.get(id) !== entry) { deps.unload(chunk, root); return; }
      deps.prepare(chunk, root);
      root.visible = shown.has(id);
      entry.root = root; parent.add(root);
      deps.changed();
    }, (error: unknown) => {
      if (entries.get(id) === entry) entries.delete(id);
      if (abort.signal.aborted || disposed) return;
      failedIds.add(id);
      failure ??= error instanceof Error ? error : Error('Scenery chunk failed to load', { cause: error });
      deps.failed(chunk, failure);
    }).finally(() => { pump(); settle(); });
  };
  const loading = () => [...entries.values()].filter(entry => entry.abort).length;
  const pump = () => {
    if (disposed) return;
    const eligible = (id: string) => firstViewResident || id === layout.horizon.id || under.includes(id);
    // The first view's few chunks all load at once; afterwards streaming keeps to the concurrency bound.
    while (loading() < (firstViewResident ? MAX_CONCURRENT_LOADS : Infinity)) {
      const index = queue.findIndex(eligible);
      if (index < 0) return;
      const [id] = queue.splice(index, 1);
      if (!entries.has(id) && !failedIds.has(id)) start(id);
    }
  };
  start(layout.horizon.id);

  return {
    update(view) {
      if (disposed) return;
      const plan = planResidency(layout, view);
      shown = new Set([layout.horizon.id, ...plan.keep]); under = plan.under;
      let toggled = false;
      for (const [id, entry] of entries) {
        if (!entry.root || entry.root.visible === shown.has(id)) continue;
        entry.root.visible = shown.has(id); toggled = true;
      }
      if (toggled) deps.changed();
      // The chunks under the view load first, then the rest of the window in the residency plan's order, then the rest of the
      // circuit ahead of the view.
      const wanted = new Set(plan.wanted), lap = view.kind === 'lap' ? view.lapDistanceM : 0, route = layout.routeLengthM;
      const ahead = (chunk: SceneryChunk & { lapStartM: number }) => (((chunk.lapStartM - lap) % route) + route) % route;
      const rest = layout.sectors.filter(sector => !wanted.has(sector.id)).sort((a, b) => ahead(a) - ahead(b)).map(sector => sector.id);
      queue = [layout.horizon.id, ...under, ...plan.wanted.filter(id => !under.includes(id)), ...rest].filter(id => !entries.has(id) && !failedIds.has(id));
      pump(); settle();
    },
    whenUnderView() {
      if (failure) return Promise.reject(failure);
      if (underResident()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => { waiters.push({ resolve, reject }); });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const {chunk, root, abort} of entries.values()) {
        if (abort) abort.abort();
        if (root) { root.removeFromParent(); deps.unload(chunk, root); }
      }
      entries.clear(); waiters = [];
    },
  };
}
