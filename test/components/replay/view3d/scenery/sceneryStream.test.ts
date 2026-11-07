import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Group, type Object3D } from 'three';
import { createSceneryStream, type SceneryStreamDeps } from '../../../../../src/components/replay/view3d/scenery/sceneryStream.js';
import type { SceneryChunk } from '../../../../../shared/types/scenes/scenery.js';
import { testLayout } from './layoutFixture.js';

interface Pending { chunk: SceneryChunk; signal: AbortSignal; resolve: (root: Object3D) => void; reject: (error: Error) => void }

let pending: Pending[];
let deps: { [K in keyof SceneryStreamDeps]: Mock<SceneryStreamDeps[K]> };
const parent = () => new Group();
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const ids = () => pending.map(entry => entry.chunk.id);
/** Resolves every request waiting for this chunk id with a fresh root. */
async function finish(...chunkIds: string[]): Promise<void> {
  for (const id of chunkIds) {
    const entry = pending.find(candidate => candidate.chunk.id === id);
    if (!entry) throw Error(`${id} was never requested`);
    pending.splice(pending.indexOf(entry), 1);
    const root = new Group(); root.name = id; entry.resolve(root);
  }
  await settle();
}

beforeEach(() => {
  pending = [];
  deps = {
    load: vi.fn((chunk: SceneryChunk, signal: AbortSignal) => new Promise<Object3D>((resolve, reject) => {
      const entry = { chunk, signal, resolve, reject }; pending.push(entry);
      signal.addEventListener('abort', () => { pending.splice(pending.indexOf(entry), 1); reject(signal.reason as Error); });
    })),
    prepare: vi.fn(), unload: vi.fn(), releaseTexture: vi.fn(), changed: vi.fn(), failed: vi.fn(),
  };
});

describe('sceneryStream', () => {
  it('requests the horizon at creation and keeps it resident for any view', async () => {
    const group = parent(), stream = createSceneryStream(testLayout(), group, deps);
    expect(ids()).toEqual(['horizon']);
    await finish('horizon');
    expect(group.getObjectByName('horizon')).toBeDefined();
    stream.update({ kind: 'lap', lapDistanceM: 2500 }); stream.update({ kind: 'free', x: 99999, z: 99999 });
    expect(stream.residentIds()).toEqual(['horizon']);
  });

  it('loads under the camera first, then the window, then the rest of the circuit ahead, at most three at once', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 });
    expect(ids()).toEqual(['s1', 's2', 's0']); // Window [700, 2500].
    const ready = vi.fn(); void stream.whenUnderView().then(ready);
    await settle(); expect(ready).not.toHaveBeenCalled();
    await finish('s1'); expect(ready).toHaveBeenCalledOnce();
    expect(ids()).toEqual(['s2', 's0', 's3']); // The rest of the lap ahead follows the window.
    await finish('s2', 's0');
    expect(ids()).toEqual(['s3', 'p0']);
    await finish('s3', 'p0');
    expect(stream.residentIds().sort()).toEqual(['horizon', 'p0', 's0', 's1', 's2', 's3']);
    stream.update({ kind: 'lap', lapDistanceM: 100 });
    expect(ids()).toEqual([]); // Everything is loaded: nothing is fetched again.
  });

  it('loads only the first view (all at once), which is ready without the horizon, then the rest of the window', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 }); // Before the horizon arrives, as on the first load.
    expect(ids()).toEqual(['horizon', 's1']);
    const ready = vi.fn(); void stream.whenUnderView().then(ready);
    await finish('s1');
    expect(ready).toHaveBeenCalledOnce(); // The horizon is still loading.
    expect(ids()).toEqual(['horizon', 's2', 's0']);
  });

  it('prepares a root before it joins the scene and reports each change', async () => {
    const group = parent(), stream = createSceneryStream(testLayout(), group, deps);
    await finish('horizon');
    expect(deps.prepare).toHaveBeenCalledOnce();
    const [chunk, root] = deps.prepare.mock.calls[0];
    expect(chunk.id).toBe('horizon'); expect(root.parent).toBe(group); // Added right after prepare returned.
    expect(deps.changed).toHaveBeenCalledOnce();
    stream.update({ kind: 'lap', lapDistanceM: 0 });
  });

  it('hides a chunk only after it leaves the window plus the hysteresis margin, and shows it again on return', async () => {
    const group = parent(), stream = createSceneryStream(testLayout(), group, deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 }); await finish('s1', 's2', 's0');
    const s0 = group.getObjectByName('s0')!;
    // s0 ends at 1000: it leaves the 300 m window at lap 1300, and the 250 m margin at lap 1550.
    stream.update({ kind: 'lap', lapDistanceM: 1400 }); await settle();
    expect(s0.visible).toBe(true);
    deps.changed.mockClear();
    stream.update({ kind: 'lap', lapDistanceM: 1600 });
    expect(s0.visible).toBe(false); expect(s0.parent).toBe(group); expect(deps.changed).toHaveBeenCalledOnce();
    expect(stream.residentIds()).toContain('s0'); expect(deps.unload).not.toHaveBeenCalled();
    deps.changed.mockClear();
    stream.update({ kind: 'lap', lapDistanceM: 1600 });
    expect(deps.changed).not.toHaveBeenCalled(); // Nothing toggled.
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 });
    expect(s0.visible).toBe(true); expect(deps.load.mock.calls.filter(call => call[0].id === 's0')).toHaveLength(1);
    expect(group.getObjectByName('horizon')!.visible).toBe(true);
  });

  it('keeps every texture until dispose, then releases each once', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 }); await finish('s1', 's2', 's0');
    stream.update({ kind: 'free', x: 99999, z: 99999 }); await settle(); // Everything but the horizon is hidden.
    expect(deps.releaseTexture).not.toHaveBeenCalled();
    stream.dispose();
    expect(deps.releaseTexture.mock.calls.map(call => call[0]).sort()).toEqual(['shared', 't0', 't1']);
  });

  it('adds a chunk that left the window while loading as hidden, and discards one that finishes after dispose', async () => {
    const group = parent(), stream = createSceneryStream(testLayout(), group, deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 });
    stream.update({ kind: 'free', x: 99999, z: 99999 });
    await finish('s2');
    expect(group.getObjectByName('s2')!.visible).toBe(false);
    // A loader that ignores the abort and resolves anyway must not put the root into the scene.
    const other = parent(), second = createSceneryStream(testLayout(), other, { ...deps, load: (chunk) => new Promise<Object3D>(resolve => { setTimeout(() => resolve(Object.assign(new Group(), { name: chunk.id })), 5); }) });
    second.update({ kind: 'lap', lapDistanceM: 1000.5 }); second.dispose();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(other.getObjectByName('s1')).toBeUndefined();
  });

  it('reports a failed chunk once, never retries it, and rejects whenUnderView', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 });
    const waiting = stream.whenUnderView(); const caught = waiting.then(() => Error("resolved"), (error: Error) => error);
    pending.find(entry => entry.chunk.id === 's1')!.reject(Error('boom'));
    expect((await caught).message).toBe('boom');
    expect(deps.failed).toHaveBeenCalledOnce();
    stream.update({ kind: 'lap', lapDistanceM: 1010 });
    expect(deps.load.mock.calls.filter(call => call[0].id === 's1')).toHaveLength(1);
    await expect(stream.whenUnderView()).rejects.toThrow('boom');
  });

  it('unloads everything on dispose, ignores later updates and settles late loads', async () => {
    const group = parent(), stream = createSceneryStream(testLayout(), group, deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 }); await finish('s1');
    const late = pending.find(entry => entry.chunk.id === 's2')!;
    stream.dispose();
    expect(group.children).toHaveLength(0); expect(stream.residentIds()).toEqual([]);
    expect(deps.unload).toHaveBeenCalledTimes(2); expect(late.signal.aborted).toBe(true);
    const calls = deps.load.mock.calls.length;
    stream.update({ kind: 'lap', lapDistanceM: 3000 }); expect(deps.load.mock.calls).toHaveLength(calls);
  });
});
