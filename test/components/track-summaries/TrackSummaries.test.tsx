import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as renderComponent, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { invalidateReferenceLaptimes } from '../../../src/api/referenceApi.js';
import { TrackSummaries } from '../../../src/components/track-summaries/TrackSummaries.js';
import { TrackSessionSummary } from '../../../shared/domain/trackSummaryUtils.js';
import { chooseValue, openSelect } from '../../helpers/selectControl.js';

const render = (ui: ReactNode) => renderComponent(ui, { wrapper: MemoryRouter });

describe('TrackSummaries component', () => {
  beforeEach(() => {
    invalidateReferenceLaptimes();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );
  });

  const mockSessions: TrackSessionSummary[] = [
    {
      id: 'spa-sess',
      trackVenue: 'Spa',
      timeString: '2026/05/28 14:00',
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 499P',
        carClass: 'Hyper',
        bestLapTime: 122.0,
        bestS1: 34.0,
        bestS2: 42.0,
        bestS3: 46.0,
        declaredLapsCount: 15,
      },
    },
    {
      id: 'monza-sess',
      trackVenue: 'Monza',
      timeString: '2026/05/27 14:00',
      playerDriver: {
        name: 'Player',
        carType: 'Porsche 911 GT3',
        carClass: 'GT3',
        bestLapTime: 108.0,
        bestS1: 28.0,
        bestS2: 38.0,
        bestS3: 42.0,
        declaredLapsCount: 5,
      },
    },
  ];

  it('renders track cards and allows selecting a track', async () => {
    const onSelectTrack = vi.fn();
    const setSelectedCarClass = vi.fn();

    render(
      <TrackSummaries
        sessions={mockSessions}
        onSelectTrack={onSelectTrack}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /^Tracks \(/ })).toBeInTheDocument();
    });
    expect(screen.getByText('Spa')).toBeInTheDocument();
    expect(screen.getByText('Monza')).toBeInTheDocument();

    const spaCard = screen.getByRole('link', { name: 'View Spa records' });
    expect(spaCard).not.toBeNull();
    if (spaCard) {
      fireEvent.click(spaCard);
      expect(onSelectTrack).toHaveBeenCalledWith(expect.objectContaining({ trackVenue: 'Spa', identityVenue: 'Spa', trackCourse: '' }));
    }
  });

  it('filters by car class and sorts tracks', async () => {
    const setSelectedCarClass = vi.fn();

    render(
      <TrackSummaries
        sessions={mockSessions}
        onSelectTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'GT3' })).toBeInTheDocument();
    });

    const lmgt3Btn = screen.getByRole('button', { name: 'GT3' });
    fireEvent.click(lmgt3Btn);
    expect(setSelectedCarClass).toHaveBeenCalledWith('GT3');

    const sortSelect = screen.getByRole('combobox');
    chooseValue(sortSelect, 'name-desc');
    chooseValue(sortSelect, 'pace-asc');
    chooseValue(sortSelect, 'last-session-desc');
  });

  it('computes class-filtered summaries directly from sessions', async () => {
    const sessions = [
      {
        id: 'spa-lmh',
        filename: 'spa-lmh.xml',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        timeString: '2026/05/28 14:00',
        sessionType: 'Practice' as const,
        sessionName: 'P1',
        driversCount: 1,
        playerDriver: {
          name: 'LMH Driver', carType: 'Ferrari 499P', carClass: 'Hyper',
          bestLapTime: 130, 
          bestS1: 40, bestS2: 45, bestS3: 45, declaredLapsCount: 8,
        },
      },
      {
        id: 'spa-gt3',
        filename: 'spa-gt3.xml',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        timeString: '2026/05/29 14:00',
        sessionType: 'Practice' as const,
        sessionName: 'P2',
        driversCount: 1,
        playerDriver: {
          name: 'GT3 Driver', carType: 'Porsche 911 GT3', carClass: 'GT3',
          bestLapTime: 140, 
          bestS1: 43, bestS2: 48, bestS3: 49, declaredLapsCount: 4,
        },
      },
    ];
    const onSelectTrack = vi.fn();
    const { rerender } = render(
      <TrackSummaries
        sessions={sessions}
        onSelectTrack={onSelectTrack}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    expect(await screen.findByText('2 Sessions • 12 Total Laps')).toBeInTheDocument();
    expect(screen.getAllByText('2:10.000')).toHaveLength(2);

    rerender(
      <TrackSummaries
        sessions={sessions}
        onSelectTrack={onSelectTrack}
        selectedCarClass="GT3"
        setSelectedCarClass={vi.fn()}
      />
    );

    expect(await screen.findByText('1 Session • 4 Total Laps')).toBeInTheDocument();
    expect(screen.getAllByText('2:20.000')).toHaveLength(2);
  });

  it('keeps distinct layouts at the same venue in separate summaries', async () => {
    const sessions = ['Layout A', 'Layout B'].map((trackCourse, index) => ({
      id: `layout-${index}`,
      filename: `layout-${index}.xml`,
      trackVenue: 'Test Circuit',
      trackCourse,
      timeString: `2026/05/2${8 + index} 14:00`,
      sessionType: 'Practice' as const,
      sessionName: `P${index + 1}`,
      driversCount: 1,
      playerDriver: {
        name: 'Player', carType: 'Ferrari 499P', carClass: 'Hyper',
        bestLapTime: 130 + index, 
        bestS1: 40, bestS2: 45, bestS3: 45, declaredLapsCount: 1,
      },
    }));

    render(
      <TrackSummaries
        sessions={sessions}
        onSelectTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    expect(await screen.findByRole('heading', { level: 2, name: 'Tracks (2)' })).toBeInTheDocument();
    expect(screen.getByText('Test Circuit (Layout A)')).toBeInTheDocument();
    expect(screen.getByText('Test Circuit (Layout B)')).toBeInTheDocument();
  });

  it('handles empty track summaries list', async () => {
    render(
      <TrackSummaries
        sessions={[]}
        onSelectTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Tracks (0)' })).toBeInTheDocument();
    });
    expect(screen.getByText('No track records yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check the results folder in Settings' })).toHaveAttribute('href', '/settings');
  });

  it('opens a track with Enter and retains class context in native links', async () => {
    const user = userEvent.setup();
    const onSelectTrack = vi.fn();
    render(<TrackSummaries sessions={mockSessions} onSelectTrack={onSelectTrack} selectedCarClass="GT3" setSelectedCarClass={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading benchmark targets…')).not.toBeInTheDocument());
    const link = screen.getByRole('link', { name: 'View Monza records' });
    expect(link).toHaveAttribute('href', '/track/Monza?trackVenue=Monza&trackCourse=&carClass=GT3');
    link.focus();
    await user.keyboard('{Enter}');
    expect(onSelectTrack).toHaveBeenCalledWith(expect.objectContaining({ identityVenue: 'Monza', trackCourse: '' }));
    onSelectTrack.mockClear();
    // The test DOM cannot open another tab; cancel only the simulated browser default.
    document.addEventListener('click', event => event.preventDefault(), { once: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(onSelectTrack).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'GT3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hypercar' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('No sessions recorded for this class.')).toBeInTheDocument();
  });

  it('shows the API error and retries without discarding track records', async () => {
    const user = userEvent.setup();
    let referenceRequests = 0;
    global.fetch = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/reference-laptimes') {
        referenceRequests += 1;
        if (referenceRequests === 1) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: 'Benchmark service is offline' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: {} }) });
    });
    render(<TrackSummaries sessions={mockSessions} onSelectTrack={vi.fn()} selectedCarClass="All" setSelectedCarClass={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Benchmark service is offline');
    expect(screen.getByRole('link', { name: 'View Monza records' })).toBeInTheDocument();
    openSelect(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'Pace / Benchmark (Best First)' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await screen.findByRole('link', { name: 'Review benchmarks in Settings' });
    expect(referenceRequests).toBe(2);
  });

  it('announces benchmark loading and disables pace sorting until valid targets arrive', async () => {
    let finish: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    global.fetch = vi.fn().mockImplementation((path: string) => path === '/api/reference-laptimes'
      ? new Promise(resolve => { finish = resolve; })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<TrackSummaries sessions={mockSessions} onSelectTrack={vi.fn()} selectedCarClass="All" setSelectedCarClass={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading benchmark targets');
    openSelect(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'Pace / Benchmark (Best First)' })).toHaveAttribute('aria-disabled', 'true');
    finish?.({ ok: true, json: () => Promise.resolve({ entries: { monza: { trackName: 'Monza', carClass: 'GT3', targets: { alienSec: 100 } } } }) });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Pace / Benchmark (Best First)' })).not.toHaveAttribute('aria-disabled'));
  });

  it('explains absent lap and sector data instead of presenting placeholders as records', async () => {
    const incomplete = { ...mockSessions[0], playerDriver: { ...mockSessions[0].playerDriver!, bestLapTime: null, bestS1: null, bestS2: null, bestS3: null } };
    render(<TrackSummaries sessions={[incomplete]} onSelectTrack={vi.fn()} selectedCarClass="All" setSelectedCarClass={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading benchmark targets…')).not.toBeInTheDocument());
    expect(screen.getByText('No completed lap time recorded.')).toBeInTheDocument();
    expect(screen.queryByText('--:--.---')).not.toBeInTheDocument();
  });

  it('keeps long Unicode names and encoded navigation intact', async () => {
    const name = `Circuit Étoile & 東京 🏎️ ${'LongLayout'.repeat(15)}`;
    render(<TrackSummaries sessions={[{ ...mockSessions[0], trackVenue: name }]} onSelectTrack={vi.fn()} selectedCarClass="All" setSelectedCarClass={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading benchmark targets…')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name })).toHaveAttribute('dir', 'auto');
    expect(screen.getByRole('link', { name: `View ${name} records` })).toHaveAttribute('href', `/track/${encodeURIComponent(name)}?${new URLSearchParams({ trackVenue: name, trackCourse: '' })}`);
  });

  it('keeps custom courses separate in both ordinary and native navigation', async () => {
    const onSelectTrack = vi.fn();
    render(<TrackSummaries sessions={['Short', 'Long'].map(trackCourse => ({ ...mockSessions[0], trackVenue: 'Custom Ring', trackCourse }))}
      onSelectTrack={onSelectTrack} selectedCarClass="Hyper" setSelectedCarClass={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading benchmark targets…')).not.toBeInTheDocument());
    const short = screen.getByRole('link', { name: 'View Custom Ring (Short) records' });
    expect(short).toHaveAttribute('href', '/track/Custom%20Ring%20(Short)?trackVenue=Custom+Ring&trackCourse=Short&carClass=Hyper');
    expect(screen.getByRole('link', { name: 'View Custom Ring (Long) records' })).toHaveAttribute('href',
      '/track/Custom%20Ring%20(Long)?trackVenue=Custom+Ring&trackCourse=Long&carClass=Hyper');
    fireEvent.click(short);
    expect(onSelectTrack).toHaveBeenCalledWith(expect.objectContaining({ identityVenue: 'Custom Ring', trackCourse: 'Short' }));
  });

  it('qualifies a sector sum slower than the recorded best', async () => {
    const inconsistent = { ...mockSessions[0], playerDriver: { ...mockSessions[0].playerDriver!, bestLapTime: 120 } };
    render(<TrackSummaries sessions={[inconsistent]} onSelectTrack={vi.fn()} selectedCarClass="All" setSelectedCarClass={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading benchmark targets…')).not.toBeInTheDocument());
    expect(screen.getByText('Sector timing differs from the recorded best.')).toBeInTheDocument();
    expect(screen.getByText('2:00.000')).toBeInTheDocument();
    expect(screen.getByText('2:02.000')).toBeInTheDocument();
  });

  it('keeps a recorded best visible when sector timings are incomplete', async () => {
    const partial = { ...mockSessions[0], playerDriver: { ...mockSessions[0].playerDriver!, bestS2: null } };
    render(<TrackSummaries sessions={[partial]} onSelectTrack={vi.fn()} selectedCarClass="All" setSelectedCarClass={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('Loading benchmark targets…')).not.toBeInTheDocument());
    expect(screen.getByText('2:02.000')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Complete sector timings needed')).toBeInTheDocument();
  });
});
