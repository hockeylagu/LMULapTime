import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router';
import App from '../src/App.js';

const session = {
  id: 's-1',
  filename: 'Algarve_P1.xml',
  filePath: '/tmp/Algarve_P1.xml',
  trackVenue: 'Algarve International Circuit',
  trackCourse: '',
  trackEvent: '',
  trackLengthMeters: 4653,
  timeString: '2026-01-01 12:00:00',
  timestamp: 1767268800,
  sessionType: 'Practice',
  sessionName: 'P1',
  driversCount: 1,
  playerDriver: {
    name: 'Player',
    carType: 'Peugeot 9X8',
    carClass: 'Hypercar',
    carNumber: '93',
    teamName: 'Peugeot',
    isPlayer: true,
    position: 1,
    classPosition: 1,
    bestLapTime: 100,
    bestLapTimeString: '1:40.000',
    bestS1: 30,
    bestS2: 35,
    bestS3: 35,
    theoreticalBest: 100,
    theoreticalBestString: '1:40.000',
    lapsCount: 3,
    laps: [],
  },
  drivers: [],
};

function mockApi() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ resultsExist: true, replaysExist: true, sessionsCount: 1 }) });
    }
    if (url.includes('/api/sessions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([session]) });
    }
    if (url.includes('/api/progression')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/track/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          trackName: 'Algarve International Circuit',
          normalizedTrackName: 'Algarve International Circuit',
          sessionsCount: 1,
          sessions: [session],
          benchmarks: [],
        }),
      });
    }
    if (url.includes('/api/reference-laptimes')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
    }
    if (url.includes('/api/scan/status')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          running: false,
          sessionScan: { running: false },
          referenceLaptimes: { started: true, running: false, checked: true, updatedCount: 0 },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('carClass URL persistence across track navigation', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    mockApi();
    window.location.hash = '#/tracks';
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('keeps the selected car class in the URL when entering and leaving a track', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <HashRouter>
          <App />
        </HashRouter>,
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Algarve International Circuit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hypercar' }));

    await waitFor(() => {
      expect(window.location.hash).toContain('carClass=LMH');
    });

    fireEvent.click(screen.getByText('Algarve International Circuit'));

    await waitFor(() => {
      expect(window.location.hash).toContain('/track/Algarve%20International%20Circuit');
      expect(window.location.hash).toContain('carClass=LMH');
    });

    fireEvent.click(screen.getByRole('button', { name: /back to tracks/i }));

    await waitFor(() => {
      expect(window.location.hash).toContain('#/tracks');
      expect(window.location.hash).toContain('carClass=LMH');
    });
  });
});
