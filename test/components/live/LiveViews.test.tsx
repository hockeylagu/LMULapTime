import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { LivePage } from '../../../src/components/live/LivePage.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import { FakeEventSource } from '../../helpers/fakeEventSource.js';
import { liveLap, liveSession, liveSnapshot, liveStrategy, liveTiming } from '../../helpers/liveSnapshot.js';

const bar = vi.hoisted(() => ({ renders: 0 }));
vi.mock('../../../src/components/live/LiveSessionBar.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/components/live/LiveSessionBar.js')>();
  return {
    LiveSessionBar: (props: Parameters<typeof original.LiveSessionBar>[0]) => {
      bar.renders += 1;
      return original.LiveSessionBar(props);
    },
  };
});

const source = () => FakeEventSource.byUrl('/api/live/stream');
const send = (value: LiveSnapshot) => act(() => source().emit('snapshot', value));
const timing = (value: unknown) => act(() => source().emit('timing', value));

const IDENTITY = { layoutKey: 'bahrain-gp', layoutName: 'Bahrain GP', carClass: 'GT3', vehicleModel: null, personalBestSeconds: 120.964 };
const LAPS = [
  liveLap(3, 122.202, [37.366, 45.208, 39.628]),
  liveLap(4, 122.206, [37.404, 45.234, 39.568]),
  liveLap(5, 121.832, [37.204, 45.116, 39.512]),
];
const BEST = { lapSeconds: 121.406, lapSectors: [37.2, 45.0, 39.2] as [number, number, number], bestSectors: [37.15, 44.98, 39.154] as [number, number, number], bestPossibleSeconds: 121.284 };

describe('live driving views', () => {
  beforeEach(() => {
    FakeEventSource.install();
    bar.renders = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  describe('session bar', () => {
    it('shows laps left (~ when estimated), the personal record, the track temperature with its trend and the game track name', () => {
      render(<LivePage />);
      send(liveSnapshot({
        identity: IDENTITY,
        lapsLeft: { laps: 12, estimated: true },
        weather: { trackTempC: 34, trackTempTrend: 'falling', raining: 0, avgPathWetness: 0, wetnessTrend: 'steady' },
      }));
      expect(screen.getByTestId('live-laps-left')).toHaveTextContent('LAPS LEFT ~12');
      expect(screen.getByTestId('live-personal-best')).toHaveTextContent('PR 2:00.964');
      expect(screen.getByTestId('live-track-temp')).toHaveTextContent('TRACK 34° ↓');
      // The game's own name, the same text as on every state screen (the layout key resolves the PR, not the label).
      expect(screen.getByText('Circuit de la Sarthe')).toBeInTheDocument();
      expect(screen.getByTestId('car-class-badge')).toHaveTextContent('GT3');
      send(liveSnapshot({ sequence: 2, identity: IDENTITY, lapsLeft: { laps: 1, estimated: false } }));
      expect(screen.getByTestId('live-laps-left')).toHaveTextContent('LAPS LEFT 1');
      expect(screen.getByTestId('live-laps-left')).not.toHaveTextContent('~');
    });

    it('holds every slot with the unknown mark until known, and falls back to the game track name and class', () => {
      render(<LivePage />);
      send(liveSnapshot({ identity: { ...IDENTITY, personalBestSeconds: null, layoutName: '' } }));
      expect(screen.getByTestId('live-laps-left')).toHaveTextContent('LAPS LEFT —');
      expect(screen.getByTestId('live-personal-best')).toHaveTextContent('PR —');
      expect(screen.getByTestId('live-track-temp')).toHaveTextContent('TRACK —');
      expect(screen.getByText('Circuit de la Sarthe')).toBeInTheDocument();
    });

    it.each([['rising', '↑'], ['steady', '→']] as const)('marks a %s track temperature', (trend, arrow) => {
      render(<LivePage />);
      send(liveSnapshot({ weather: { trackTempC: 41, trackTempTrend: trend, raining: 0, avgPathWetness: 0, wetnessTrend: 'steady' } }));
      expect(screen.getByTestId('live-track-temp')).toHaveTextContent(`TRACK 41° ${arrow}`);
    });

    it('says DRY beside the track temperature when the forecast holds to the end, and nothing while it is unknown', () => {
      render(<LivePage />);
      const weather = { trackTempC: 32, trackTempTrend: 'rising', raining: 0, avgPathWetness: 0, wetnessTrend: 'steady' } as const;
      const dry = { change: 'none', chance: 0, atSeconds: 900, lap: null } as const;
      send(liveSnapshot({ weather, strategy: liveStrategy({ forecast: dry }) }));
      expect(screen.getByTestId('live-track-temp')).toHaveTextContent('DRY · TRACK 32° ↑');
      send(liveSnapshot({ sequence: 2, weather }));
      expect(screen.getByTestId('live-track-temp')).toHaveTextContent('TRACK 32° ↑');
      expect(screen.queryByTestId('live-forecast')).not.toBeInTheDocument();
    });

    it('turns the weather slot to the track wetness and its trend once rain falls or the line is wet, ahead of a forecast', () => {
      render(<LivePage />);
      const wet = (raining: number, avgPathWetness: number, wetnessTrend: 'rising' | 'falling' | 'steady', sequence: number) => liveSnapshot({
        sequence, weather: { trackTempC: 30, trackTempTrend: 'steady', raining, avgPathWetness, wetnessTrend },
      });
      send(wet(0.3, 0.35, 'rising', 1));
      expect(screen.getByTestId('live-wetness')).toHaveTextContent('TRACK WET 35% ↑');
      expect(screen.getByTestId('live-wetness')).toHaveAttribute('aria-label', 'Track wetness, getting wetter');
      expect(screen.queryByTestId('live-track-temp')).not.toBeInTheDocument();
      // Rain stopped, the line still wet and drying.
      send(wet(0, 0.2, 'falling', 2));
      expect(screen.getByTestId('live-wetness')).toHaveTextContent('TRACK WET 20% ↓');
      send(wet(0, 0, 'falling', 3));
      expect(screen.getByTestId('live-track-temp')).toHaveTextContent('TRACK 30°');
    });
  });

  describe('race', () => {
    const race = () => liveSnapshot({
      lapsLeft: { laps: 12, estimated: true },
      recentLaps: [liveLap(12, 121.832, [37.204, 45.116, 39.512])],
      sessionBest: BEST,
    });

    it('shows the lap in progress with its delta, the last lap and its sectors against the best ones, the BEST row and the place in the bar', () => {
      render(<LivePage />);
      send(race());
      timing(liveTiming({ deltaSeconds: -0.184, sectorDeltas: [-0.12, 0.064, null], sector: 3 }));
      const current = screen.getByTestId('live-history-current');
      expect(within(current).getByText('−0.184')).toHaveAttribute('data-delta', 'gain');
      expect(screen.getByTestId('live-history-latest')).toHaveTextContent('122:01.83237.20445.11639.512+0.426');
      expect(screen.getByTestId('live-completed-sector-delta-1')).toHaveTextContent('+0.054');
      expect(screen.getByTestId('live-history-best')).toHaveTextContent('BEST2:01.40637.15044.98039.154');
      expect(screen.getByTestId('live-bar-place')).toHaveTextContent('P3');
      expect(screen.queryByTestId('live-tyre-avg')).not.toBeInTheDocument();
    });

    it('shows the estimated lap in place of the running clock, and the clock on an out lap', () => {
      render(<LivePage />);
      send(race());
      const estimate = { seconds: 121.222, referenceSeconds: 121.406, deltaSeconds: -0.184, source: 'distance' as const };
      timing(liveTiming({ deltaSeconds: -0.184, lapEstimate: estimate }));
      expect(screen.getByTestId('live-history-current-time')).toHaveTextContent('~2:01.222');
      timing(liveTiming({ isOutLap: true, lapEstimate: estimate }));
      expect(screen.getByTestId('live-history-current-time')).not.toHaveTextContent('~');
    });

    it('shows the unknown mark, never zero, before timing and a lap exist', () => {
      render(<LivePage />);
      send(liveSnapshot());
      const current = screen.getByTestId('live-history-current');
      expect(within(current).getAllByText('—').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('live-history-latest')).not.toBeInTheDocument();
      expect(screen.getByTestId('live-history')).not.toHaveTextContent('0.000');
    });

    it('updates only the timing parts on a timing event, not the page shell', () => {
      render(<LivePage />);
      send(race());
      const before = bar.renders;
      timing(liveTiming({ deltaSeconds: -0.1 }));
      timing(liveTiming({ deltaSeconds: 0.25 }));
      expect(screen.getByTestId('live-history-current')).toHaveTextContent('+0.250');
      expect(bar.renders).toBe(before);
    });

    it('drops the timing when the game leaves the track', () => {
      render(<LivePage />);
      send(race());
      timing(liveTiming({ deltaSeconds: 0.25 }));
      send(liveSnapshot({ sequence: 3, lifecycle: 'garage' }));
      send(race());
      expect(screen.getByTestId('live-history-current')).not.toHaveTextContent('+0.250');
    });
  });

  it.each(['practice', 'qualifying'] as const)('labels the %s estimate OUT LAP until a flying lap starts', kind => {
    render(<LivePage />);
    send(liveSnapshot({ session: liveSession({ kind }), sessionBest: BEST }));
    timing(liveTiming({ isOutLap: true, deltaSeconds: null }));
    expect(screen.getByTestId('live-estimated-lap')).toHaveTextContent('OUT LAP');
    timing(liveTiming({ isOutLap: false, deltaSeconds: null }));
    expect(screen.getByTestId('live-estimated-lap')).toHaveTextContent('—');
    timing(liveTiming({ isOutLap: false, deltaSeconds: -0.184 }));
    expect(screen.getByTestId('live-estimated-lap')).toHaveTextContent('2:01.222');
  });

  describe('qualifying', () => {
    const quali = () => liveSnapshot({ session: liveSession({ kind: 'qualifying' }), recentLaps: [LAPS[2]], sessionBest: BEST });

    it('takes the practice layout with laps left in place of the session best, and no place', () => {
      render(<LivePage />);
      send({ ...quali(), lapsLeft: { laps: 3, estimated: true } });
      expect(screen.getByRole('heading', { level: 2, name: 'ESTIMATED LAP' })).toBeInTheDocument();
      expect(screen.getByTestId('live-estimated-lap')).toHaveTextContent('—');
      timing(liveTiming({ deltaSeconds: -0.184 }));
      expect(screen.getByTestId('live-estimated-lap')).toHaveTextContent('2:01.222');
      expect(screen.getByTestId('live-practice-delta')).toHaveTextContent('−0.184');
      expect(screen.getByTestId('live-quali-laps-left')).toHaveTextContent('~3');
      expect(screen.queryByText('SESSION BEST')).not.toBeInTheDocument();
      expect(screen.getByTestId('live-history-best')).toHaveTextContent('BEST2:01.406');
      expect(screen.queryByText('P3')).not.toBeInTheDocument();
      expect(screen.queryByTestId('live-tyre-avg')).not.toBeInTheDocument();
    });
  });

  describe.each([['practice'], ['warmup'], ['unknown']] as const)('%s', (kind) => {
    const practice = (patch: Partial<LiveSnapshot> = {}) => liveSnapshot({
      session: liveSession({ kind }), recentLaps: LAPS, sessionBest: BEST, ...patch,
    });

    it('shows the live delta, the estimated lap, session best, the history table and the BEST row', () => {
      render(<LivePage />);
      send(practice());
      timing(liveTiming({ deltaSeconds: -0.184 }));
      expect(screen.getByTestId('live-practice-delta')).toHaveTextContent('−0.184');
      expect(screen.getByText('SESSION BEST').nextElementSibling).toHaveTextContent('2:01.406');
      expect(screen.getByText('ESTIMATED LAP').nextElementSibling).toHaveTextContent('2:01.222');
      expect(screen.queryByText('CURRENT VS BEST')).not.toBeInTheDocument();
      const rows = within(screen.getByTestId('live-history')).getAllByRole('row');
      // Header, current splits, two laps newest first, the BEST footer.
      expect(rows).toHaveLength(6);
      expect(rows[2]).toHaveTextContent('52:01.83237.20445.11639.512+0.426');
      expect(screen.getByTestId('live-history-best')).toHaveTextContent('BEST2:01.40637.15044.98039.154');
    });

    it('fills current splits from timing events before a lap completes, then moves all splits into history', () => {
      render(<LivePage />);
      send(practice({ recentLaps: [], sessionBest: null }));
      const current = screen.getByTestId('live-history-current');
      expect(current).toHaveTextContent('——————');
      const renders = bar.renders;
      timing(liveTiming({ lapNumber: 1, sector: 2, lapElapsedSeconds: 40.06, sectors: [37.204, null, null], deltaSeconds: null }));
      expect(current).toHaveTextContent('10:40.037.204———');
      expect(screen.queryByTestId('live-history-latest')).toBeNull();
      timing(liveTiming({ lapNumber: 1, sector: 3, lapElapsedSeconds: 85.39, sectors: [37.204, 45.116, null], deltaSeconds: null }));
      expect(current).toHaveTextContent('11:25.337.20445.116——');
      expect(bar.renders).toBe(renders);

      send(practice({ recentLaps: [liveLap(1, 121.832, [37.204, 45.116, 39.512])], sessionBest: null }));
      timing(liveTiming({ lapNumber: 2, sector: 1, lapElapsedSeconds: 0.4, sectors: [null, null, null], deltaSeconds: null }));
      expect(current).toHaveTextContent('20:00.4————');
      expect(screen.getByTestId('live-history-latest')).toHaveTextContent('12:01.83237.20445.11639.512—');
    });

    it('keeps sector times neutral and shows green/red deltas beneath only the latest lap', () => {
      render(<LivePage />);
      send(practice());
      expect(screen.getByTestId('live-history-latest').querySelector('.text-lmu-loss')).not.toBeNull(); // Overall lap delta.
      expect(screen.getByTestId('live-history').querySelector('[data-sector-loss]')).toBeNull();
      expect(within(screen.getByTestId('live-history')).getAllByRole('row', { name: /sector deltas against/ })).toHaveLength(1);
      expect(screen.getByTestId('live-completed-sector-delta-1')).toHaveTextContent('+0.054');
      expect(screen.getByTestId('live-completed-sector-delta-2')).toHaveTextContent('+0.136');
      expect(screen.getByTestId('live-completed-sector-delta-3')).toHaveTextContent('+0.358');
    });

    it('dims an invalid lap without extra text and does not tint it', () => {
      render(<LivePage />);
      send(practice({ recentLaps: [LAPS[0], LAPS[1], liveLap(5, 121.832, [37.204, 45.116, 39.512], false)] }));
      expect(screen.getByTestId('live-history-latest')).toHaveClass('text-lmu-muted');
      expect(screen.getByTestId('live-history-latest')).not.toHaveTextContent(/invalid/i);
      expect(screen.getByTestId('live-history').querySelector('[data-sector-loss]')).toBeNull();
      expect(screen.getByTestId('live-history-latest')).toHaveTextContent(/39\.512—$/);
    });

    it('holds the rows not driven yet as hidden full rows, so the table never reflows', () => {
      render(<LivePage />);
      send(practice({ recentLaps: [LAPS[0]] }));
      const blanks = screen.getAllByTestId('live-history-blank');
      expect(blanks).toHaveLength(1);
      for (const blank of blanks) {
        expect(blank).toHaveClass('invisible');
        expect(blank.querySelectorAll('td')).toHaveLength(6);
      }
    });

    it('shows the unknown mark for what is not known yet', () => {
      render(<LivePage />);
      send(practice({ recentLaps: [liveLap(1, null, [null, 45.1, null])], sessionBest: null }));
      expect(screen.getByTestId('live-practice-delta')).toHaveTextContent('—');
      expect(screen.getByText('SESSION BEST').nextElementSibling).toHaveTextContent('—');
      expect(screen.getByTestId('live-history-best')).toHaveTextContent('BEST————');
    });
  });
});
