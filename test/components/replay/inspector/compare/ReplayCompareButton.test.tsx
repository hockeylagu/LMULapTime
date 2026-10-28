import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReplayCompareButton } from '../../../../../src/components/replay/inspector/compare/ReplayCompareButton.js';
import type { ComparableLap, ReplayDriverEntry, ReplayMetadata, ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import { requestUrl } from '../../../../fixtures/requestUrl.js';

const RACE = 'race-session';
const PRACTICE = 'practice-session';
const ME = 'Samuel Lague';

function lap(sessionId: string, lapNumber: number, lapTime: number, extra: Partial<ComparableLap> = {}): ComparableLap {
  return {
    id: `${sessionId}_${lapNumber}`, sessionId, driverName: ME, carType: 'Peugeot 9x8', carClass: 'Hyper',
    lapNumber, lapTime, s1: null, s2: null, s3: null, topSpeed: null, isValid: true, matchingReplayFile: `${sessionId}.Vcr`,
    ...extra,
  };
}

const driver: ReplayDriverEntry = { slot: 1, name: ME, isPlayer: true, carType: 'Peugeot 9x8', carClass: 'Hyper', sessionDriverOrdinal: 0 };
const metadata = { filename: 'r.Vcr', trackVenue: 'Daytona', trackCourse: 'Road Course', drivers: [driver] } as unknown as ReplayMetadata;
const trajectory = (lapTime: number) => ({
  currentLap: 20, lapOrdinal: 19, driverOrdinal: 0, laps: [{ lapNumber: 20, lapTimeSec: lapTime + 0.01, validatedTimeSec: lapTime }],
}) as unknown as ReplayTrajectoryData;

/** The server returns the fastest matching lap (the filtering is its job). Returns the requests. */
function mockLaps(laps: ComparableLap[]) {
  const urls: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    urls.push(new URL(requestUrl(input), 'http://localhost'));
    return { ok: true, status: 200, json: async () => ({ laps, total: laps.length }) } as Response;
  });
  return urls;
}

function renderButton(lapTime: number, onSelectCompareLap = vi.fn(), rosterDriver: ReplayDriverEntry = driver) {
  render(
    <ReplayCompareButton
      sessionId={RACE} driverName={ME} trajectory={trajectory(lapTime)} metadata={metadata} driver={rosterDriver}
      onToggleCompare={vi.fn()} onSelectCompareLap={onSelectCompareLap}
      formatLapTime={(sec) => (sec ? sec.toFixed(3) : '')}
    />
  );
  return onSelectCompareLap;
}

describe('ReplayCompareButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks the server once for the driver fastest representative lap in the class, any car, whatever the picker shows', async () => {
    const urls = mockLaps([lap(PRACTICE, 24, 95.658)]);
    const onSelectCompareLap = renderButton(95.894);

    fireEvent.click(await screen.findByText('vs your best 95.658'));
    expect(onSelectCompareLap).toHaveBeenCalledWith(expect.objectContaining({ lapNumber: 24, sessionId: PRACTICE }));
    expect(urls).toHaveLength(1);
    const query = urls[0].searchParams;
    expect(urls[0].pathname).toBe('/api/compare/laps');
    expect(Object.fromEntries(['track', 'trackVenue', 'carClass', 'driver', 'driverExact', 'sort', 'representativeOnly', 'telemetryOnly',
      'playerOnly', 'excludeSessionId', 'excludeLapOrdinal', 'pageSize'].map(key => [key, query.get(key)]))).toEqual({
      track: 'Daytona', trackVenue: 'Daytona', carClass: 'Hyper', driver: ME, driverExact: 'true', sort: 'lap',
      representativeOnly: 'true', telemetryOnly: 'true', playerOnly: 'true', excludeSessionId: RACE, excludeLapOrdinal: '19', pageSize: '1',
    });
    // No session lap or page is needed to find the car, and the lap on screen is left out by the server.
    expect(query.has('sessionId')).toBe(false);
    expect(query.has('carType')).toBe(false);
    expect(query.has('page')).toBe(false);
  });

  it('suggests nothing when the server has no other lap', async () => {
    const urls = mockLaps([]);
    renderButton(95.894);
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(screen.queryByText(/vs your best/)).not.toBeInTheDocument();
  });

  it('suggests nothing when the best lap does not beat the lap on screen', async () => {
    const urls = mockLaps([lap(PRACTICE, 24, 96)]);
    renderButton(95.5);
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(screen.queryByText(/vs your best/)).not.toBeInTheDocument();
  });

  it('suggests a faster lap of the class in another car', async () => {
    mockLaps([lap(PRACTICE, 24, 95.658, { carType: 'Toyota GR010' })]);
    const onSelectCompareLap = renderButton(95.894);
    fireEvent.click(await screen.findByText('vs your best 95.658'));
    expect(onSelectCompareLap).toHaveBeenCalledWith(expect.objectContaining({ carType: 'Toyota GR010' }));
  });

  it('makes no request without a car class, so it never crosses classes', async () => {
    const urls = mockLaps([lap(PRACTICE, 24, 95.658)]);
    renderButton(95.894, vi.fn(), { ...driver, carType: undefined, carClass: undefined });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(urls).toHaveLength(0);
    expect(screen.queryByText(/vs your best/)).not.toBeInTheDocument();
  });
});
