import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSessionSequencePasses } from '../../../../src/api/replayApi.js';
import { LapCornerCard } from '../../../../src/components/replay/cornerCard/LapCornerCard.js';
import { setCornerCardCompare } from '../../../../src/components/replay/cornerCard/cornerCardShown.js';
import { forgetCornerInsightIndex } from '../../../../src/components/replay/cornerCard/useCornerInsightIndex.js';
import { ReplayFullscreenControlsContext, type ReplayFullscreenControls } from '../../../../src/components/replay/inspector/replayFullscreenControls.js';
import type { ReplayLapSummary, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import type { CornerPass, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';

vi.mock('../../../../src/api/replayApi.js', () => ({ fetchSessionSequencePasses: vi.fn() }));

const pass = (lapNumber: number, timeSec: number): CornerPass => ({
  slot: 1, lapNumber, segment: 1, entrySec: lapNumber * 100, minSpeedSec: lapNumber * 100 + 2, exitSec: lapNumber * 100 + timeSec,
  entrySpeedKmh: 250, minSpeedKmh: 100, exitSpeedKmh: 180, minSpeedM: 200, brakeM: 150, turnInM: 170, throttleM: 220,
  aheadSlot: null, aheadGapSec: null, behindSlot: null, behindGapSec: null, minSpeedGear: null, peakBrake: null, brakeSec: 0, partThrottleSec: null, tcSec: 0, absSec: 0,
  coastSec: 0,
});
const PASSES: SessionCornerPasses = {
  available: true, layoutKey: 'test', startStationM: 0, trackLengthM: 1000,
  turns: [{ id: 1, label: 'T1', title: 'Turn 1', apexM: 200, startM: 100, endM: 300 }],
  cars: [{ slot: 1, name: 'Own', carClass: 'GT3', carNumber: '4' }],
  passes: [2, 3, 4].map((n, i) => pass(n, [4.2, 4.1, 4.0][i])),
  laps: [2, 3, 4].map(n => ({ slot: 1, lapNumber: n, startSec: n * 100 - 10, endSec: n * 100 + 90, isValid: true, isPitStop: false, isOutLap: false, wet: false })),
  contacts: [],
};
const TRAJECTORY = { sessionId: 's1', driverSlot: 1, currentLap: 4, timeReference: 'session', points: [] } as unknown as ReplayTrajectoryData;

describe('LapCornerCard', () => {
  beforeEach(() => {
    forgetCornerInsightIndex();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens the lap of a strip cell, from the session laps the view can open', async () => {
    vi.mocked(fetchSessionSequencePasses).mockResolvedValue(PASSES);
    const onSelect = vi.fn();
    const controls = {
      primary: { laps: [2, 4].map(lapNumber => ({ lapNumber }) as ReplayLapSummary), lapNumber: 4, onSelect, isLoading: false, onRetry: vi.fn() },
      onOpenBaselinePicker: vi.fn(), playback: { speed: 1, speeds: [1], onChangeSpeed: vi.fn() },
    } satisfies ReplayFullscreenControls;
    render(<ReplayFullscreenControlsContext.Provider value={controls}>
      <LapCornerCard trajectory={TRAJECTORY} timeSec={402} active />
    </ReplayFullscreenControlsContext.Provider>);
    expect(await screen.findByRole('heading', { name: 'T1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Lap 2:/ }));
    // At the turn's entry on lap 2: 200 s on the replay clock, the lap starting at 190 s.
    expect(onSelect).toHaveBeenCalledWith(2, { replaySec: 200, lapStartSec: 190 });
    // The lap shown, and a lap without telemetry, stay put.
    fireEvent.click(screen.getByRole('button', { name: /^Lap 4:/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Lap 3:/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('measures against the compare lap of another session, and switches back to the usual', async () => {
    setCornerCardCompare(true);
    // The compare lap: car #7's lap 5 in session s2, 0.1 s faster on the way in, braking 10 m later, 4 km/h more at the apex.
    const theirs: CornerPass = { ...pass(5, 3.9), slot: 2, minSpeedSec: 501.9, minSpeedKmh: 104, brakeM: 160 };
    const other: SessionCornerPasses = { ...PASSES, cars: [{ slot: 2, name: 'Other', carClass: 'GT3', carNumber: '7' }], passes: [theirs], laps: [] };
    vi.mocked(fetchSessionSequencePasses).mockImplementation(sessionId => Promise.resolve(sessionId === 's2' ? other : PASSES));
    const baseline = { sessionId: 's2', driverSlot: 2, currentLap: 5 } as unknown as ReplayTrajectoryData;
    render(<LapCornerCard trajectory={TRAJECTORY} baseline={baseline} timeSec={402} active />);
    expect((await screen.findAllByText('#7 L5')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('3.900 s')).toBeInTheDocument();
    // The pass's +0.100 s, all of it on the way in.
    expect(screen.getAllByText('+0.100')).toHaveLength(2);
    expect(screen.getByText('±0.000')).toBeInTheDocument();
    expect(screen.getByText('−4')).toBeInTheDocument();
    expect(screen.getByText('brakes 10 m later, +4 km/h min')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Usual' }));
    expect(screen.queryByText('#7 L5')).not.toBeInTheDocument();
    expect(screen.getAllByText('vs usual').length).toBeGreaterThan(0);
  });

  it('says the compare lap is loading, then why its session has no corner times, asking again on the next mount', async () => {
    setCornerCardCompare(true);
    let answer!: (passes: SessionCornerPasses) => void;
    vi.mocked(fetchSessionSequencePasses).mockImplementation(sessionId => (sessionId === 's2'
      ? new Promise(resolve => { answer = resolve; }) : Promise.resolve(PASSES)));
    const baseline = { sessionId: 's2', driverSlot: 2, currentLap: 5 } as unknown as ReplayTrajectoryData;
    const view = render(<LapCornerCard trajectory={TRAJECTORY} baseline={baseline} timeSec={402} active />);
    expect(await screen.findByText("Loading the compare lap's corner times…")).toBeInTheDocument();
    await act(async () => answer({ available: false, reason: 'Corner times are not built.' }));
    expect(screen.getByText('The compare lap: Corner times are not built.')).toBeInTheDocument();
    view.unmount();
    render(<LapCornerCard trajectory={TRAJECTORY} baseline={baseline} timeSec={402} active />);
    await waitFor(() => expect(vi.mocked(fetchSessionSequencePasses).mock.calls.filter(([id]) => id === 's2')).toHaveLength(2));
  });

  it('has no switch without a compare lap', async () => {
    vi.mocked(fetchSessionSequencePasses).mockResolvedValue(PASSES);
    render(<LapCornerCard trajectory={TRAJECTORY} timeSec={402} active />);
    expect(await screen.findByRole('heading', { name: 'T1' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Measure against' })).not.toBeInTheDocument();
  });
});
