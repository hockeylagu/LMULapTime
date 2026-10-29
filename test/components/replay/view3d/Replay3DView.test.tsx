import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Replay3DView from '../../../../src/components/replay/view3d/Replay3DView.js';
import { createReplayScene } from '../../../../src/components/replay/view3d/replayScene.js';
import { ReplayShortcutHelp } from '../../../../src/components/replay/ReplayShortcutHelp.js';
import { replayShortcutBlocked } from '../../../../src/utils/replayShortcuts.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';

const scene = vi.hoisted(() => ({cursor: vi.fn(), mode: vi.fn(), reset: vi.fn(), center: vi.fn(), zoom: vi.fn(), pan: vi.fn(), dispose: vi.fn()}));
vi.mock('../../../../src/components/replay/view3d/replayScene.js', () => ({createReplayScene: vi.fn(async () => scene)}));
vi.mock('../../../../src/api/trackSceneApi.js', () => ({fetchTrackScene: vi.fn(async () => ({metadata: {sourceGeometryRevision: 'g'}, bytes: new ArrayBuffer(0)}))}));
const boards = vi.hoisted(() => [{id: 'b', center: [3, 0] as [number, number], label: '100', stationM: 3, side: 'left' as const}]);
vi.mock('../../../../src/api/trackGeometryApi.js', () => ({
  loadTrackBoundaryGeometry: vi.fn(async () => ({geometryRevision: 'g'})),
  loadTrackMapDisplay: vi.fn(async () => ({brakeMarkers: boards})),
}));

const trajectory: ReplayTrajectoryData = {replayName: 'test', pointsCount: 7, layoutKey: 'portimao_wec', geometryRevision: 'g',
  bounds: {minX: 0, maxX: 6, minZ: 0, maxZ: 0, spanX: 6, spanZ: 0},
  points: Array.from({length: 7}, (_, i) => ({x: i, y: 1, z: 0, timeSec: i * 0.2, rotY: 0})),
};
beforeEach(() => { vi.clearAllMocks(); });

async function setup() {
  const onSelectIndex = vi.fn(), onTogglePlay = vi.fn();
  const result = render(<><div data-replay-surface="chart" tabIndex={0} data-testid="chart"><ReplayShortcutHelp /></div>
    <Replay3DView trajectory={trajectory} baseline={null} currentIndex={2} onSelectIndex={onSelectIndex}
      onTogglePlay={onTogglePlay} onReturnTo2D={vi.fn()} /></>);
  await waitFor(() => expect(screen.getByText('3D racing line').title).toMatch(/Estimated body/));
  const map = result.container.querySelector<HTMLElement>('[data-replay-view="3d"]')!;
  return {...result, map, chart: screen.getByTestId('chart'), onSelectIndex, onTogglePlay};
}

it('steps the replay exactly once without moving the camera, including half-second jumps and lap ends', async () => {
  const {map, onSelectIndex} = await setup();
  fireEvent.keyDown(map, {key: 'ArrowRight'}); expect(onSelectIndex).toHaveBeenLastCalledWith(3);
  fireEvent.keyDown(map, {key: 'ArrowLeft'}); expect(onSelectIndex).toHaveBeenLastCalledWith(1);
  fireEvent.keyDown(map, {key: 'ArrowRight', shiftKey: true}); expect(onSelectIndex).toHaveBeenLastCalledWith(4);
  fireEvent.keyDown(map, {key: 'ArrowLeft', shiftKey: true}); expect(onSelectIndex).toHaveBeenLastCalledWith(0);
  fireEvent.keyDown(map, {key: 'Home'}); expect(onSelectIndex).toHaveBeenLastCalledWith(0);
  fireEvent.keyDown(map, {key: 'End'}); expect(onSelectIndex).toHaveBeenLastCalledWith(6);
  expect(onSelectIndex).toHaveBeenCalledTimes(6); expect(scene.pan).not.toHaveBeenCalled();
});

it('binds camera zoom, pan, reset, center and follow, keeping chart arrow/zoom keys independent', async () => {
  const {map, chart, onSelectIndex} = await setup();
  for (const key of ['+', '=', '-']) fireEvent.keyDown(map, {key});
  expect(scene.zoom.mock.calls).toEqual([[1], [1], [-1]]);
  for (const key of ['w', 'A', 's', 'D']) fireEvent.keyDown(map, {key});
  expect(scene.pan.mock.calls).toEqual([[0, -1], [-1, 0], [0, 1], [1, 0]]);
  fireEvent.keyDown(map, {key: '0'}); fireEvent.keyDown(map, {key: 'r'}); expect(scene.reset).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(chart, {key: 'C'}); expect(scene.center).toHaveBeenCalledOnce();
  expect(scene.mode).toHaveBeenLastCalledWith('orbit'); // Panning hands the locked follow camera over to orbit.
  fireEvent.keyDown(map, {key: 'f'}); expect(scene.mode).toHaveBeenLastCalledWith('follow');
  fireEvent.keyDown(chart, {key: 'F'}); expect(scene.mode).toHaveBeenLastCalledWith('orbit');
  onSelectIndex.mockClear(); scene.zoom.mockClear();
  fireEvent.keyDown(chart, {key: 'ArrowRight'}); fireEvent.keyDown(chart, {key: '+'});
  expect(onSelectIndex).not.toHaveBeenCalled(); expect(scene.zoom).not.toHaveBeenCalled();
});

it('defaults to Follow, keeps it through zoom and center, and hands a pan over to Orbit so the car never drifts off-centre', async () => {
  const {map} = await setup();
  expect(screen.getByRole('combobox', {name: '3D camera'})).toHaveTextContent('Follow');
  expect(scene.mode).toHaveBeenLastCalledWith('follow'); scene.mode.mockClear();
  for (const key of ['+', '-', 'c']) fireEvent.keyDown(map, {key});
  expect(scene.zoom).toHaveBeenCalledTimes(2); expect(scene.center).toHaveBeenCalledOnce();
  expect(scene.mode).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox', {name: '3D camera'})).toHaveTextContent('Follow');
  for (const key of ['w', 'a']) fireEvent.keyDown(map, {key});
  expect(scene.pan).toHaveBeenCalledTimes(2); expect(scene.mode).toHaveBeenLastCalledWith('orbit');
  expect(screen.getByRole('combobox', {name: '3D camera'})).toHaveTextContent('Orbit');
});

it('selects every camera mode directly with 1–5 and leaves chart keys, controls and modified/repeated keys alone', async () => {
  const {map, chart} = await setup();
  for (const [key, label, value] of [['2', 'Chase', 'chase'], ['3', 'Orbit', 'orbit'], ['4', 'Trackside', 'trackside'], ['5', 'Overhead', 'top'], ['1', 'Follow', 'follow']]) {
    fireEvent.keyDown(map, {key}); expect(scene.mode).toHaveBeenLastCalledWith(value);
    expect(screen.getByRole('combobox', {name: '3D camera'})).toHaveTextContent(label);
  }
  scene.mode.mockClear();
  fireEvent.keyDown(chart, {key: '2'}); fireEvent.keyDown(map, {key: '2', repeat: true});
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) fireEvent.keyDown(map, {key: '2', [modifier]: true});
  fireEvent.keyDown(screen.getByRole('combobox', {name: '3D camera'}), {key: '2'});
  const input = document.createElement('input'); map.append(input); fireEvent.keyDown(input, {key: '2'});
  expect(scene.mode).not.toHaveBeenCalled();
});

it('handles Space once with the inspector listener, ignores held Space, controls, typing and browser modifiers', async () => {
  const {map, onTogglePlay, onSelectIndex} = await setup();
  const inspector = (event: KeyboardEvent) => { if (event.key === ' ' && !event.repeat && !replayShortcutBlocked(event)) { event.preventDefault(); onTogglePlay(); } };
  window.addEventListener('keydown', inspector);
  try {
    fireEvent.keyDown(map, {key: ' '}); expect(onTogglePlay).toHaveBeenCalledOnce();
    fireEvent.keyDown(map, {key: ' ', repeat: true}); expect(onTogglePlay).toHaveBeenCalledOnce();
    const input = document.createElement('input'); map.append(input);
    fireEvent.keyDown(input, {key: 'ArrowRight'}); fireEvent.keyDown(input, {key: ' '});
    fireEvent.keyDown(screen.getByRole('combobox', {name: '3D camera'}), {key: 'ArrowRight'});
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) fireEvent.keyDown(map, {key: 'ArrowRight', [modifier]: true});
    expect(onSelectIndex).not.toHaveBeenCalled(); expect(onTogglePlay).toHaveBeenCalledOnce();
  } finally { window.removeEventListener('keydown', inspector); }
});

it('toggles fullscreen from chart/map and opens only 3D help; Escape closes help before fullscreen', async () => {
  const {map, chart, onSelectIndex} = await setup();
  fireEvent.keyDown(chart, {key: 'm'}); expect(map).toHaveAttribute('data-map-expanded'); expect(map).toHaveFocus();
  fireEvent.keyDown(map, {key: '?'});
  expect(screen.getAllByRole('heading', {name: '3D replay shortcuts'})).toHaveLength(1);
  expect(screen.queryByRole('heading', {name: 'Telemetry shortcuts'})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Close shortcuts'})).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, {key: 'ArrowRight'}); expect(onSelectIndex).not.toHaveBeenCalled();
  fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
  expect(screen.queryByRole('heading', {name: '3D replay shortcuts'})).not.toBeInTheDocument();
  expect(map).toHaveAttribute('data-map-expanded'); expect(map).toHaveFocus();
  fireEvent.keyDown(map, {key: 'Escape'}); expect(map).not.toHaveAttribute('data-map-expanded');
  fireEvent.keyDown(map, {key: 'm'}); expect(map).toHaveAttribute('data-map-expanded');
  fireEvent.keyDown(map, {key: 'm'}); expect(map).not.toHaveAttribute('data-map-expanded');
});

it('removes shortcut listeners and fullscreen isolation on leaving 3D', async () => {
  const {map, chart, unmount} = await setup();
  fireEvent.keyDown(map, {key: 'm'}); expect(chart.closest('[inert]')).not.toBeNull();
  unmount();
  expect(document.querySelector('[data-map-expanded]')).toBeNull(); expect(document.body.style.overflow).not.toBe('hidden');
  expect(scene.dispose).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, {key: '+'}); expect(scene.zoom).not.toHaveBeenCalled();
});

it('passes the layout (white lines, brake boards, active road) to the scene and draws no focus outline on the 3D map', async () => {
  const {map} = await setup();
  expect(vi.mocked(createReplayScene).mock.calls[0][7]).toEqual({geometry: {geometryRevision: 'g'}, display: {brakeMarkers: boards}});
  expect(map.className).not.toContain('focus-visible:outline-2');
});
