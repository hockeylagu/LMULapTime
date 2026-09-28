import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CompareLapsPage, findLayoutForTrack } from '../../../src/components/compare-laps/index.js';
import type { LeaderboardLayout } from '../../../shared/types/leaderboard.js';
import { board } from './leaderboard/leaderboardFixtures.js';

const layout = (layoutKey: string, trackName: string, lastDriven: number, classes: Array<[string, number]>): LeaderboardLayout => ({
  layoutKey,
  layoutName: `${trackName} layout`,
  trackName,
  countryCode: 'IT',
  flagEmoji: '🇮🇹',
  lastDriven,
  outlinePath: 'M10 10L90 10L90 90Z',
  lastCarClass: classes[0][0],
  classes: classes.map(([carClass, rank]) => ({
    carClass,
    lastDriven,
    lastCarType: 'Car',
    playerBest: 100 + rank,
    playerRank: rank,
    fieldSize: 20,
  })),
});

const LAYOUTS = [
  layout('daytona_road_course', 'Daytona International Speedway (Road Course)', 3000, [['LMH', 7], ['LMGT3', 12]]),
  layout('monza_gp', 'Autodromo Nazionale Monza', 2000, [['LMGT3', 3]]),
];

const EMPTY_LAPS = {
  laps: [], allTimeBestLap: null, playerBestLap: null, overallTrackBestLap: null,
  bestS1: null, bestS2: null, bestS3: null, theoreticalBestSec: null, benchmarks: [],
};

const urlParams = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');

describe('CompareLapsPage', () => {
  beforeEach(() => {
    window.location.hash = '#/compare';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/leaderboard/layouts')) return Promise.resolve({ ok: true, json: () => Promise.resolve(LAYOUTS) });
      if (url.startsWith('/api/compare/laps')) return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_LAPS) });
      if (url.startsWith('/api/leaderboard?')) {
        const query = new URLSearchParams(url.split('?')[1]);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          layoutKey: query.get('layout'), layoutName: '', carClass: query.get('carClass'), scope: 'class', carType: null,
          entries: [], player: null, benchmark: null,
        }) });
      }
      return Promise.reject(new Error(`Unexpected ${url}`));
    });
  });

  it('opens on the layout driven last, in the class driven last there', async () => {
    render(<CompareLapsPage sessions={[]} />);

    await waitFor(() => expect(urlParams().get('track')).toBe('Daytona International Speedway (Road Course)'));
    expect(urlParams().get('carClass')).toBe('LMH');
    const cards = screen.getAllByRole('button', { pressed: true });
    expect(cards[0]).toHaveTextContent('Daytona International Speedway (Road Course)');
    expect(screen.getByRole('button', { name: /Hypercar\s*P7\/20/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /LMGT3\s*P12\/20/ })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByRole('heading', { name: /Leaderboard · Hypercar/ })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/leaderboard?layout=daytona_road_course&carClass=LMH', expect.anything());
  });

  it('switches track and class from the ribbon, dropping the lap the link asked for', async () => {
    window.location.hash = '#/compare?track=Autodromo%20Nazionale%20Monza&carClass=LMGT3&sessionId=s1&lapNum=4';
    render(<CompareLapsPage sessions={[]} />);

    const daytona = await screen.findByRole('button', { name: /Daytona International Speedway \(Road Course\)/ });
    expect(screen.getByRole('button', { name: /Monza layout/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(daytona);
    await waitFor(() => expect(urlParams().get('track')).toBe('Daytona International Speedway (Road Course)'));
    expect(urlParams().get('carClass')).toBe('LMH');
    expect(urlParams().get('sessionId')).toBeNull();
    expect(urlParams().get('lapNum')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /LMGT3\s*P12\/20/ }));
    await waitFor(() => expect(urlParams().get('carClass')).toBe('LMGT3'));
  });

  it('compares the player best lap with a driver of the board, here or in telemetry', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/leaderboard?')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(board(3, 3)) })
        : defaultFetch(url));
    render(<CompareLapsPage sessions={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compare with Driver 1' }));
    expect(await screen.findByText(/Side-by-Side Lap Telemetry Comparison \(2\/2\)/)).toBeInTheDocument();
    expect(screen.getByText('Active Baseline Lap:').nextElementSibling).toHaveTextContent('Driver 1 — 1:40.000');
    expect(screen.getAllByText('⭐ Your best').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Telemetry against Driver 1' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/telemetry\?/));
    expect(urlParams().get('replayName')).toBe('Me.Vcr');
    expect(urlParams().get('baselineReplay')).toBe('Driver 1.Vcr');
  });

  it('says why when the tracks cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Database is locked' }) });
    render(<CompareLapsPage sessions={[]} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is locked');
  });
});

describe('findLayoutForTrack', () => {
  it('finds the layout by the track name the app uses, or by its circuit', () => {
    expect(findLayoutForTrack(LAYOUTS, 'Autodromo Nazionale Monza')?.layoutKey).toBe('monza_gp');
    expect(findLayoutForTrack(LAYOUTS, 'monza_gp')?.layoutKey).toBe('monza_gp');
    expect(findLayoutForTrack(LAYOUTS, 'Monza Curva Grande Circuit')).toBeNull();
    expect(findLayoutForTrack(LAYOUTS, null)).toBeNull();
  });
});
