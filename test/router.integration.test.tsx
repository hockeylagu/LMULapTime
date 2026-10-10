import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router';
import App from '../src/App.js';
import { aggregateTrackSummaries } from '../shared/domain/trackSummaryUtils.js';
import { prefetchRoutePages } from '../src/routePages.js';

function mockApi() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ resultsExist: true, replaysExist: true, sessionsCount: 0 }) });
    }
    if (url.startsWith('/api/tracks')) return Promise.resolve({ok:true,json:()=>Promise.resolve({tracks:Object.values(aggregateTrackSummaries([]))})});
      if (url.startsWith('/api/dashboard')) return Promise.resolve({ok:true,json:()=>Promise.resolve({
        revision:'test:1',sessions:[],total:1,page:1,pageSize:25,tracks:['Spa'],emptyCount:0,replayCount:0,
        metrics:{sessionsCount:1,totalLaps:5,cleanLaps:5,cleanLapsPercentage:100,totalDistanceKm:35,totalDrivingSeconds:600,
          maxTopSpeed:0,maxTopSpeedTrack:'',averageBenchmarkPacePercentage:100.1,averageBenchmarkPaceCategory:'Alien',
          practiceSessionsCount:1,qualifyingSessionsCount:0,raceSessionsCount:0,raceWinsCount:0,racePodiumsCount:0,totalPitStops:0,
          rankedTracks:[{track:'Spa',laps:5,km:35}],rankedCars:[{car:'Ferrari 499P',laps:5,km:35}],bestTrackRefLaps:[]},
        trends:{hasData:false,driverName:'Player',latestOuting:null,todayActivity:null,recentPaceTrend:[],paceDelta:null,
          paceTrendDirection:'none',paceTrendClass:null,recentCleanRate:null,recentConsistency:null,recentNetPositions:0}
      })});
    if (url.includes('/api/session-snapshot')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [], progression: [] }) });
    }
    if (url.includes('/api/sessions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/progression')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
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

describe('HashRouter integration', () => {
  // Pages load lazily; resolve their modules once so the first render of each is not a cold transform.
  beforeAll(() => prefetchRoutePages(), 30000);

  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    mockApi();
    window.location.hash = '#/dashboard';
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('mounts the real HashRouter and navigates between app routes', async () => {
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
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');
    });

    fireEvent.click(screen.getByRole('link', { name: /tracks/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /^Tracks \(/ })).toBeInTheDocument();
      expect(window.location.hash).toContain('#/tracks');
    });

    fireEvent.click(screen.getByRole('link', { name: /dashboard/i }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');
      expect(window.location.hash).toContain('#/dashboard');
    });
  });
});
