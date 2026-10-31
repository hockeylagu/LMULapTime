import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Replay3DView from '../../../../src/components/replay/view3d/Replay3DView.js';
import { createReplayScene } from '../../../../src/components/replay/view3d/replayScene.js';
import { fetchTrackScene } from '../../../../src/api/trackSceneApi.js';
import { fetchVehicleMesh } from '../../../../src/api/vehicles/vehicleMeshApi.js';
import { CAMERA_MODES } from '../../../../src/components/replay/view3d/cameraModes.js';
import { ReplayShortcutHelp } from '../../../../src/components/replay/ReplayShortcutHelp.js';
import { replayShortcutBlocked } from '../../../../src/utils/replayShortcuts.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { createPlaybackCursor, ReplayPlaybackCursorContext } from '../../../../src/components/replay/inspector/replayPlaybackCursor.js';

const scene = vi.hoisted(() => ({wheelMotion: 'Replay-estimated wheel roll', cursor: vi.fn(), mode: vi.fn(), reset: vi.fn(), center: vi.fn(), zoom: vi.fn(), pan: vi.fn(), dispose: vi.fn(), colorLines: vi.fn(), fadeLines: vi.fn(), updateLaps: vi.fn(async () => true)}));
vi.mock('../../../../src/components/replay/view3d/replayScene.js', () => ({createReplayScene: vi.fn(async () => scene)}));
vi.mock('../../../../src/api/trackSceneApi.js', () => ({fetchTrackScene: vi.fn(async () => ({metadata: {sourceGeometryRevision: 'g'}, bytes: new ArrayBuffer(0)}))}));
vi.mock('../../../../src/api/vehicles/vehicleMeshApi.js', () => ({fetchVehicleMesh: vi.fn(async () => null)}));
const boards = vi.hoisted(() => [{id: 'b', center: [3, 0] as [number, number], label: '100', stationM: 3, side: 'left' as const}]);
vi.mock('../../../../src/api/trackGeometryApi.js', () => ({
  loadTrackBoundaryGeometry: vi.fn(async () => ({geometryRevision: 'g'})),
  loadTrackMapDisplay: vi.fn(async () => ({brakeMarkers: boards})),
}));

const trajectory: ReplayTrajectoryData = {replayName: 'test', pointsCount: 7, layoutKey: 'portimao_wec', geometryRevision: 'g',
  bounds: {minX: 0, maxX: 6, minZ: 0, maxZ: 0, spanX: 6, spanZ: 0},
  points: Array.from({length: 7}, (_, i) => ({x: i, y: 1, z: 0, timeSec: i * 0.2, rotY: 0, speedKmh: 150 + i * 10, throttle: 80, brake: 0, gear: 4})),
};
beforeEach(() => { vi.clearAllMocks(); });

it('keeps the track and camera when changing either lap, removing comparison, or reusing a vehicle', async () => {
  const lap = {...trajectory, vehicleData: {id: 'car', model: 'test', carClass: 'LMP2', vehicleIds: []}};
  const comparison = {...lap, replayName: 'comparison'};
  const otherComparison = {...comparison, currentLap: 4};
  const next = {...lap, currentLap: 3, points: lap.points.map(point => ({...point, x: point.x + 1}))};
  const view = (primary: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) => <Replay3DView trajectory={primary} baseline={baseline}
    currentIndex={2} onSelectIndex={vi.fn()} onReturnTo2D={vi.fn()} />;
  const {rerender, unmount} = render(view(lap, null));
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toContain('Estimated body'));
  scene.mode.mockClear();
  await act(async () => rerender(view(lap, comparison)));
  await act(async () => rerender(view(lap, otherComparison)));
  await act(async () => rerender(view(next, otherComparison)));
  await act(async () => rerender(view(next, null)));
  expect(scene.updateLaps.mock.calls.map(call => call.slice(0, 2))).toEqual([[lap, comparison], [lap, otherComparison], [next, otherComparison], [next, null]]);
  expect(createReplayScene).toHaveBeenCalledOnce(); expect(fetchTrackScene).toHaveBeenCalledOnce(); expect(fetchVehicleMesh).toHaveBeenCalledOnce();
  expect(scene.mode).not.toHaveBeenCalled(); expect(scene.reset).not.toHaveBeenCalled(); expect(scene.dispose).not.toHaveBeenCalled();
  unmount(); expect(scene.dispose).toHaveBeenCalledOnce();
});

it('applies the latest laps if selection changes while the initial scene is still loading', async () => {
  let release!: (value: Awaited<ReturnType<typeof createReplayScene>>) => void;
  vi.mocked(createReplayScene).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const view = (lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) => <Replay3DView trajectory={lap} baseline={baseline}
    currentIndex={0} onSelectIndex={vi.fn()} onReturnTo2D={vi.fn()} />;
  const {rerender} = render(view(trajectory, null));
  await waitFor(() => expect(createReplayScene).toHaveBeenCalledOnce());
  const next = {...trajectory, currentLap: 3}, comparison = {...trajectory, currentLap: 4};
  rerender(view(next, comparison));
  await act(async () => release(scene));
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toContain('Ghost: Estimated body'));
  expect(createReplayScene).toHaveBeenCalledOnce(); expect(fetchTrackScene).toHaveBeenCalledOnce();
  expect(scene.updateLaps).toHaveBeenCalledWith(next, comparison, {primary: null, baseline: null, primaryLivery: null, baselineLivery: null, primaryWheels: null, baselineWheels: null}, expect.any(AbortSignal));
  expect(scene.dispose).not.toHaveBeenCalled();
});

it('rebuilds for another layout and rejects a comparison from a different geometry', async () => {
  const view = (lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) => <Replay3DView trajectory={lap} baseline={baseline}
    currentIndex={0} onSelectIndex={vi.fn()} onReturnTo2D={vi.fn()} />;
  const {rerender} = render(view(trajectory, null));
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toContain('Estimated body'));
  await act(async () => rerender(view(trajectory, {...trajectory, geometryRevision: 'wrong'})));
  expect(screen.getByText(/Comparison lap and 3D scene must use the same layout/)).toBeInTheDocument();
  expect(scene.updateLaps).not.toHaveBeenCalled(); expect(createReplayScene).toHaveBeenCalledOnce();
  const other = {...trajectory, layoutKey: 'spa_wec'};
  await act(async () => rerender(view(other, null)));
  await waitFor(() => expect(createReplayScene).toHaveBeenCalledTimes(2));
  expect(fetchTrackScene).toHaveBeenCalledTimes(2); expect(scene.dispose).toHaveBeenCalledOnce();
});

async function setup(onReturnTo2D = vi.fn(), onChangeColorBy = vi.fn()) {
  const onSelectIndex = vi.fn(), onTogglePlay = vi.fn();
  const result = render(<><div data-replay-surface="chart" tabIndex={0} data-testid="chart"><ReplayShortcutHelp /></div>
    <Replay3DView trajectory={trajectory} baseline={null} currentIndex={2} onSelectIndex={onSelectIndex}
      onTogglePlay={onTogglePlay} onReturnTo2D={onReturnTo2D} onChangeColorBy={onChangeColorBy} /></>);
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toMatch(/Estimated body/));
  const map = result.container.querySelector<HTMLElement>('[data-replay-view="3d"]')!;
  return {...result, map, chart: screen.getByTestId('chart'), onSelectIndex, onTogglePlay, onReturnTo2D, onChangeColorBy};
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
  expect(screen.getByRole('button', {name: '3D camera'})).toHaveTextContent('Follow');
  expect(scene.mode).toHaveBeenLastCalledWith('follow'); scene.mode.mockClear();
  for (const key of ['+', '-', 'c']) fireEvent.keyDown(map, {key});
  expect(scene.zoom).toHaveBeenCalledTimes(2); expect(scene.center).toHaveBeenCalledOnce();
  expect(scene.mode).not.toHaveBeenCalled();
  expect(screen.getByRole('button', {name: '3D camera'})).toHaveTextContent('Follow');
  for (const key of ['w', 'a']) fireEvent.keyDown(map, {key});
  expect(scene.pan).toHaveBeenCalledTimes(2); expect(scene.mode).toHaveBeenLastCalledWith('orbit');
  expect(screen.getByRole('button', {name: '3D camera'})).toHaveTextContent('Orbit');
});

it('selects every configured camera mode and leaves chart keys, controls and modified/repeated keys alone', async () => {
  const {map, chart} = await setup();
  for (const {shortcut: key, label, value} of CAMERA_MODES) {
    fireEvent.keyDown(map, {key}); expect(scene.mode).toHaveBeenLastCalledWith(value);
    expect(screen.getByRole('button', {name: '3D camera'})).toHaveTextContent(label);
  }
  scene.mode.mockClear();
  fireEvent.keyDown(chart, {key: '2'}); fireEvent.keyDown(map, {key: '2', repeat: true});
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) fireEvent.keyDown(map, {key: '2', [modifier]: true});
  fireEvent.keyDown(screen.getByRole('button', {name: '3D camera'}), {key: '2'});
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
    fireEvent.keyDown(screen.getByRole('button', {name: '3D camera'}), {key: 'ArrowRight'});
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

it('supports floating map controls overlay buttons (zoom, center, follow, reset, play/pause, switch to 2D)', async () => {
  const onReturnTo2D = vi.fn();
  const {onTogglePlay} = await setup(onReturnTo2D);
  expect(screen.getByTestId('map-controls-overlay')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Zoom in'}));
  expect(scene.zoom).toHaveBeenLastCalledWith(1);

  fireEvent.click(screen.getByRole('button', {name: 'Zoom out'}));
  expect(scene.zoom).toHaveBeenLastCalledWith(-1);

  fireEvent.click(screen.getByRole('button', {name: 'Center car'}));
  expect(scene.center).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole('button', {name: 'Follow car'}));
  expect(scene.mode).toHaveBeenLastCalledWith('orbit');

  fireEvent.click(screen.getByRole('button', {name: 'Reset zoom and pan'}));
  expect(scene.reset).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole('button', {name: 'Play'}));
  expect(onTogglePlay).toHaveBeenCalledOnce();

  const switchBtn = screen.getByRole('button', {name: 'Switch to 2D view'});
  expect(switchBtn).toBeInTheDocument();
  expect(switchBtn).toHaveTextContent('2D');
  fireEvent.click(switchBtn);
  expect(onReturnTo2D).toHaveBeenCalledOnce();
});

it('supports top control buttons (return to 2D, color modes, primary/baseline line fading)', async () => {
  const onReturnTo2D = vi.fn(), onChangeColorBy = vi.fn(), onToggleFadedLine = vi.fn();
  render(
    <Replay3DView
      trajectory={trajectory}
      baseline={trajectory}
      currentIndex={2}
      onSelectIndex={vi.fn()}
      onReturnTo2D={onReturnTo2D}
      colorBy="speed"
      onChangeColorBy={onChangeColorBy}
      fadedLine="none"
      onToggleFadedLine={onToggleFadedLine}
    />
  );
  await waitFor(() => expect(screen.getByRole('button', {name: 'Switch to 2D view'})).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', {name: 'Switch to 2D view'}));
  expect(onReturnTo2D).toHaveBeenCalledOnce();

  expect(screen.getByRole('button', {name: 'Pedal'})).toBeInTheDocument();
  const speedBtn = screen.getByRole('button', {name: 'Speed'});
  expect(speedBtn).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(speedBtn);
  expect(onChangeColorBy).toHaveBeenCalledWith('default');

  expect(screen.getByRole('button', {name: 'Delta'})).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Gain / Loss'})).toBeInTheDocument();

  const primaryBtn = screen.getByRole('button', {name: 'Fade primary line'});
  fireEvent.click(primaryBtn);
  expect(onToggleFadedLine).toHaveBeenCalledWith('primary');

  const baselineBtn = screen.getByRole('button', {name: 'Fade baseline line'});
  fireEvent.click(baselineBtn);
  expect(onToggleFadedLine).toHaveBeenCalledWith('baseline');
});

it('renders the minimap at the top, collapsed HUD in regular view, and full screen telemetry dock + lap timing panel in expanded view', async () => {
  const {map} = await setup();
  expect(screen.getByTestId('gps-circuit-minimap')).toBeInTheDocument();
  expect(screen.queryByLabelText('Lap and sector timing')).not.toBeInTheDocument();

  // In regular (collapsed) view, uses the collapsed HUD
  expect(screen.getByText('SPEED')).toBeInTheDocument();
  expect(screen.getByText('THR')).toBeInTheDocument();
  expect(screen.getByText('BRK')).toBeInTheDocument();
  expect(screen.getByText('STEER')).toBeInTheDocument();
  expect(screen.getByText('170')).toBeInTheDocument(); // speedKmh for currentIndex 2 (150 + 2*10 = 170)
  expect(screen.getByText('GEAR 4')).toBeInTheDocument();

  // Expanding into full screen activates the 2D full screen telemetry dock, HUD, mode bar, and lap timing panel
  fireEvent.keyDown(map, {key: 'm'});
  expect(screen.getByLabelText('Fullscreen telemetry')).toBeInTheDocument();
  expect(screen.getByTestId('gps-map-telemetry-hud')).toBeInTheDocument();
  expect(screen.getByTestId('gps-circuit-minimap')).toBeInTheDocument();
  const modeBar = within(screen.getByTestId('gps-map-mode-bar'));
  expect(modeBar.getByRole('button', {name: 'Pedal'})).toBeInTheDocument();
  expect(modeBar.getByRole('button', {name: 'Speed'})).toBeInTheDocument();
  expect(screen.getByLabelText('Lap and sector timing')).toBeInTheDocument();
  expect(screen.getByText('Lap')).toBeInTheDocument();
  expect(screen.getByText('S1')).toBeInTheDocument();
  expect(screen.getByText('S2')).toBeInTheDocument();
  expect(screen.getByText('S3')).toBeInTheDocument();
});

it('opens camera mode popover from the HUD button and changes camera mode on selection', async () => {
  await setup();
  const cameraBtn = screen.getByRole('button', {name: '3D camera'});
  expect(cameraBtn).toBeInTheDocument();
  expect(screen.queryByRole('group', {name: 'Camera modes'})).not.toBeInTheDocument();

  fireEvent.click(cameraBtn);
  expect(screen.getByRole('group', {name: 'Camera modes'})).toBeInTheDocument();

  const chaseOption = screen.getByRole('button', {name: /Chase/i});
  fireEvent.click(chaseOption);
  expect(scene.mode).toHaveBeenLastCalledWith('chase');
  expect(screen.queryByRole('group', {name: 'Camera modes'})).not.toBeInTheDocument();
});

it('keeps friction, legend and trace controls working through expand and collapse', async () => {
  const {map} = await setup();
  const minimap = screen.getByTestId('gps-circuit-minimap');
  expect(minimap.className).toContain('bg-lmu-strip/70');
  expect(minimap.className).toContain('pointer-events-none');
  fireEvent.click(screen.getByRole('button', {name: 'Show friction circle'}));
  expect(screen.getByLabelText('Estimated friction circle')).toBeInTheDocument();
  fireEvent.keyDown(map, {key: 'm'});
  expect(screen.getAllByLabelText('Estimated friction circle')).toHaveLength(1);
  expect(screen.getByRole('button', {name: 'Hide friction circle'})).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', {name: 'Hide telemetry trace'}));
  expect(screen.getByRole('button', {name: 'Show telemetry trace'})).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', {name: 'Show telemetry trace'}));
  fireEvent.keyDown(map, {key: 'Escape'});
  expect(screen.queryByLabelText('Fullscreen telemetry')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Estimated friction circle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Hide friction circle'}));
  expect(screen.queryByLabelText('Estimated friction circle')).not.toBeInTheDocument();
});

it('uses the interpolated playhead for the collapsed HUD, fullscreen comparison HUD and minimap', async () => {
  const cursor = createPlaybackCursor();
  const {container} = render(<ReplayPlaybackCursorContext value={cursor}>
    <Replay3DView trajectory={trajectory} baseline={trajectory} currentIndex={2} onSelectIndex={vi.fn()}
      onReturnTo2D={vi.fn()} />
  </ReplayPlaybackCursorContext>);
  await waitFor(() => expect(scene.cursor).toHaveBeenCalled());
  act(() => cursor.publish(trajectory.points, {index: 2, timeSec: 0.5}));
  expect(screen.getByText('175')).toBeInTheDocument();
  const marker = screen.getByTestId('gps-circuit-minimap').querySelector('circle[fill="#38BDF8"]');
  expect(Number(marker?.getAttribute('cx'))).toBeCloseTo(60 + 2.5 * 680 / 6);
  fireEvent.keyDown(container.querySelector('[data-replay-view="3d"]')!, {key: 'm'});
  expect(within(screen.getByTestId('telemetry-hud-primary')).getByText('175')).toBeInTheDocument();
  expect(within(screen.getByTestId('telemetry-hud-baseline')).getByText('175')).toBeInTheDocument();
});
