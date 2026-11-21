import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sequenceMapsChanged } from '../../../../src/api/cornerSequenceApi.js';
import { fetchSessionSequencePasses } from '../../../../src/api/replayApi.js';
import { RaceCornerCard } from '../../../../src/components/replay/cornerCard/RaceCornerCard.js';
import { CornerCardButton } from '../../../../src/components/replay/cornerCard/CornerInsightCard.js';
import { forgetCornerInsightIndex } from '../../../../src/components/replay/cornerCard/useCornerInsightIndex.js';
import { createRaceClock } from '../../../../src/components/replay/race/raceClock.js';
import type { CornerPass, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';

vi.mock('../../../../src/api/replayApi.js', () => ({ fetchSessionSequencePasses: vi.fn() }));

// Entries between two tenths, as real ones are: the clock's rounded-down tenth there is still before the entry.
const pass = (lapNumber: number, timeSec: number): CornerPass => ({
  slot: 1, lapNumber, segment: 1, entrySec: lapNumber * 100 + 0.07, minSpeedSec: lapNumber * 100 + 2, exitSec: lapNumber * 100 + 0.07 + timeSec,
  entrySpeedKmh: 250, minSpeedKmh: 100, exitSpeedKmh: 180, minSpeedM: 200, brakeM: 150, turnInM: 170, throttleM: 220,
  aheadSlot: null, aheadGapSec: null, minSpeedGear: null, peakBrake: null, brakeSec: 0, partThrottleSec: null, absSec: 0,
  coastSec: 0,
});
const PASSES: SessionCornerPasses = {
  available: true, layoutKey: 'test', startStationM: 0, trackLengthM: 1000,
  turns: [{ id: 1, label: 'T1', title: 'Turn 1 (official map)', apexM: 200, startM: 100, endM: 300 }],
  cars: [{ slot: 1, name: 'Own', carClass: 'GT3', carNumber: '4' }],
  passes: [2, 3, 4, 5].map((n, i) => pass(n, [4.2, 4.1, 4.0, 4.4][i])),
  laps: [2, 3, 4, 5].map(n => ({ slot: 1, lapNumber: n, startSec: n * 100 - 10, endSec: n * 100 + 90, isValid: true, isPitStop: false, isOutLap: false, wet: false })),
  contacts: [],
};

describe('RaceCornerCard', () => {
  beforeEach(() => {
    forgetCornerInsightIndex();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the followed car\'s pass and moves the clock to a pass of the strip', async () => {
    vi.mocked(fetchSessionSequencePasses).mockResolvedValue(PASSES);
    const clock = createRaceClock(0, 1000, 405);
    render(<RaceCornerCard sessionId="s1" clock={clock} followSlot={1} active />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the corner times');
    expect(await screen.findByRole('heading', { name: 'T1' })).toHaveAttribute('title', 'Turn 1 (official map)');
    // Lap 4 through T1 in 4.000 s; usual (median of 4.2, 4.1, 4.0, 4.4) 4.15.
    const timeValue = () => screen.getByText('Time').nextElementSibling;
    expect(timeValue()).toHaveTextContent('4.000 s');
    expect(screen.getByText('−0.150', { exact: false })).toHaveClass('text-lmu-gain');
    fireEvent.click(screen.getByRole('button', { name: /^Lap 2:/ }));
    expect(clock.getState().timeSec).toBe(200.07);
    // At the turn's entry: the whole pass of lap 2 shows.
    await waitFor(() => expect(timeValue()).toHaveTextContent('4.200 s'));
  });

  it('asks once for a session however many cards mount before the answer', async () => {
    vi.mocked(fetchSessionSequencePasses).mockResolvedValue(PASSES);
    const clock = createRaceClock(0, 1000, 405);
    render(<><RaceCornerCard sessionId="s1" clock={clock} followSlot={1} active /><RaceCornerCard sessionId="s1" clock={clock} followSlot={1} active /></>);
    expect(await screen.findAllByRole('heading', { name: 'T1' })).toHaveLength(2);
    expect(fetchSessionSequencePasses).toHaveBeenCalledTimes(1);
  });

  it('asks again once a scan or a regeneration may have changed the maps', async () => {
    vi.mocked(fetchSessionSequencePasses).mockResolvedValue(PASSES);
    const clock = createRaceClock(0, 1000, 405);
    const first = render(<RaceCornerCard sessionId="s1" clock={clock} followSlot={1} active />);
    await screen.findByRole('heading', { name: 'T1' });
    first.unmount();
    sequenceMapsChanged();
    render(<RaceCornerCard sessionId="s1" clock={clock} followSlot={1} active />);
    await screen.findByRole('heading', { name: 'T1' });
    expect(fetchSessionSequencePasses).toHaveBeenCalledTimes(2);
  });

  it('says why when the passes are unavailable', async () => {
    vi.mocked(fetchSessionSequencePasses).mockResolvedValue({ available: false, reason: 'Corner times are not built for this replay yet.' });
    render(<RaceCornerCard sessionId="s2" clock={createRaceClock(0, 100)} followSlot={1} active />);
    expect(await screen.findByRole('note')).toHaveTextContent('not built');
  });

  it('closes and opens again with K or its button, in every view at once', async () => {
    vi.mocked(fetchSessionSequencePasses).mockResolvedValue(PASSES);
    render(<><RaceCornerCard sessionId="s1" clock={createRaceClock(0, 1000, 405)} followSlot={1} active /><CornerCardButton /></>);
    await screen.findByRole('heading', { name: 'T1' });
    act(() => { fireEvent.keyDown(window, { key: 'k' }); });
    expect(screen.queryByTestId('corner-insight-card')).toBeNull();
    expect(screen.getByRole('button', { name: 'Corner card' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Corner card' }));
    expect(screen.getByTestId('corner-insight-card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close corner card' }));
    expect(screen.queryByTestId('corner-insight-card')).toBeNull();
    expect(localStorage.getItem('lmu-corner-card-v1')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Corner card' }));
  });
});
