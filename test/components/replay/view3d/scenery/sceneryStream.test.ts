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

  it('loads under the camera first, then ahead, then behind, at most three at once', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 });
    expect(ids()).toEqual(['s1', 's2', 's0']); // Window [700, 2500].
    const ready = vi.fn(); void stream.whenUnderView().then(ready);
    await settle(); expect(ready).not.toHaveBeenCalled();
    await finish('s1'); expect(ready).toHaveBeenCalledOnce();
    await finish('s2', 's0');
    expect(stream.residentIds().sort()).toEqual(['horizon', 's0', 's1', 's2']);
    stream.update({ kind: 'lap', lapDistanceM: 100 }); // Window [-200, 1600]: s0, p0, s1, s3.
    expect(ids()).toEqual(['p0', 's3']);
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

  it('unloads a chunk only after it leaves the window plus the hysteresis margin', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 }); await finish('s1', 's2', 's0');
    // s0 ends at 1000: it leaves the 300 m window at lap 1300, and the 250 m margin at lap 1550.
    stream.update({ kind: 'lap', lapDistanceM: 1400 }); await settle();
    expect(stream.residentIds()).toContain('s0'); expect(deps.unload).not.toHaveBeenCalled();
    stream.update({ kind: 'lap', lapDistanceM: 1600 });
    expect(stream.residentIds()).not.toContain('s0');
    expect(deps.unload).toHaveBeenCalledOnce(); expect(deps.unload.mock.calls[0][0].id).toBe('s0');
    expect(deps.unload.mock.calls[0][1].parent).toBeNull();
  });

  it('counts texture references per loaded chunk and releases a texture with its last chunk', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 }); await finish('s1', 's2', 's0');
    // s0 and s2 use t0, s1 uses t1; all use 'shared'.
    stream.update({ kind: 'lap', lapDistanceM: 3000 }); // Window [2700, 4500): s2, s3, s0, p0 (s1 and s0 stay inside the margin only where they overlap).
    await settle();
    expect(deps.releaseTexture).toHaveBeenCalledWith('t1');
    expect(deps.releaseTexture).not.toHaveBeenCalledWith('shared');
    expect(deps.releaseTexture).not.toHaveBeenCalledWith('t0');
    stream.update({ kind: 'free', x: 99999, z: 99999 }); // Everything but the horizon leaves.
    expect(stream.residentIds()).toEqual(['horizon']);
    expect(deps.releaseTexture.mock.calls.map(call => call[0]).sort()).toEqual(['shared', 't0', 't1']);
    expect(deps.releaseTexture.mock.calls.filter(call => call[0] === 'shared')).toHaveLength(1);
  });

  it('aborts a load nobody wants any more and discards one that finishes after being unwanted', async () => {
    const stream = createSceneryStream(testLayout(), parent(), deps);
    await finish('horizon');
    stream.update({ kind: 'lap', lapDistanceM: 1000.5 });
    const s2 = pending.find(entry => entry.chunk.id === 's2')!;
    stream.update({ kind: 'free', x: 99999, z: 99999 });
    expect(s2.signal.aborted).toBe(true);
    expect(deps.failed).not.toHaveBeenCalled(); // An abort is not a failure.
    await settle();
    expect(stream.residentIds()).toEqual(['horizon']);
    // A loader that ignores the abort and resolves anyway must not put the root into the scene.
    const group = parent(), second = createSceneryStream(testLayout(), group, { ...deps, load: (chunk) => new Promise<Object3D>(resolve => { setTimeout(() => resolve(Object.assign(new Group(), { name: chunk.id })), 5); }) });
    second.update({ kind: 'lap', lapDistanceM: 1000.5 }); second.update({ kind: 'free', x: 99999, z: 99999 });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(group.getObjectByName('s1')).toBeUndefined();
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
