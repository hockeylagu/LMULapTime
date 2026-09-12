import { useState, useEffect, useCallback } from 'react';
import {
  Navbar,
  NavTab,
  Dashboard,
  TrackSummaries,
  SessionDetail,
  TrackDetail,
  Settings,
  CompareLaps,
} from './components/index.js';
import { getHashRouteAndParams, updateHashParams, setHashRoute } from './utils/urlParams';
import { AppStatus, DetailedSession, ReplayScanStatus, SessionProgressionPoint, TrackSummary } from '../server/types.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [sessions, setSessions] = useState<DetailedSession[]>([]);
  const [progression, setProgression] = useState<SessionProgressionPoint[]>([]);
  const [tracksMap, setTracksMap] = useState<Record<string, TrackSummary>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedRouteTrackName, setSelectedRouteTrackName] = useState<string | null>(null);

  // Filter states
  const [selectedTrack, setSelectedTrackState] = useState<string>('All');
  const [selectedCarClass, setSelectedCarClassState] = useState<string>('All');
  const [filterType, setFilterTypeState] = useState<string>('All');
  const [searchQuery, setSearchQueryState] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [replayScanStatus, setReplayScanStatus] = useState<ReplayScanStatus | null>(null);

  // Fetches replay scan status once; exposed so Settings can force an immediate refresh
  // right after triggering a rescan instead of waiting for the next scheduled poll.
  const refreshReplayScanStatus = useCallback(() => {
    fetch('/api/scan/status')
      .then((res) => res.json())
      .then((data: ReplayScanStatus) => setReplayScanStatus(data))
      .catch(() => {});
  }, []);

  // Poll replay scan progress continuously (slower cadence while idle, faster while a scan
  // is running) so the Navbar badge and Settings page reflect both user-triggered rescans
  // and the background scan the server kicks off automatically at startup.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = () => {
      fetch('/api/scan/status')
        .then((res) => res.json())
        .then((data: ReplayScanStatus) => {
          if (cancelled) return;
          setReplayScanStatus(data);
          timer = setTimeout(poll, data.running ? 1000 : 5000);
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(poll, 5000);
        });
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Helper to parse location hash and query parameters for routing and filter state
  const parseUrlState = () => {
    const { path: pathPart, params } = getHashRouteAndParams();

    let tab: NavTab = 'dashboard';
    let sessionId: string | null = null;
    let trackRouteName: string | null = null;

    if (pathPart.startsWith('session/')) {
      sessionId = decodeURIComponent(pathPart.replace('session/', ''));
    } else if (pathPart.startsWith('track/')) {
      tab = 'tracks';
      trackRouteName = decodeURIComponent(pathPart.replace('track/', ''));
    } else if (['tracks', 'compare', 'settings', 'dashboard'].includes(pathPart)) {
      tab = pathPart as NavTab;
    }

    return {
      tab,
      sessionId,
      trackRouteName,
      filters: {
        track: params.get('track') || 'All',
        carClass: params.get('carClass') || 'All',
        type: params.get('type') || 'All',
        q: params.get('q') || '',
      },
    };
  };

  const setSelectedTrack = (track: string) => {
    setSelectedTrackState(track);
    updateHashParams({ track });
  };

  const setSelectedCarClass = (carClass: string) => {
    setSelectedCarClassState(carClass);
    updateHashParams({ carClass });
  };

  const setFilterType = (type: string) => {
    setFilterTypeState(type);
    updateHashParams({ type });
  };

  const setSearchQuery = (q: string) => {
    setSearchQueryState(q);
    updateHashParams({ q });
  };

  const handleHashChange = useCallback(() => {
    const { tab, sessionId, trackRouteName, filters } = parseUrlState();
    setActiveTab(tab);
    setSelectedSessionId(sessionId);
    setSelectedRouteTrackName(trackRouteName);
    setSelectedTrackState(filters.track);
    setSelectedCarClassState(filters.carClass);
    setFilterTypeState(filters.type);
    setSearchQueryState(filters.q);
  }, []);

  useEffect(() => {
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, [handleHashChange]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    setIsRefreshing(true);
    try {
      const [statusRes, sessionsRes, progRes, tracksRes] = await Promise.all([
        fetch('/api/status'),
        fetch(`/api/sessions${forceRefresh ? '?refresh=true' : ''}`),
        fetch('/api/progression'),
        fetch('/api/tracks'),
      ]);

      const statusData = await statusRes.json();
      const sessionsData = await sessionsRes.json();
      const progData = await progRes.json();
      const tracksData = await tracksRes.json();

      setStatus(statusData);
      setSessions(sessionsData);
      setProgression(progData);
      setTracksMap(tracksData);
    } catch (err) {
      console.error('Error fetching LMU telemetry data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectSession = (id: string) => {
    window.location.hash = `session/${encodeURIComponent(id)}`;
  };

  const handleOpenReplay = (id: string) => {
    window.location.hash = `session/${encodeURIComponent(id)}?replay=1`;
  };

  const handleBackToSessions = () => {
    if (window.location.hash.startsWith('#session/')) {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.hash = 'dashboard';
      }
    } else {
      setSelectedSessionId(null);
    }
  };

  const handleTabChange = (tab: NavTab) => {
    setHashRoute(tab);
  };

  const handleSelectTrack = (trackName: string) => {
    setHashRoute(`track/${encodeURIComponent(trackName)}`);
  };

  const compareParams = activeTab === 'compare' ? getHashRouteAndParams().params : null;

  return (
    <div className="min-h-screen bg-lmu-bg text-lmu-text flex flex-col font-sans">

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        status={status}
        replayScanStatus={replayScanStatus}
        onRefresh={() => fetchData(true)}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {loading ? (
          <div className="py-24 text-center glass-panel rounded-2xl">
            <div className="inline-block animate-spin w-10 h-10 border-4 border-lmu-accent border-t-transparent rounded-full mb-4" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Loading LMU Replay & Timing Database</h3>
            <p className="text-xs text-lmu-muted mt-1">Scanning UserData\LOG\Results and UserData\Replays...</p>
          </div>
        ) : selectedSessionId ? (
          <SessionDetail
            sessionId={selectedSessionId}
            onBack={handleBackToSessions}
            onSelectSession={handleSelectSession}
            progression={progression}
            sessions={sessions}
          />
        ) : selectedRouteTrackName ? (
          <TrackDetail
            trackName={selectedRouteTrackName}
            onBack={() => { window.location.hash = 'tracks'; }}
            onSelectSession={handleSelectSession}
            onOpenReplay={handleOpenReplay}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
            progression={progression}
          />
        ) : activeTab === 'dashboard' ? (
          <Dashboard
            sessions={sessions}
            onSelectSession={handleSelectSession}
            onOpenReplay={handleOpenReplay}
            selectedTrack={selectedTrack}
            setSelectedTrack={setSelectedTrack}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
            filterType={filterType}
            setFilterType={setFilterType}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        ) : activeTab === 'tracks' ? (
          <TrackSummaries
            sessions={sessions}
            tracksMap={tracksMap}
            onSelectTrack={handleSelectTrack}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
          />
        ) : activeTab === 'compare' ? (
          <CompareLaps
            sessions={sessions}
            onSelectSession={handleSelectSession}
            initialTrack={compareParams?.get('track') || (selectedTrack !== 'All' ? selectedTrack : undefined)}
            initialCarClass={compareParams?.get('carClass') || (selectedCarClass !== 'All' ? selectedCarClass : undefined)}
            initialSessionId={compareParams?.get('sessionId') || undefined}
            initialLapNum={compareParams?.get('lapNum') ? parseInt(compareParams.get('lapNum')!, 10) : undefined}
            initialCompareSessionId={compareParams?.get('compareSessionId') || undefined}
            initialCompareDriver={compareParams?.get('compareDriver') || undefined}
            initialCompareLapNum={compareParams?.get('compareLapNum') ? parseInt(compareParams.get('compareLapNum')!, 10) : undefined}
          />
        ) : activeTab === 'settings' ? (
          <Settings
            status={status}
            onUpdatePaths={() => fetchData(true)}
            replayScanStatus={replayScanStatus}
            onReplayScanTriggered={refreshReplayScanStatus}
          />
        ) : null}

      </main>

      {/* Footer */}
      <footer className="border-t border-lmu-border/50 py-4 px-6 text-center text-xs text-lmu-muted glass-panel">
        <p>LMU Lap Time & Sector Analyzer • Built for Le Mans Ultimate (Studio 397)</p>
      </footer>

    </div>
  );
}
