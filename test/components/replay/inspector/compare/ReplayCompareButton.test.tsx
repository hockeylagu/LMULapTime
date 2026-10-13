import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReplayCompareButton } from '../../../../../src/components/replay/inspector/compare/ReplayCompareButton.js';
import type { ComparableLap, ReplayDriverEntry, ReplayMetadata, ReplayTrajectoryData } from '../../../../../shared/types/index.js';

const RACE = 'race-session';
const PRACTICE = 'practice-session';
const ME = 'Samuel Lague';

function lap(sessionId: string, lapNumber: number, lapTime: number, extra: Partial<ComparableLap> = {}): ComparableLap {
  return {
    id: `${sessionId}_${lapNumber}`, sessionId, driverName: ME, carType: 'Peugeot 9x8', carClass: 'Hyper',
    lapNumber, lapTime, s1: null, s2: null, s3: null, topSpeed: null, isValid: true, matchingReplayFile: `${sessionId}.Vcr`,
    ...extra,
  } as ComparableLap;
}

// The roster names the car as the data package does; the session stores it differently.
const driver: ReplayDriverEntry = { slot: 1, name: ME, isPlayer: true, carType: 'Peugeot 9X8 (package)', carClass: 'Hyper', sessionDriverOrdinal: 0 };
const metadata = { filename: 'r.Vcr', trackVenue: 'Daytona', trackCourse: 'Road Course', drivers: [driver] } as unknown as ReplayMetadata;
const trajectory = (lapTime: number) => ({
  currentLap: 20, driverOrdinal: 0, laps: [{ lapNumber: 20, lapTimeSec: lapTime + 0.01, validatedTimeSec: lapTime }],
}) as unknown as ReplayTrajectoryData;

/** The session's own laps name the car; the other request returns the candidates. Returns the candidate requests. */
function mockLaps(laps: ComparableLap[], sessionCar: string | null = 'Peugeot 9x8') {
  const urls: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input), 'http://localhost');
    const own = url.searchParams.has('driverOrdinal');
    if (!own) urls.push(url);
    const body = own ? { laps: sessionCar ? [lap(RACE, 20, 95.894, { carType: sessionCar })] : [] } : { laps, total: laps.length };
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  return urls;
}

function renderButton(lapTime: number, onSelectCompareLap = vi.fn()) {
  render(
    <ReplayCompareButton
      sessionId={RACE} driverName={ME} trajectory={trajectory(lapTime)} metadata={metadata} driver={driver}
      onToggleCompare={vi.fn()} onSelectCompareLap={onSelectCompareLap}
      formatLapTime={(sec) => (sec ? sec.toFixed(3) : '')}
    />
  );
  return onSelectCompareLap;
}

describe('ReplayCompareButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks the server for the driver fastest representative lap in the inspected car, whatever the picker shows', async () => {
    const urls = mockLaps([lap(PRACTICE, 24, 95.658)]);
    const onSelectCompareLap = renderButton(95.894);

    fireEvent.click(await screen.findByText('vs your best 95.658'));
    expect(onSelectCompareLap).toHaveBeenCalledWith(expect.objectContaining({ lapNumber: 24, sessionId: PRACTICE }));
    const query = urls[0].searchParams;
    expect(urls[0].pathname).toBe('/api/compare/laps');
    expect(Object.fromEntries(['track', 'trackVenue', 'carType', 'carClass', 'driver', 'sort', 'representativeOnly', 'telemetryOnly', 'playerOnly']
      .map(key => [key, query.get(key)]))).toEqual({
      track: 'Daytona', trackVenue: 'Daytona', carType: 'Peugeot 9x8', carClass: 'Hyper', driver: ME, sort: 'lap',
      representativeOnly: 'true', telemetryOnly: 'true', playerOnly: 'true',
    });
    // The car comes from the session, so no page or current-session lap is needed to find it.
    expect(query.has('sessionId')).toBe(false);
    expect(query.has('page')).toBe(false);
  });

  it('skips the lap on screen and suggests the next fastest when it is faster', async () => {
    mockLaps([lap(RACE, 20, 95.894), lap(PRACTICE, 24, 95.9)]);
    renderButton(96.5);
    expect(await screen.findByText('vs your best 95.900')).toBeInTheDocument();
  });

  it('suggests nothing when the lap on screen is already the best', async () => {
    const urls = mockLaps([lap(RACE, 20, 95.894), lap(PRACTICE, 24, 96.2)]);
    renderButton(95.894);
    await waitFor(() => expect(urls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/vs your best/)).not.toBeInTheDocument());
  });

  it('suggests nothing when the best lap does not beat the lap on screen', async () => {
    const urls = mockLaps([lap(PRACTICE, 24, 96)]);
    renderButton(95.5);
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(screen.queryByText(/vs your best/)).not.toBeInTheDocument();
  });

  it('ignores laps of other drivers whose names contain the driver name and laps without a replay', async () => {
    mockLaps([
      lap(PRACTICE, 1, 90, { driverName: `${ME} Jr` }),
      lap(PRACTICE, 2, 91, { matchingReplayFile: undefined }),
      lap(PRACTICE, 3, 95.1),
    ]);
    renderButton(95.894);
    expect(await screen.findByText('vs your best 95.100')).toBeInTheDocument();
  });

  it('uses the car stored with the session laps, not the replay roster name', async () => {
    const urls = mockLaps([lap(PRACTICE, 24, 95.658, { carType: 'Genesis GMR001' })], 'Genesis GMR001');
    renderButton(95.894);
    expect(await screen.findByText('vs your best 95.658')).toBeInTheDocument();
    expect(urls[0].searchParams.get('carType')).toBe('Genesis GMR001');
  });

  it('has no suggestion when the session has no lap naming the car', async () => {
    const urls = mockLaps([lap(PRACTICE, 24, 95.658)], null);
    renderButton(95.894);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(urls).toHaveLength(0);
    expect(screen.queryByText(/vs your best/)).not.toBeInTheDocument();
  });
});
