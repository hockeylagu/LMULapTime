import { beforeEach, expect, it, vi } from 'vitest';
import { useState, type ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Replay3DView from '../../../../../src/components/replay/view3d/laps/Replay3DView.js';
import { createReplayScene } from '../../../../../src/components/replay/view3d/laps/replayScene.js';
import { fetchSceneryLayout } from '../../../../../src/api/sceneryApi.js';
import { fetchBody } from '../../../../../src/api/vehicles/bodyApi.js';
import { CAMERA_MODES } from '../../../../../src/components/replay/view3d/camera/cameraModes.js';
import { ReplayShortcutHelp } from '../../../../../src/components/replay/ReplayShortcutHelp.js';
import { replayShortcutBlocked } from '../../../../../src/utils/replayShortcuts.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { createPlaybackCursor, ReplayPlaybackCursorContext } from '../../../../../src/components/replay/inspector/replayPlaybackCursor.js';
import { ReplayFullscreenControlsContext, type ReplayFullscreenControls } from '../../../../../src/components/replay/inspector/replayFullscreenControls.js';
import type { CornerSegmentComparison } from '../../../../../src/utils/cornerAnalysis/types.js';

const scene = vi.hoisted(() => ({wheelMotion: 'Replay-estimated wheel roll', cursor: vi.fn(), beforeFrame: vi.fn(), mode: vi.fn(), reset: vi.fn(), overview: vi.fn(), frameStretch: vi.fn(), showMarks: vi.fn(), center: vi.fn(), zoom: vi.fn(), dispose: vi.fn(), colorLines: vi.fn(), fadeLines: vi.fn(), showTrace: vi.fn(), pickTrace: vi.fn(async () => null), hoverTrace: vi.fn(), holdKey: vi.fn(), releaseKeys: vi.fn(), syncGhost: vi.fn(), updateLaps: vi.fn(async () => true)}));
vi.mock('../../../../../src/components/replay/view3d/laps/replayScene.js', () => ({createReplayScene: vi.fn(async () => scene), lapFirstStation: () => 0}));
vi.mock('../../../../../src/components/replay/view3d/scene/sceneShell.js', () => ({createSceneShell: () => ({started: false, broken: false, detach() {}, dispose() {}})}));
const layout = vi.hoisted(() => ({sourceGeometryRevision: 'g', packageRevision: 'p'}));
vi.mock('../../../../../src/api/sceneryApi.js', () => ({fetchSceneryLayout: vi.fn(async () => layout)}));
vi.mock('../../../../../src/api/vehicles/bodyApi.js', () => ({fetchBody: vi.fn(async (vehicleId: string) => ({vehicleId}))}));

const trajectory: ReplayTrajectoryData = {replayName: 'test', pointsCount: 7, layoutKey: 'portimao_wec', geometryRevision: 'g', vehicleIdentity: {vehicleId: 'CAR_VEH'},
  bounds: {minX: 0, maxX: 6, minZ: 0, maxZ: 0, spanX: 6, spanZ: 0},
  points: Array.from({length: 7}, (_, i) => ({x: i, y: 1, z: 0, timeSec: i * 0.2, rotY: 0, speedKmh: 150 + i * 10, throttle: 80, brake: 0, gear: 4, stationM: i * 10})),
};
const carMatch: unknown = expect.objectContaining({vehicleId: 'CAR_VEH'});
beforeEach(() => { vi.clearAllMocks(); });

type PageState = 'isExpanded' | 'onToggleExpanded' | 'fadedLine' | 'onToggleFadedLine' | 'showFrictionCircle' | 'onToggleFrictionCircle';
/** The view with the expand, faded line and friction circle state its page keeps (ReplayMapContainer); a test's own props win. */
function View(props: Omit<ComponentProps<typeof Replay3DView>, PageState> & Partial<Pick<ComponentProps<typeof Replay3DView>, PageState>>) {
  const [isExpanded, setExpanded] = useState(false), [showFrictionCircle, setShowFrictionCircle] = useState(false);
  const [fadedLine, setFadedLine] = useState<'none' | 'primary' | 'baseline'>('none');
  return <Replay3DView isExpanded={isExpanded} onToggleExpanded={setExpanded} fadedLine={fadedLine} onToggleFadedLine={line => setFadedLine(f => (f === line ? 'none' : line))}
    showFrictionCircle={showFrictionCircle} onToggleFrictionCircle={() => setShowFrictionCircle(value => !value)} {...props} />;
}
it('keeps the track and camera when changing either lap, removing comparison, or reusing a vehicle', async () => {
  const lap = {...trajectory, vehicleData: {id: 'car', model: 'test', carClass: 'LMP2', vehicleIds: []}};
  const comparison = {...lap, replayName: 'comparison'};
  const otherComparison = {...comparison, currentLap: 4};
  const next = {...lap, currentLap: 3, points: lap.points.map(point => ({...point, x: point.x + 1}))};
  const view = (primary: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) => <View trajectory={primary} baseline={baseline}
    currentIndex={2} onSelectIndex={vi.fn()} onReturnTo2D={vi.fn()} />;
  const {rerender, unmount} = render(view(lap, null));
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toContain('Textured car'));
  scene.mode.mockClear();
  await act(async () => rerender(view(lap, comparison)));
  await act(async () => rerender(view(lap, otherComparison)));
  await act(async () => rerender(view(next, otherComparison)));
  await act(async () => rerender(view(next, null)));
  expect(scene.updateLaps.mock.calls.map(call => call.slice(0, 2))).toEqual([[lap, comparison], [lap, otherComparison], [next, otherComparison], [next, null]]);
  expect(createReplayScene).toHaveBeenCalledOnce(); expect(fetchSceneryLayout).toHaveBeenCalledOnce(); expect(fetchBody).toHaveBeenCalledOnce();
  expect(scene.mode).not.toHaveBeenCalled(); expect(scene.reset).not.toHaveBeenCalled(); expect(scene.dispose).not.toHaveBeenCalled();
  unmount(); expect(scene.dispose).toHaveBeenCalledOnce();
});

it('applies the latest laps if selection changes while the initial scene is still loading', async () => {
  let release!: (value: Awaited<ReturnType<typeof createReplayScene>>) => void;
  vi.mocked(createReplayScene).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const view = (lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) => <View trajectory={lap} baseline={baseline}
    currentIndex={0} onSelectIndex={vi.fn()} onReturnTo2D={vi.fn()} />;
  const {rerender} = render(view(trajectory, null));
  await waitFor(() => expect(createReplayScene).toHaveBeenCalledOnce());
  const next = {...trajectory, currentLap: 3}, comparison = {...trajectory, currentLap: 4};
  rerender(view(next, comparison));
  await act(async () => release(scene));
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toContain('Ghost: Textured car'));
  expect(createReplayScene).toHaveBeenCalledOnce(); expect(fetchSceneryLayout).toHaveBeenCalledOnce();
  // The cars go to the scene while they load, so it can count them.
  expect(scene.updateLaps).toHaveBeenCalledWith(next, comparison, expect.any(Promise), expect.any(AbortSignal));
  await expect((scene.updateLaps.mock.calls[0] as unknown[])[2]).resolves.toEqual({primary: carMatch, baseline: carMatch});
  expect(scene.dispose).not.toHaveBeenCalled();
});

it('rebuilds for another layout and rejects a comparison from a different geometry', async () => {
  const view = (lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) => <View trajectory={lap} baseline={baseline}
    currentIndex={0} onSelectIndex={vi.fn()} onReturnTo2D={vi.fn()} />;
  const {rerender} = render(view(trajectory, null));
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toContain('Textured car'));
  await act(async () => rerender(view(trajectory, {...trajectory, geometryRevision: 'wrong'})));
  expect(screen.getByText(/Comparison lap and 3D scene must use the same layout/)).toBeInTheDocument();
  expect(scene.updateLaps).not.toHaveBeenCalled(); expect(createReplayScene).toHaveBeenCalledOnce();
  const other = {...trajectory, layoutKey: 'spa_wec'};
  await act(async () => rerender(view(other, null)));
  await waitFor(() => expect(createReplayScene).toHaveBeenCalledTimes(2));
  expect(fetchSceneryLayout).toHaveBeenCalledTimes(2); expect(scene.dispose).toHaveBeenCalledOnce();
});

async function setup(onReturnTo2D = vi.fn(), onChangeColorBy = vi.fn()) {
  const onSelectIndex = vi.fn(), onTogglePlay = vi.fn();
  const result = render(<><div data-replay-surface="chart" tabIndex={0} data-testid="chart"><ReplayShortcutHelp /></div>
    <View trajectory={trajectory} baseline={null} currentIndex={2} onSelectIndex={onSelectIndex}
      onTogglePlay={onTogglePlay} onReturnTo2D={onReturnTo2D} onChangeColorBy={onChangeColorBy} /></>);
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toMatch(/Textured car/));
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
  expect(onSelectIndex).toHaveBeenCalledTimes(6); expect(scene.holdKey).not.toHaveBeenCalled();
});

it('binds camera zoom, fly, reset, overview and follow, keeping chart arrow/zoom keys independent', async () => {
  const {map, chart, onSelectIndex} = await setup();
  // Held keys: a press starts the move, its release (anywhere, + released as = after Shift) ends it, a repeat changes nothing.
  for (const key of ['+', '=', '-', '_']) fireEvent.keyDown(map, {key});
  fireEvent.keyDown(map, {key: '+', repeat: true}); fireEvent.keyUp(window, {key: '='});
  expect(scene.holdKey.mock.calls).toEqual([['in', true], ['in', true], ['out', true], ['out', true], ['in', false]]);
  scene.holdKey.mockClear();
  // E up, Q down, Shift faster; a letter under Shift is still its own key.
  for (const key of ['w', 'A', 's', 'D', 'q', 'E', 'Shift']) fireEvent.keyDown(map, {key});
  fireEvent.keyUp(window, {key: 'Shift'}); fireEvent.keyUp(window, {key: 'E'});
  expect(scene.holdKey.mock.calls).toEqual([['w', true], ['a', true], ['s', true], ['d', true],
    ['q', true], ['e', true], ['shift', true], ['shift', false], ['e', false]]);
  fireEvent.blur(window); expect(scene.releaseKeys).toHaveBeenCalled();
  expect(scene.zoom).not.toHaveBeenCalled();
  fireEvent.keyDown(map, {key: '0'}); expect(scene.reset).toHaveBeenCalledOnce();
  fireEvent.keyDown(map, {key: '9'}); expect(scene.overview).toHaveBeenCalledOnce(); // The whole circuit from the air.
  fireEvent.keyDown(chart, {key: 'C'}); expect(scene.center).toHaveBeenCalledOnce();
  expect(scene.mode).toHaveBeenLastCalledWith('orbit'); // Flying hands the locked follow camera over to orbit.
  fireEvent.keyDown(map, {key: 'f'}); expect(scene.mode).toHaveBeenLastCalledWith('follow');
  fireEvent.keyDown(chart, {key: 'F'}); expect(scene.mode).toHaveBeenLastCalledWith('orbit');
  onSelectIndex.mockClear(); scene.holdKey.mockClear();
  fireEvent.keyDown(chart, {key: 'ArrowRight'}); fireEvent.keyDown(chart, {key: '+'});
  expect(onSelectIndex).not.toHaveBeenCalled(); expect(scene.holdKey).not.toHaveBeenCalled();
});

it('defaults to Chase, keeps it through zoom and center, and hands a move over to Orbit so the car never drifts off-centre', async () => {
  const {map} = await setup();
  expect(screen.getByRole('button', {name: '3D camera'})).toHaveTextContent('Chase');
  expect(scene.mode).toHaveBeenLastCalledWith('chase'); scene.mode.mockClear();
  for (const key of ['+', '-', 'c']) fireEvent.keyDown(map, {key});
  expect(scene.holdKey).toHaveBeenCalledTimes(2); expect(scene.center).toHaveBeenCalledOnce();
  expect(scene.mode).not.toHaveBeenCalled();
  expect(screen.getByRole('button', {name: '3D camera'})).toHaveTextContent('Chase');
  for (const key of ['w', 'a']) fireEvent.keyDown(map, {key});
  expect(scene.holdKey).toHaveBeenCalledTimes(4); expect(scene.mode).toHaveBeenLastCalledWith('orbit');
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
  // Nothing focused (after a view switch): the page's keys are the camera's.
  fireEvent.keyDown(document.body, {key: '2'}); expect(scene.mode).toHaveBeenLastCalledWith('chase');
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

it('passes the fetched scenery layout to the scene and draws no focus outline on the 3D map', async () => {
  const {map} = await setup();
  expect(vi.mocked(createReplayScene).mock.calls[0][2]).toBe(layout);
  expect(map.className).not.toContain('focus-visible:outline-2');
});

it('supports floating map controls overlay buttons (zoom, center, follow, reset, switch to 2D), leaving play to the header', async () => {
  const onReturnTo2D = vi.fn();
  await setup(onReturnTo2D);
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

  expect(within(screen.getByTestId('map-controls-overlay')).queryByRole('button', {name: 'Play'})).not.toBeInTheDocument();

  const switchBtn = screen.getByRole('button', {name: 'Switch to 2D view'});
  expect(switchBtn).toBeInTheDocument();
  expect(switchBtn).toHaveTextContent('2D');
  fireEvent.click(switchBtn);
  expect(onReturnTo2D).toHaveBeenCalledOnce();
  // R switches back to 2D; E is the camera's turn now.
  const map = document.querySelector<HTMLElement>('[data-replay-view="3d"]')!;
  fireEvent.keyDown(map, {key: 'e'}); expect(onReturnTo2D).toHaveBeenCalledOnce();
  fireEvent.keyDown(map, {key: 'r'}); expect(onReturnTo2D).toHaveBeenCalledTimes(2);
});

it('supports top control buttons (return to 2D, color modes, primary/baseline line fading)', async () => {
  const onReturnTo2D = vi.fn(), onChangeColorBy = vi.fn(), onToggleFadedLine = vi.fn();
  render(
    <View
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

  const line = screen.getByRole('combobox', {name: 'Racing line'});
  expect(line).toHaveTextContent('Speed');
  fireEvent.click(line);
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Off', 'Plain', 'Pedal', 'Speed', 'Delta', 'Gain / Loss']);
  fireEvent.click(screen.getByRole('option', {name: 'Plain'}));
  expect(onChangeColorBy).toHaveBeenCalledWith('default');

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
  expect(modeBar.getByRole('combobox', {name: 'Racing line'})).toBeInTheDocument();
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

it('shows the whole circuit from the camera menu, under the modes', async () => {
  await setup();
  fireEvent.click(screen.getByRole('button', {name: '3D camera'}));
  const whole = screen.getByRole('button', {name: /Whole circuit/});
  expect(whole).toHaveTextContent('9'); expect(whole).not.toHaveAttribute('aria-pressed');
  fireEvent.click(whole);
  expect(scene.overview).toHaveBeenCalledOnce(); expect(scene.mode).toHaveBeenLastCalledWith('orbit');
  expect(screen.queryByRole('group', {name: 'Camera modes'})).not.toBeInTheDocument();
});

it('hands a trackside drag over to orbit, and leaves a click in trackside', async () => {
  const {map} = await setup();
  fireEvent.keyDown(map, {key: '7'}); expect(scene.mode).toHaveBeenLastCalledWith('trackside');
  const track = screen.getByLabelText(/^3D track/);
  fireEvent.pointerDown(track, {clientX: 100, clientY: 100, buttons: 1});
  fireEvent.pointerMove(track, {clientX: 102, clientY: 101, buttons: 1});
  fireEvent.pointerUp(track, {clientX: 102, clientY: 101});
  expect(scene.mode).toHaveBeenLastCalledWith('trackside'); // A click, not a drag.
  fireEvent.pointerMove(track, {clientX: 140, clientY: 100, buttons: 0}); // Hovering moves no camera.
  expect(scene.mode).toHaveBeenLastCalledWith('trackside');
  fireEvent.pointerDown(track, {clientX: 100, clientY: 100, buttons: 1});
  fireEvent.pointerMove(track, {clientX: 110, clientY: 100, buttons: 1});
  expect(scene.mode).toHaveBeenLastCalledWith('orbit');
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
    <View trajectory={trajectory} baseline={trajectory} currentIndex={2} onSelectIndex={vi.fn()}
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
  // Each frame the scene draws first ticks the playing clock to that frame (no pose a frame behind).
  const advance = vi.fn(); cursor.drive(advance);
  (scene.beforeFrame.mock.calls.at(-1)![0] as (frameTime: number) => void)(40);
  expect(advance).toHaveBeenCalledWith(40);
});

it('draws a jump at its new index, never back at the last index the page showed', async () => {
  const cursor = createPlaybackCursor();
  const view = (currentIndex: number) => <ReplayPlaybackCursorContext value={cursor}>
    <View trajectory={trajectory} baseline={trajectory} currentIndex={currentIndex} onSelectIndex={vi.fn()} onReturnTo2D={vi.fn()} />
  </ReplayPlaybackCursorContext>;
  const {rerender} = render(view(1));
  await waitFor(() => expect(scene.cursor).toHaveBeenCalled());
  act(() => cursor.publish(trajectory.points, {index: 4, timeSec: 1}));
  scene.cursor.mockClear();
  // A jump clears the playing clock before the page shows its index: the clock's pose stays until then.
  act(() => cursor.clear());
  expect(scene.cursor).not.toHaveBeenCalled();
  rerender(view(2));
  expect(scene.cursor.mock.calls).toEqual([[2, 0]]);
});

it('repeats a picked corner from its entry, keeping the camera until the corner view is asked for', async () => {
  const cursor = createPlaybackCursor(), onSelectIndex = vi.fn(), onLeaveCorner = vi.fn(), onChangeSpeed = vi.fn();
  const corner = {type: 'corner', cornerNumber: 4, entryDistM: 1, primaryBrakingDistM: null, minDistM: 3, baselineMinDistM: 2.5,
    primaryThrottleOnDistM: 4, exitDistM: 5, timeDeltaSec: 0.25} as CornerSegmentComparison;
  const controls = {playback: {speed: 1, speeds: [0.5, 1], onChangeSpeed}} as unknown as ReplayFullscreenControls;
  const view = (active: boolean) => <ReplayPlaybackCursorContext.Provider value={cursor}><ReplayFullscreenControlsContext.Provider value={controls}>
    <View trajectory={trajectory} baseline={trajectory} currentIndex={0} onSelectIndex={onSelectIndex} onReturnTo2D={vi.fn()}
      active={active} focusCorner={corner} onLeaveCorner={onLeaveCorner} />
  </ReplayFullscreenControlsContext.Provider></ReplayPlaybackCursorContext.Provider>;
  const {rerender} = render(view(true));
  await waitFor(() => expect(screen.getByTestId('replay-3d-toolbar').title).toMatch(/Textured car/));
  expect(onSelectIndex).toHaveBeenLastCalledWith(1);
  expect(cursor.loopOf(trajectory.points)).toEqual({points: trajectory.points, start: 1, end: 5});
  expect(scene.mode).not.toHaveBeenCalledWith('orbit');
  // Each lap's driving marks lie on its line; a point the lap lacks (no braking here) is left out.
  expect(scene.showMarks).toHaveBeenLastCalledWith([{lap: 'primary', kind: 'apex', distM: 3}, {lap: 'primary', kind: 'throttle', distM: 4},
    {lap: 'baseline', kind: 'apex', distM: 2.5}]);
  const bar = screen.getByTestId('corner-focus-bar');
  expect(within(bar).getByText('T4')).toBeInTheDocument();
  expect(within(bar).getByText('+0.250s')).toBeInTheDocument();
  fireEvent.click(within(bar).getByRole('button', {name: /Slow/}));
  expect(onChangeSpeed).toHaveBeenCalledWith(0.5);
  fireEvent.click(within(bar).getByRole('button', {name: /Corner view/}));
  await waitFor(() => expect(scene.frameStretch).toHaveBeenCalledWith(trajectory.points, 1, 5, 3));
  expect(scene.mode).toHaveBeenLastCalledWith('orbit');
  // Asked again after orbiting away, the corner view is placed again.
  fireEvent.click(within(bar).getByRole('button', {name: /Corner view/}));
  await waitFor(() => expect(scene.frameStretch).toHaveBeenCalledTimes(2));
  fireEvent.click(within(bar).getByRole('button', {name: /Loop/}));
  expect(cursor.loopOf(trajectory.points)).toBeNull();
  fireEvent.click(within(bar).getByRole('button', {name: 'Leave corner focus'}));
  expect(onLeaveCorner).toHaveBeenCalledOnce();
  // Hidden behind the 2D map, the view neither shows the bar nor loops.
  fireEvent.click(within(bar).getByRole('button', {name: /Loop/}));
  expect(cursor.loopOf(trajectory.points)).not.toBeNull();
  rerender(view(false));
  expect(screen.queryByTestId('corner-focus-bar')).toBeNull();
  expect(cursor.loopOf(trajectory.points)).toBeNull();
  expect(scene.showMarks).toHaveBeenLastCalledWith(null);
});

it('stands the bottom trace as curtains in place of the lines with its 3D button, remembered; off brings the lines back', async () => {
  localStorage.removeItem('lmu-3d-trace-shown-v1'); localStorage.setItem('lmu-map-trace-channel-v1', 'speed');
  const {map} = await setup();
  fireEvent.keyDown(map, {key: 'm'});
  const button = screen.getByRole('button', {name: '3D trace'});
  expect(button).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', {name: 'Throttle + Brake'}));
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(localStorage.getItem('lmu-3d-trace-shown-v1')).toBe('true');
  // Both pedals on one curtain: throttle and brake edges on the 0–100 % scale.
  const values = scene.showTrace.mock.calls.at(-1)?.[0] as (lap: ReplayTrajectoryData, baseline: null) => {primary: {edges: number[][]}} | null;
  expect(values(trajectory, null)?.primary.edges).toEqual([trajectory.points.map(() => 0.8), trajectory.points.map(() => 0)]);
  expect(screen.getByTestId('trace-legend')).toHaveTextContent('Throttle + Brake100 % at 3 m · 0 at the road');
  // The curtain follows the bottom trace's channel; a lap without it keeps its line, and says why.
  fireEvent.click(screen.getByRole('combobox', {name: 'More telemetry channels'}));
  fireEvent.click(screen.getByRole('option', {name: 'Steering Force'}));
  expect(screen.getByTestId('trace-legend')).toHaveTextContent('data on this lap: the racing line shows instead');
  // The Line menu says the trace stands in place of the line; picking a line there turns the trace off.
  const line = screen.getByRole('combobox', {name: 'Racing line'});
  expect(line).toHaveTextContent('3D trace');
  fireEvent.click(line); fireEvent.click(screen.getByRole('option', {name: 'Plain'}));
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('combobox', {name: 'Racing line'})).toHaveTextContent('Plain');
  expect(scene.showTrace).toHaveBeenLastCalledWith(null);
  expect(screen.queryByTestId('trace-legend')).not.toBeInTheDocument();
  fireEvent.click(button); fireEvent.click(button);
  expect(screen.queryByRole('combobox', {name: 'Trace'})).toBeNull();
  localStorage.removeItem('lmu-3d-trace-shown-v1'); localStorage.removeItem('lmu-map-trace-channel-v1');
});
