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
  /** The last chunk using this texture (package-relative KTX2 path) unloaded. */
  releaseTexture(asset: string): void;
  /** The set of resident chunks changed (after a chunk joined or left the scene). */
  changed(): void;
  /** A chunk failed to load; it is not retried. */
  failed(chunk: SceneryChunk, error: Error): void;
}

export interface SceneryStream {
  /** Re-plans residency around the view: loads what the resident-set rule wants, unloads what left window plus hysteresis. */
  update(view: StreamView): void;
  /** Resolves when the horizon and the chunks under the last view are resident; rejects with the first load failure. */
  whenUnderView(): Promise<void>;
  residentIds(): string[];
  dispose(): void;
}

interface Entry { chunk: SceneryChunk; root: Object3D | null; abort: AbortController | null }

const MAX_CONCURRENT_LOADS = 3;

/**
 * Keeps the horizon chunk always resident and the sector chunks of the resident-set rule loaded around the view
 * (docs/SCENE_PACKAGE.md). Each loaded chunk adds one reference to every texture it uses; a texture is released when its last
 * chunk unloads. A load failure is reported and never retried.
 */
export function createSceneryStream(layout: SceneryLayout, parent: Group, deps: SceneryStreamDeps): SceneryStream {
  const chunks = new Map<string, SceneryChunk>([[layout.horizon.id, layout.horizon], ...layout.sectors.map(sector => [sector.id, sector] as const)]);
  const entries = new Map<string, Entry>(), references = new Map<string, number>(), failedIds = new Set<string>();
  let queue: string[] = [], keep = new Set<string>(), under: string[] = [], disposed = false, failure: Error | null = null;
  let waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  const resident = (id: string) => entries.get(id)?.root != null;
  const underResident = () => resident(layout.horizon.id) && under.every(resident);
  const settle = () => {
    if (failure) { const error = failure; waiters.splice(0).forEach(waiter => waiter.reject(error)); return; }
    if (underResident()) waiters.splice(0).forEach(waiter => waiter.resolve());
  };
  const unload = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    if (entry.abort) { entry.abort.abort(); return; }
    if (!entry.root) return;
    entry.root.removeFromParent();
    deps.unload(entry.chunk, entry.root);
    for (const asset of entry.chunk.textures) {
      const left = (references.get(asset) ?? 0) - 1;
      if (left > 0) references.set(asset, left); else { references.delete(asset); deps.releaseTexture(asset); }
    }
    deps.changed();
  };
  const start = (id: string) => {
    const chunk = chunks.get(id)!, abort = new AbortController(), entry: Entry = { chunk, root: null, abort };
    entries.set(id, entry);
    deps.load(chunk, abort.signal).then(root => {
      entry.abort = null;
      // Unloaded or disposed while loading: the entry is gone, so the parsed root never joins the scene.
      if (disposed || entries.get(id) !== entry) { deps.unload(chunk, root); return; }
      deps.prepare(chunk, root);
      entry.root = root; parent.add(root);
      for (const asset of chunk.textures) references.set(asset, (references.get(asset) ?? 0) + 1);
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
    while (queue.length && loading() < MAX_CONCURRENT_LOADS) {
      const id = queue.shift()!;
      if (!entries.has(id) && !failedIds.has(id) && keep.has(id)) start(id);
    }
  };
  start(layout.horizon.id);

  return {
    update(view) {
      if (disposed) return;
      const plan = planResidency(layout, view);
      keep = new Set([layout.horizon.id, ...plan.keep]); under = plan.under;
      for (const id of entries.keys()) if (!keep.has(id)) unload(id);
      queue = [layout.horizon.id, ...plan.wanted].filter(id => !entries.has(id) && !failedIds.has(id));
      pump(); settle();
    },
    whenUnderView() {
      if (failure) return Promise.reject(failure);
      if (underResident()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => { waiters.push({ resolve, reject }); });
    },
    residentIds: () => [...entries.entries()].filter(([, entry]) => entry.root).map(([id]) => id),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of entries.keys()) unload(id);
      waiters = [];
    },
  };
}
