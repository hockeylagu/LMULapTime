import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CompareLaps } from '../../../../src/components/leaderboard/index.js';
import type { ComparableLap } from '../../../../shared/types/index.js';

const lap = (sessionId: string, sessionType: string, hour: number, lapNum: number, lapTime: number, lapTimeString: string): ComparableLap => ({
  id: `${sessionId}_Me_lap_${lapNum}`,
  sessionId,
  sessionName: sessionType,
  sessionType,
  timestamp: Date.parse(`2026-09-20T${String(hour).padStart(2, '0')}:00:00`),
  dateString: `2026/09/20 ${hour}:00`,
  driverName: 'Me',
  carType: 'Ferrari 296 GT3',
  carClass: 'LMGT3',
  lapNum,
  lapTime,
  lapTimeString,
  s1: 30, s2: 45, s3: lapTime - 75,
  topSpeed: null,
  isValid: true,
  isPlayer: true,
});

const laps = [
  lap('quali', 'Qualifying', 14, 1, 125, '2:05.000'),
  lap('quali', 'Qualifying', 14, 2, 120.4, '2:00.400'),
  lap('race', 'Race', 16, 1, 126, '2:06.000'),
  lap('race', 'Race', 16, 2, 121.9, '2:01.900'),
  lap('race', 'Race', 16, 3, 121.6, '2:01.600'),
  lap('old', 'Practice', 9, 2, 119.8, '1:59.800'),
];
const sessions = [{ id: 'race', trackVenue: 'Spa', trackCourse: 'GP', sessionType: 'Race', sessionName: 'Race' }];

describe('CompareLapPicker in the compare card', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '#leaderboard';
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        laps,
        allTimeBestLap: null,
        playerBestLap: { ...laps[5], tag: 'Personal best' },
        overallTrackBestLap: null,
        bestS1: null, bestS2: null, bestS3: null,
        theoreticalBestSec: null,
        benchmarks: [],
      }),
    }));
  });

  it('opens on a session lap with the picker, and puts the event’s qualifying best in place of the personal best', async () => {
    render(<CompareLaps sessions={sessions} initialTrack="Spa" initialCarClass="LMGT3" initialSessionId="race" initialLapNum={3} />);

    const picker = await screen.findByRole('region', { name: 'Choose a lap' });
    expect(within(picker).getByRole('heading', { name: /Replace Personal best 1:59\.800/ })).toBeInTheDocument();
    const quick = within(picker).getByRole('group', { name: 'Quick picks' });
    fireEvent.click(within(quick).getByRole('button', { name: /Best in qualifying \(same event\)/ }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Choose a lap' })).not.toBeInTheDocument());
    const deck = screen.getByRole('region', { name: 'Compare laps' });
    expect(within(deck).getAllByText('2:00.400').length).toBeGreaterThan(0);
    expect(within(deck).getAllByText('2:01.600').length).toBeGreaterThan(0);
    expect(within(deck).queryByText('1:59.800')).not.toBeInTheDocument();
  });

  it("picks a session's best lap from the best column", async () => {
    render(<CompareLaps sessions={sessions} initialTrack="Spa" initialCarClass="LMGT3" initialSessionId="race" initialLapNum={3} />);
    const picker = await screen.findByRole('region', { name: 'Choose a lap' });
    fireEvent.click(within(picker).getByRole('button', { name: /Best lap 2 2:00\.400, -1\.200/ }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Choose a lap' })).not.toBeInTheDocument());
    expect(screen.getAllByText('2:00.400').length).toBeGreaterThan(0);
    expect(screen.queryByText('1:59.800')).not.toBeInTheDocument();
  });

  it('changes one compared lap for any lap of a session, and fills the empty slot', async () => {
    render(<CompareLaps sessions={sessions} initialTrack="Spa" initialCarClass="LMGT3" initialSessionId="race" initialLapNum={3} />);
    const picker = await screen.findByRole('region', { name: 'Choose a lap' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Close the lap picker' }));

    // Remove the personal best: the empty slot offers the picker.
    fireEvent.click(screen.getAllByTitle('Remove from comparison')[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a lap' }));
    const sessionsList = within(await screen.findByRole('region', { name: 'Choose a lap' })).getByRole('list', { name: 'Sessions' });
    // The race's own lap is compared already; its start lap is not clean.
    expect(within(sessionsList).getByRole('button', { name: /Lap 3 2:01\.600.*compared/ })).toBeDisabled();
    expect(within(sessionsList).queryByRole('button', { name: /Lap 1 2:06\.000/ })).not.toBeInTheDocument();
    fireEvent.click(within(sessionsList).getByRole('button', { name: /Lap 2 2:00\.400/ }));
    await waitFor(() => expect(screen.getAllByTitle('Remove from comparison')).toHaveLength(2));

    // Change the qualifying lap for the race's lap 2.
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[1]);
    const qualiOnly = await screen.findByRole('region', { name: 'Choose a lap' });
    fireEvent.click(within(qualiOnly).getByRole('button', { name: 'Race' }));
    fireEvent.click(within(qualiOnly).getByRole('button', { name: /Lap 2 2:01\.900/ }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Choose a lap' })).not.toBeInTheDocument());
    expect(screen.getAllByText('2:01.900').length).toBeGreaterThan(0);
    expect(screen.queryByText('2:00.400')).not.toBeInTheDocument();
  });
});
