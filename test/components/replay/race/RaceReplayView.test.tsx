import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceReplayView } from '../../../../src/components/replay/race/RaceReplayView.js';
import { loadRace3DView } from '../../../../src/components/replay/race/raceModeContext.js';
import { initialRaceTime, lapAt } from '../../../../src/components/replay/race/raceLaps.js';
import { fetchRaceOverview, fetchRacePoseWindow } from '../../../../src/api/replayApi.js';
import { RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';
import type { RaceReplayOverview } from '../../../../shared/types/index.js';

vi.mock('../../../../src/api/replayApi.js', () => ({ fetchRaceOverview: vi.fn(), fetchRacePoseWindow: vi.fn(), lastRaceOverview: vi.fn(() => null),fetchRaceProgress: vi.fn(() => Promise.reject(Error('No centreline'))),
  fetchSessionTelemetryMetadata: vi.fn(() => Promise.reject(Error('No metadata'))),
  lastSessionTelemetryMetadata: vi.fn(() => null) }));
// The 3D view needs WebGL: a stand-in shows which car it follows and switches back.
vi.mock('../../../../src/components/replay/race/Race3DView.js', () => ({
  default: ({ followSlot, onToggleView }: { followSlot: number | null; onToggleView: () => void }) => (
    <button type="button" data-testid="race-3d" onClick={onToggleView}>3D following {followSlot}</button>),
}));
vi.mock('../../../../src/api/trackGeometryApi.js', () => ({ loadTrackBoundaryGeometry: vi.fn(() => Promise.resolve(null)) }));

const overview: RaceReplayOverview = {
  replayName: 'R1.Vcr', sessionType: 'Race', daylight: { raceStartMinute: null, cloudCover: null, cloudField: null, cloudVariants: null }, startSec: 0, endSec: 200, poseHz: 10, windowSec: 60, trackVenue: 'Nowhere',
  cars: [
    { slot: 1, name: 'Ann', carClass: 'Hyper', carNumber: '7', isPlayer: true, sessionDriverOrdinal: 3, sessionLapOrdinals: { '1': 0, '2': 1 } },
    { slot: 2, name: 'Bea', carClass: 'GT3' },
  ],
  laps: [
    { slot: 1, lapNumber: 1, startSec: 0, endSec: 100, lapTimeSec: 100, isValid: true },
    { slot: 1, lapNumber: 2, startSec: 100, endSec: 200, lapTimeSec: 100, isValid: true },
    { slot: 2, lapNumber: 1, startSec: 0, endSec: 110, lapTimeSec: 110, isValid: true },
  ],
  runningOrder: [{ timeSec: 0, order: [1, 2] }],
  events: [{ kind: 'pit', timeSec: 30, slot: 1, pitLaneSec: 30, serviceSec: 20 }, { kind: 'contact', timeSec: 50, slot: 2, otherSlot: 1, impact: 4 }],
};

/** Both cars drive +X at 10 m/s, car 2 100 m behind. */
function poseWindow(index: number): RacePoseWindow {
  const count = 601;
  const data = new Float32Array(2 * count * RACE_POSE_CHANNEL_COUNT);
  for (let car = 0; car < 2; car++) for (let i = 0; i < count; i++) {
    const t = index * 60 + i / 10;
    // Ann is in the pit lane from 30 to 60 s.
    const inPit = car === 0 && t >= 30 && t < 60 ? 1 : 0;
    data.set([10 * t - car * 100, 0, car * 50, 0, Math.PI / 2, 0, 36, inPit], (car * count + i) * RACE_POSE_CHANNEL_COUNT);
  }
  return { fromSec: index * 60, hz: 10, count, slots: [1, 2], data };
}

describe('RaceReplayView', () => {
  // The 3D view's code loaded first, as the lap view loads it ahead: imported lazily, its stand-in took over a second when other
  // test files ran beside this one.
  beforeAll(async () => { await loadRace3DView(); });
  beforeEach(() => {
    vi.mocked(fetchRaceOverview).mockResolvedValue(overview);
    vi.mocked(fetchRacePoseWindow).mockImplementation((_session, index) => Promise.resolve(poseWindow(index)));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('skips the wait on the grid to the frame the followed car starts from', async () => {
    // Bea pulls away at 70 s, Ann (the player, followed) at 75 s, in the second window.
    vi.mocked(fetchRacePoseWindow).mockImplementation((_session, index) => {
      const window = poseWindow(index);
      for (let i = 0; i < window.count; i++) {
        const t = index * 60 + i / 10;
        if (t < 75) window.data[i * RACE_POSE_CHANNEL_COUNT + 6] = 0;
        if (t < 70) window.data[(window.count + i) * RACE_POSE_CHANNEL_COUNT + 6] = 0;
      }
      return Promise.resolve(window);
    });
    view({ initialTimeSec: 0 });
    fireEvent.click(await screen.findByRole('button', { name: /Skip to start/ }));
    expect(screen.getAllByLabelText('Session time')[0]).toHaveTextContent('1:14.9');
    expect(screen.queryByRole('button', { name: /Skip to start/ })).toBeNull();
    // Following Bea from the start, the skip lands on her start.
    cleanup();
    view({ initialTimeSec: 0, initialSlot: 2 });
    fireEvent.click(await screen.findByRole('button', { name: /Skip to start/ }));
    expect(screen.getAllByLabelText('Session time')[0]).toHaveTextContent('1:09.9');
  });

  it('has nothing to skip when the cars move from the start', async () => {
    view({ initialTimeSec: 0 });
    await screen.findAllByTestId('race-lap-ticks');
    await waitFor(() => expect(fetchRacePoseWindow).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Skip to start/ })).toBeNull();
  });

  /** The race view with its 2D/3D view held as the page holds it (the URL's `view`). */
  function Held(props: Partial<React.ComponentProps<typeof RaceReplayView>>) {
    const [shown, setShown] = useState<'2d' | '3d'>(props.view ?? '2d');
    return <RaceReplayView sessionId="s1" onClose={vi.fn()} onOpenLap={vi.fn()} onStateChange={vi.fn()} initialTimeSec={30} {...props}
      view={shown} onViewChange={next => { setShown(next); props.onViewChange?.(next); }} />;
  }
  const view = (props: Partial<React.ComponentProps<typeof RaceReplayView>> = {}) => render(<Held {...props} />);

  it('shows every car on the map and in the standings, following the player', async () => {
    view();
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    const rows = screen.getAllByRole('button', { pressed: true });
    expect(rows.some(row => row.textContent?.includes('Ann'))).toBe(true);
    expect(screen.getByTestId('race-standings').textContent).toContain('Leader');
    expect(within(screen.getByTestId('race-standings')).getByText('You')).toBeTruthy();
    // The followed car's laps on the timeline; following Bea shows her one lap.
    expect(screen.getByTestId('race-lap-ticks').textContent).toBe('12');
    // The followed car's timing on the map: session time, its lap of the race's, the lap so far.
    const timing = screen.getByRole('complementary', { name: 'Lap and sector timing' });
    expect(screen.getByTestId('race-lap-heading').textContent).toMatch(/Session.*0:30.*Lap 1 \/ 2/);
    expect(within(timing).queryByRole('button', { name: 'Timing' })).toBeNull();
    fireEvent.click(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Bea/ }));
    expect(screen.getByTestId('race-lap-ticks').textContent).toBe('1');
    // The gap column switches between the class leader and the car ahead.
    const gapMode = screen.getByRole('button', { name: 'Gap' });
    fireEvent.click(gapMode);
    expect(screen.getByRole('button', { name: 'Interval' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('fades a car in the pits on the map and in the standings', async () => {
    view({ initialTimeSec: 40 });
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    expect(document.querySelector('[data-race-car="1"]')!.getAttribute('opacity')).toBeNull();
    fireEvent.click(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Bea/ }));
    expect(document.querySelector('[data-race-car="1"]')!.getAttribute('opacity')).toBe('0.4');
    expect(document.querySelector('[data-race-car="2"]')!.getAttribute('opacity')).toBeNull();
    expect(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Ann/ }).className).toContain('opacity-50');
  });

  it('follows a car on the map after a double click in the standings', async () => {
    view();
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    const toolbar = screen.getByTestId('map-controls-overlay');
    const followButton = () => within(toolbar).getAllByRole('button').find(button => /follow/i.test(button.getAttribute('aria-label') ?? button.title))!;
    expect(followButton().getAttribute('aria-pressed')).not.toBe('true');
    fireEvent.doubleClick(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Bea/ }));
    expect(screen.getAllByRole('button', { pressed: true }).some(row => row.textContent?.includes('Bea'))).toBe(true);
    expect(followButton().getAttribute('aria-pressed')).toBe('true');
  });

  it('goes back through the page, not the browser history', async () => {
    const onClose = vi.fn();
    view({ onClose });
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('follows the car picked in the standings and opens its lap in the lap view', async () => {
    const onOpenLap = vi.fn();
    const onStateChange = vi.fn();
    view({ onOpenLap, onStateChange, initialTimeSec: 130 });
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /Lap view/ }));
    expect(onOpenLap).toHaveBeenCalledWith(3, 1, 30); // 30 s into the lap, which starts at 100 s.
    // L does the same from anywhere on the page.
    fireEvent.keyDown(document.body, { key: 'l' });
    expect(onOpenLap).toHaveBeenCalledTimes(2);

    fireEvent.click(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Bea/ }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Lap view/ }).disabled).toBe(true);
    // Nor with a car whose lap the view cannot open.
    fireEvent.keyDown(document.body, { key: 'l' });
    expect(onOpenLap).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith(130, 2));
  });

  it('seeks with the timeline and the arrow keys, and plays with Space', async () => {
    view();
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    const slider = screen.getAllByLabelText('Session time').find(element => element.tagName === 'INPUT')!;
    fireEvent.change(slider, { target: { value: '95' } });
    expect((slider as HTMLInputElement).value).toBe('95');
    act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    expect((slider as HTMLInputElement).value).toBe('100');
    // Ctrl steps 1 s; Ctrl with another key stays the browser's.
    act(() => { fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true }); });
    expect((slider as HTMLInputElement).value).toBe('99');
    act(() => { fireEvent.keyDown(window, { key: 'End', ctrlKey: true }); });
    expect((slider as HTMLInputElement).value).toBe('99');
    act(() => { fireEvent.keyDown(window, { key: ' ' }); });
    expect(screen.getByRole('button', { name: 'Pause (Space)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '4x' }));
    expect(screen.getByRole('button', { name: '4x' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Pause (Space)' }));
  });

  it('takes the lap map toolbar and its keys from anywhere on the page', async () => {
    view();
    const toolbar = await screen.findByTestId('map-controls-overlay');
    expect(within(toolbar).queryByRole('button', { name: 'Full screen map' })).toBeNull();
    const zoom = () => toolbar.textContent;
    const before = zoom();
    act(() => { fireEvent.keyDown(window, { key: '+' }); });
    expect(zoom()).not.toBe(before);
    act(() => { fireEvent.keyDown(window, { key: 'r' }); });
    expect(zoom()).toBe(before);
    const slider = screen.getAllByLabelText('Session time').find(element => element.tagName === 'INPUT') as HTMLInputElement;
    act(() => { fireEvent.keyDown(window, { key: 'End' }); });
    expect(slider.value).toBe('200');
    act(() => { fireEvent.keyDown(window, { key: 'Home' }); });
    expect(slider.value).toBe('0');
    act(() => { fireEvent.keyDown(window, { key: '.' }); });
    expect(screen.getByRole('button', { name: '2x' }).getAttribute('aria-pressed')).toBe('true');
    act(() => { fireEvent.keyDown(window, { key: '?' }); });
    expect(screen.getByRole('dialog', { name: 'Race replay shortcuts' })).toBeTruthy();
    expect(screen.getByRole('dialog')).toHaveTextContent('Switch to the 3D view');
  });

  it('switches to the 3D view with E', async () => {
    view();
    await screen.findByTestId('map-controls-overlay');
    act(() => { fireEvent.keyDown(window, { key: 'e' }); });
    expect((await screen.findByTestId('race-3d')).closest('[hidden]')).toBeNull();
  });

  it('lists the followed car incidents and jumps to just before one', async () => {
    view();
    const incidents = await screen.findByRole('combobox', { name: 'Incidents of the followed car' });
    expect(incidents.textContent).toContain('Incidents (2)');
    incidents.focus();
    fireEvent.click(incidents);
    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Pit stop20.0 s stopped0:30.0', 'ContactBea0:50.0']);
    fireEvent.click(options[1]);
    const slider = screen.getAllByLabelText('Session time').find(element => element.tagName === 'INPUT')!;
    expect((slider as HTMLInputElement).value).toBe('45');
    // The picker lets focus go: the replay's arrows step the clock at once.
    expect(document.activeElement).not.toBe(incidents);
    act(() => { fireEvent.keyDown(document.activeElement ?? window, { key: 'ArrowRight' }); });
    expect((slider as HTMLInputElement).value).toBe('50');
  });

  it('shows the tooltip of a car on the map while its car or standings row is under the pointer', async () => {
    view({ initialTimeSec: 150 });
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerEnter(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Bea/ }));
    expect(screen.getByRole('tooltip').textContent).toContain('Bea');
    expect(screen.getByRole('tooltip').textContent).toContain('P2GT3P1· Lap 1');
    fireEvent.pointerLeave(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Bea/ }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerEnter(document.querySelector('[data-race-car="1"]')!);
    expect(screen.getByRole('tooltip').textContent).toContain('#7Ann (You)');
  });

  it('switches the race between the 2D map and the 3D view, keeping the followed car', async () => {
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to 3D view' }));
    const scene = await screen.findByTestId('race-3d');
    expect(scene.textContent).toBe('3D following 1');
    expect(screen.queryByTestId('race-map-scene')).toBeNull();
    fireEvent.click(scene);
    await waitFor(() => expect(screen.getByTestId('race-map-scene')).toBeTruthy());
    // Kept loaded behind the 2D map, hidden: opening it again does not rebuild it.
    expect(document.querySelector('[data-testid="race-3d"]')?.closest('[hidden]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to 3D view' }));
    expect(screen.getByTestId('race-3d').closest('[hidden]')).toBeNull();
    expect(screen.queryByTestId('race-map-scene')).toBeNull();
  });

  it('renders the app loading indicator while the session replay overview is loading', () => {
    vi.mocked(fetchRaceOverview).mockReturnValueOnce(new Promise(() => {}));
    view();
    expect(screen.getByTestId('race-replay-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading Session Replay')).toBeInTheDocument();
  });

  it('offers a retry when the race replay cannot load', async () => {
    vi.mocked(fetchRaceOverview).mockRejectedValueOnce(new Error('No replay'));
    view();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No replay'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('race replay locators', () => {
  it('opens on the URL time, else the start of the asked lap, else the session start', () => {
    expect(initialRaceTime(overview, 42, 1, 2)).toBe(42);
    expect(initialRaceTime(overview, null, 1, 2)).toBe(100);
    expect(initialRaceTime(overview, null, 9, 9)).toBe(0);
    // The lap view's cursor: seconds into the lap, kept within it.
    expect(initialRaceTime(overview, null, 1, 2, 12.5)).toBe(112.5);
    expect(initialRaceTime(overview, null, 1, 2, -0.01)).toBe(100);
  });

  it('finds the lap a session driver is on', () => {
    expect(lapAt(overview, 1, 150)).toEqual({ driverOrdinal: 3, lapOrdinal: 1, lapNumber: 2, startSec: 100 });
    expect(lapAt(overview, 1, 500)).toEqual({ driverOrdinal: 3, lapOrdinal: 1, lapNumber: 2, startSec: 100 });
    expect(lapAt(overview, 2, 50)).toBeNull();
  });
});
