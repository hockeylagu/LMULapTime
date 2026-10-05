import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { LeaderboardPage, findLayoutForTrack } from '../../../src/components/leaderboard/index.js';
import type { LeaderboardLayout } from '../../../shared/types/leaderboard.js';
import { board } from './board/leaderboardFixtures.js';

const layout = (layoutKey: string, trackName: string, lastDriven: number, classes: Array<[string, number]>): LeaderboardLayout => ({
  layoutKey,
  layoutName: `${trackName} layout`,
  trackName,
  circuitName: trackName.replace(/ \(.*\)$/, ''),
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
  layout('bahrain_gp', 'Bahrain International Circuit', 1000, [['LMP3', 2], ['LMH', 5]]),
];

const EMPTY_LAPS = {
  laps: [], allTimeBestLap: null, playerBestLap: null, overallTrackBestLap: null,
  bestS1: null, bestS2: null, bestS3: null, theoreticalBestSec: null, benchmarks: [],
};

const urlParams = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '');

describe('LeaderboardPage', () => {
  beforeEach(() => {
    window.location.hash = '#/leaderboard';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/leaderboard/layouts')) return Promise.resolve({ ok: true, json: () => Promise.resolve(LAYOUTS) });
      if (url.startsWith('/api/compare/laps')) return Promise.resolve({ ok: true, json: () => Promise.resolve(EMPTY_LAPS) });
      if (url.startsWith('/api/rivals?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          rival: null, rivalEntry: null, gap: null, progress: null, theoreticalGap: null, beaten: [], nextUp: [], trend: [],
        }) });
      }
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
    render(<LeaderboardPage sessions={[]} />);

    await waitFor(() => expect(urlParams().get('track')).toBe('Daytona International Speedway (Road Course)'));
    expect(urlParams().get('carClass')).toBe('LMH');
    const ribbonCard = screen.getByRole('link', { name: /Daytona International Speedway \(Road Course\)/ });
    expect(ribbonCard).toHaveAttribute('aria-pressed', 'true');
    // The circuit, then the layout: never the layout twice, nor a flag.
    expect(ribbonCard).toHaveTextContent('Daytona International SpeedwayDaytona International Speedway (Road Course) layout');
    expect(ribbonCard).not.toHaveTextContent('🇮🇹');
    expect(screen.getByRole('button', { name: /Hypercar\s*P7\/20/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /LMGT3\s*P12\/20/ })).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByRole('heading', { name: /Hypercar board/ })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/leaderboard?layout=daytona_road_course&carClass=LMH', expect.anything());
  });

  it.each(['', '&carClass=All'])('selects the chosen track default class when the class is missing or All (%s)', async classQuery => {
    window.location.hash = `#/leaderboard?track=Bahrain%20International%20Circuit${classQuery}`;
    render(<LeaderboardPage sessions={[]} />);

    expect(await screen.findByRole('heading', { name: /LMP3 board/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /LMP3\s*P2\/20/ })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(urlParams().get('carClass')).toBe('LMP3'));
    expect(global.fetch).toHaveBeenCalledWith('/api/leaderboard?layout=bahrain_gp&carClass=LMP3', expect.anything());
  });

  it('defaults an explicit All track sentinel and preserves a valid track/class deep link', async () => {
    window.location.hash = '#/leaderboard?track=All';
    const { unmount } = render(<LeaderboardPage sessions={[]} />);
    await waitFor(() => expect(urlParams().get('track')).toBe(LAYOUTS[0].trackName));
    expect(urlParams().get('carClass')).toBe('LMH');
    unmount();

    window.location.hash = '#/leaderboard?track=Bahrain%20International%20Circuit&carClass=LMH&sessionId=s1';
    render(<LeaderboardPage sessions={[]} />);
    expect(await screen.findByRole('heading', { name: /Hypercar board/ })).toBeInTheDocument();
    expect(urlParams().get('carClass')).toBe('LMH');
    expect(urlParams().get('sessionId')).toBe('s1');
  });

  it('switches track and class from the ribbon, dropping the lap the link asked for', async () => {
    window.location.hash = '#/leaderboard?track=Autodromo%20Nazionale%20Monza&carClass=LMGT3&sessionId=s1&lapNum=4';
    render(<LeaderboardPage sessions={[]} />);

    const daytona = await screen.findByRole('link', { name: /Daytona International Speedway \(Road Course\)/ });
    expect(screen.getByRole('link', { name: /Monza layout/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(daytona);
    await waitFor(() => expect(urlParams().get('track')).toBe('Daytona International Speedway (Road Course)'));
    expect(urlParams().get('carClass')).toBe('LMH');
    expect(urlParams().get('sessionId')).toBeNull();
    expect(urlParams().get('lapNum')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /LMGT3\s*P12\/20/ }));
    await waitFor(() => expect(urlParams().get('carClass')).toBe('LMGT3'));
  });

  it('compares the player best lap with a driver of the board, here or in telemetry', async () => {
    const fetchMock = vi.mocked(global.fetch);
    const defaultFetch = fetchMock.getMockImplementation() as (url: string) => Promise<Response>;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      return url.startsWith('/api/leaderboard?')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(board(3, 3)) } as Response)
        : defaultFetch(url);
    });
    render(<LeaderboardPage sessions={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compare with Driver 1' }));
    expect(await screen.findAllByTitle('Remove from comparison')).toHaveLength(2);
    expect(screen.getByTestId('compare-baseline')).toHaveTextContent(/Driver 1.*1:40\.000/);
    expect(screen.getAllByText('Your best').length).toBeGreaterThan(0);
    // The baseline card is labelled, not framed.
    expect(screen.getByRole('region', { name: 'Compare laps' }).querySelector('.border-lmu-accent')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Compare laps' })).getByRole('button', { name: "Where's the time?" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Pick Driver 1's lap to compare" })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: "Pick Driver 2's lap to compare" })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('link', { name: 'Telemetry against Driver 1' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/telemetry\?/));
    expect(urlParams().get('replayName')).toBe('Me.Vcr');
    expect(urlParams().get('baselineReplay')).toBe('Driver 1.Vcr');
  });

  it("opens the player's own lap in telemetry, alone, and its session", async () => {
    const fetchMock = vi.mocked(global.fetch);
    const defaultFetch = fetchMock.getMockImplementation() as (url: string) => Promise<Response>;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      return url.startsWith('/api/leaderboard?')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(board(3, 3)) } as Response)
        : defaultFetch(url);
    });
    const onSelectSession = vi.fn();
    render(<LeaderboardPage sessions={[]} onSelectSession={onSelectSession} />);

    fireEvent.click(await screen.findByRole('link', { name: 'Open the session of your best lap' }));
    expect(onSelectSession).toHaveBeenCalledWith('s-Me');

    fireEvent.click(screen.getByRole('link', { name: 'Telemetry of your best lap' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/telemetry\?/));
    expect(urlParams().get('replayName')).toBe('Me.Vcr');
    expect(urlParams().get('lap')).toBe('3');
    expect(urlParams().has('baselineReplay')).toBe(false);
  });

  it('compares two drivers picked on the board, neither of them the player', async () => {
    const fetchMock = vi.mocked(global.fetch);
    const defaultFetch = fetchMock.getMockImplementation() as (url: string) => Promise<Response>;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      return url.startsWith('/api/leaderboard?')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(board(3, 3)) } as Response)
        : defaultFetch(url);
    });
    render(<LeaderboardPage sessions={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: "Pick Driver 1's lap to compare" }));
    fireEvent.click(screen.getByRole('button', { name: "Pick Driver 2's lap to compare" }));
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));
    expect(screen.getByTestId('compare-baseline')).toHaveTextContent(/Driver 1.*1:40\.000/);
    expect(screen.getByRole('button', { name: "Pick Driver 2's lap to compare" })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: "Pick Driver 2's lap to compare" }));
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(1));
  });

  it('shows the rival of the board and asks the server to pin the next one', async () => {
    const b = board(5, 5);
    const rivalStatus = {
      rival: { id: 1, kind: 'driver', driverName: 'Driver 4', targetTime: 100.3, startTime: 100.4, pinned: false, status: 'active', setAt: 1, endedAt: null, beatenTime: null, beatenSessionId: null },
      rivalEntry: b.entries[3], gap: 0.1, progress: 0, theoreticalGap: 0.1, beaten: [], nextUp: [b.entries[2]], trend: [],
    };
    const fetchMock = vi.mocked(global.fetch);
    const defaultFetch = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.startsWith('/api/leaderboard?')) return Promise.resolve({ ok: true, json: () => Promise.resolve(b) } as Response);
      if (url.startsWith('/api/rivals')) return Promise.resolve({ ok: true, json: () => Promise.resolve(rivalStatus) } as Response);
      return defaultFetch(url, init);
    });
    render(<LeaderboardPage sessions={[]} />);

    const rivalCard = await screen.findByRole('region', { name: 'Your rival' });
    expect(rivalCard).toHaveTextContent('Driver 4');
    fireEvent.click(within(rivalCard).getByRole('button', { name: 'Make Driver 3 your rival' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/rivals/pin', expect.objectContaining({ method: 'POST' })));
    const pinCall = fetchMock.mock.calls.find(([u]) => u === '/api/rivals/pin');
    expect(JSON.parse(String(pinCall?.[1]?.body))).toEqual({ layout: 'daytona_road_course', carClass: 'LMH', driverName: 'Driver 3' });
  });

  it('says why when the tracks cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Database is locked' }) });
    render(<LeaderboardPage sessions={[]} />);
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
