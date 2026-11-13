import { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi, type Mock } from 'vitest';
import { useSceneHost, type SceneCreateContext } from '../../../../../src/components/replay/view3d/scene/useSceneHost.js';

interface Handle { dispose: Mock<() => void> }
type Create = (context: SceneCreateContext) => Promise<Handle>;
let latest: ReturnType<typeof useSceneHost<Handle>> | null = null;
const created: Handle[] = [];

function Probe({ sceneKey, create, enabled = true, onCreated = vi.fn() }: { sceneKey: string; create: Create; enabled?: boolean; onCreated?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  latest = useSceneHost<Handle>({ host, key: sceneKey, enabled, errorMessage: 'Unable to load', create, onCreated });
  return <div ref={host} />;
}
const handle = (): Handle => { const made = { dispose: vi.fn() }; created.push(made); return made; };
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

afterEach(() => { cleanup(); latest = null; created.length = 0; });

it('builds a scene in the host, then disposes it on a new key and on unmount', async () => {
  const onCreated = vi.fn(), create = vi.fn<Create>(async () => handle());
  const view = render(<Probe sceneKey="a" create={create} onCreated={onCreated} />);
  await settle();
  expect(create.mock.calls[0][0].container).toBeInstanceOf(HTMLDivElement);
  expect(latest?.scene.current).toBe(created[0]);
  expect(onCreated).toHaveBeenCalledOnce();
  view.rerender(<Probe sceneKey="b" create={create} onCreated={onCreated} />);
  await settle();
  expect(created[0].dispose).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][0].signal.aborted).toBe(true);
  expect(latest?.scene.current).toBe(created[1]);
  view.unmount();
  expect(created[1].dispose).toHaveBeenCalledOnce();
});

it('reports a failed load for its key, but not an abort or a load that came too late', async () => {
  const view = render(<Probe sceneKey="a" create={async () => { throw Error('Nothing here'); }} />);
  await settle();
  expect(latest?.state).toEqual({ key: 'a', error: 'Nothing here' });
  view.rerender(<Probe sceneKey="b" create={async () => { throw new DOMException('x', 'AbortError'); }} />);
  await settle();
  expect(latest?.state).toBeNull();
  let finish: (value: Handle) => void = () => {};
  view.rerender(<Probe sceneKey="c" create={() => new Promise<Handle>(resolve => { finish = resolve; })} />);
  view.rerender(<Probe sceneKey="d" create={async () => handle()} />);
  const late = handle();
  await act(async () => { finish(late); await Promise.resolve(); });
  expect(late.dispose).toHaveBeenCalledOnce();
  expect(latest?.scene.current).not.toBe(late);
});

it('merges progress into the state and runs the registered cleanups with the scene', async () => {
  const cleanupScene = vi.fn();
  const progress = { track: 1, scenery: { resident: 1, total: 2 }, cars: 0, lighting: 0, shaders: 0, circuit: { resident: 0, total: 0 }, textures: { sharp: 0, total: 0 } };
  const view = render(<Probe sceneKey="a" create={async context => { context.onDispose(cleanupScene); context.showProgress(progress); return handle(); }} />);
  await settle();
  expect(latest?.state?.progress).toBe(progress);
  view.unmount();
  expect(cleanupScene).toHaveBeenCalledOnce();
});

it('holds the build back while disabled', async () => {
  const create = vi.fn<Create>(async () => handle());
  const view = render(<Probe sceneKey="a" enabled={false} create={create} />);
  await settle();
  expect(create).not.toHaveBeenCalled();
  view.rerender(<Probe sceneKey="a" create={create} />);
  await settle();
  expect(create).toHaveBeenCalledOnce();
});
