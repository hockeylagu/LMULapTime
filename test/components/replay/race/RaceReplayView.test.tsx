import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceReplayView, initialRaceTime, lapAt } from '../../../../src/components/replay/race/RaceReplayView.js';
import { fetchRaceOverview, fetchRacePoseWindow } from '../../../../src/api/replayApi.js';
import { RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';
import type { RaceReplayOverview } from '../../../../shared/types/index.js';

vi.mock('../../../../src/api/replayApi.js', () => ({ fetchRaceOverview: vi.fn(), fetchRacePoseWindow: vi.fn() }));
vi.mock('../../../../src/api/trackGeometryApi.js', () => ({ loadTrackBoundaryGeometry: vi.fn(() => Promise.resolve(null)) }));

const overview: RaceReplayOverview = {
  replayName: 'R1.Vcr', sessionType: 'Race', startSec: 0, endSec: 200, poseHz: 10, windowSec: 60, trackVenue: 'Nowhere',
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
    data.set([10 * t - car * 100, 0, car * 50, 0, Math.PI / 2, 0, 36], (car * count + i) * RACE_POSE_CHANNEL_COUNT);
  }
  return { fromSec: index * 60, hz: 10, count, slots: [1, 2], data };
}

describe('RaceReplayView', () => {
  beforeEach(() => {
    vi.mocked(fetchRaceOverview).mockResolvedValue(overview);
    vi.mocked(fetchRacePoseWindow).mockImplementation((_session, index) => Promise.resolve(poseWindow(index)));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const view = (props: Partial<React.ComponentProps<typeof RaceReplayView>> = {}) => render(
    <RaceReplayView sessionId="s1" onClose={vi.fn()} onOpenLap={vi.fn()} onStateChange={vi.fn()} initialTimeSec={30} {...props} />);

  it('shows every car on the map and in the standings, following the player', async () => {
    view();
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    const rows = screen.getAllByRole('button', { pressed: true });
    expect(rows.some(row => row.textContent?.includes('Ann'))).toBe(true);
    expect(screen.getByTestId('race-standings').textContent).toContain('Leader');
    expect(screen.getByText('Race replay')).toBeTruthy();
  });

  it('follows the car picked in the standings and opens its lap in the lap view', async () => {
    const onOpenLap = vi.fn();
    const onStateChange = vi.fn();
    view({ onOpenLap, onStateChange, initialTimeSec: 130 });
    await waitFor(() => expect(document.querySelectorAll('[data-race-car]')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /Lap view/ }));
    expect(onOpenLap).toHaveBeenCalledWith(3, 1);

    fireEvent.click(within(screen.getByTestId('race-standings')).getByRole('button', { name: /Bea/ }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Lap view/ }).disabled).toBe(true);
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith(130, 2));
  });

  it('seeks with the timeline and the arrow keys, and plays with Space', async () => {
    view();
    await waitFor(() => expect(screen.getByTestId('race-playback')).toBeTruthy());
    const slider = screen.getAllByLabelText('Session time').find(element => element.tagName === 'INPUT')!;
    fireEvent.change(slider, { target: { value: '95' } });
    expect((slider as HTMLInputElement).value).toBe('95');
    act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    expect((slider as HTMLInputElement).value).toBe('100');
    act(() => { fireEvent.keyDown(window, { key: ' ' }); });
    expect(screen.getByRole('button', { name: 'Pause (Space)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '4x' }));
    expect(screen.getByRole('button', { name: '4x' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Pause (Space)' }));
  });

  it('lists the followed car incidents and jumps to just before one', async () => {
    view();
    const incidents = await screen.findByRole('combobox', { name: 'Incidents of the followed car' });
    expect(incidents.textContent).toContain('Incidents (2)');
    fireEvent.click(incidents);
    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Pit stop20.0 s stopped0:30.0', 'ContactBea0:50.0']);
    fireEvent.click(options[1]);
    const slider = screen.getAllByLabelText('Session time').find(element => element.tagName === 'INPUT')!;
    expect((slider as HTMLInputElement).value).toBe('47');
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
  });

  it('finds the lap a session driver is on', () => {
    expect(lapAt(overview, 1, 150)).toEqual({ driverOrdinal: 3, lapOrdinal: 1, lapNumber: 2 });
    expect(lapAt(overview, 1, 500)).toEqual({ driverOrdinal: 3, lapOrdinal: 1, lapNumber: 2 });
    expect(lapAt(overview, 2, 50)).toBeNull();
  });
});
