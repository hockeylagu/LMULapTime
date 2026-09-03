import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { TrackSummaries } from './components/TrackSummaries';
import { SessionDetail } from './components/SessionDetail';
import { TrackDetail } from './components/TrackDetail';
import { Settings } from './components/Settings';
import { CompareLaps } from './components/CompareLaps';
import { getHashRouteAndParams, updateHashParams, setHashRoute } from './utils/urlParams';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracks' | 'compare' | 'sessions' | 'settings'>('dashboard');
  const [status, setStatus] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [progression, setProgression] = useState<any[]>([]);
  const [tracksMap, setTracksMap] = useState<any>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedRouteTrackName, setSelectedRouteTrackName] = useState<string | null>(null);

  // Filter states
  const [selectedTrack, setSelectedTrackState] = useState<string>('All');
  const [selectedCarClass, setSelectedCarClassState] = useState<string>('All');
  const [filterType, setFilterTypeState] = useState<string>('All');
  const [searchQuery, setSearchQueryState] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Helper to parse location hash and query parameters for routing and filter state
  const parseUrlState = () => {
    const { path: pathPart, params } = getHashRouteAndParams();

    let tab: 'dashboard' | 'tracks' | 'compare' | 'sessions' | 'settings' = 'dashboard';
    let sessionId: string | null = null;
    let trackRouteName: string | null = null;

    if (pathPart.startsWith('session/')) {
      sessionId = decodeURIComponent(pathPart.replace('session/', ''));
    } else if (pathPart.startsWith('track/')) {
      tab = 'tracks';
      trackRouteName = decodeURIComponent(pathPart.replace('track/', ''));
    } else if (['tracks', 'compare', 'settings', 'dashboard'].includes(pathPart)) {
      tab = pathPart as any;
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

  const handleTabChange = (tab: 'dashboard' | 'tracks' | 'compare' | 'sessions' | 'settings') => {
    setHashRoute(tab);
  };

  const handleSelectTrack = (trackName: string) => {
    setHashRoute(`track/${encodeURIComponent(trackName)}`);
  };

  return (
    <div className="min-h-screen bg-lmu-bg text-lmu-text flex flex-col font-sans">

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        status={status}
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
          />
        ) : selectedRouteTrackName ? (
          <TrackDetail
            trackName={selectedRouteTrackName}
            onBack={() => { window.location.hash = 'tracks'; }}
            onSelectSession={handleSelectSession}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
            progression={progression}
          />
        ) : activeTab === 'dashboard' ? (
          <Dashboard
            sessions={sessions}
            onSelectSession={handleSelectSession}
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
            initialTrack={getHashRouteAndParams().params.get('track') || (selectedTrack !== 'All' ? selectedTrack : undefined)}
            initialCarClass={getHashRouteAndParams().params.get('carClass') || (selectedCarClass !== 'All' ? selectedCarClass : undefined)}
            initialSessionId={getHashRouteAndParams().params.get('sessionId') || undefined}
            initialLapNum={getHashRouteAndParams().params.get('lapNum') ? parseInt(getHashRouteAndParams().params.get('lapNum')!, 10) : undefined}
          />
        ) : activeTab === 'settings' ? (
          <Settings
            status={status}
            onUpdatePaths={() => fetchData(true)}
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
