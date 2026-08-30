import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { ImprovementChart } from './components/ImprovementChart';
import { TrackSummaries } from './components/TrackSummaries';
import { SessionDetail } from './components/SessionDetail';
import { TrackDetail } from './components/TrackDetail';
import { FileUploader } from './components/FileUploader';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'improvement' | 'tracks' | 'sessions' | 'settings'>('dashboard');
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
    const fullHash = window.location.hash.replace(/^#\/?/, '');
    const qIndex = fullHash.indexOf('?');
    const pathPart = qIndex !== -1 ? fullHash.substring(0, qIndex) : fullHash;
    const searchPart = qIndex !== -1 ? fullHash.substring(qIndex + 1) : window.location.search.replace(/^\?/, '');

    const params = new URLSearchParams(searchPart);
    const filterTrack = params.get('track') || 'All';
    const filterCarClass = params.get('carClass') || 'All';
    const filterTypeVal = params.get('type') || 'All';
    const filterSearchVal = params.get('q') || '';

    let tab: 'dashboard' | 'improvement' | 'tracks' | 'sessions' | 'settings' = 'dashboard';
    let sessionId: string | null = null;
    let trackRouteName: string | null = null;

    if (pathPart.startsWith('session/')) {
      sessionId = decodeURIComponent(pathPart.replace('session/', ''));
    } else if (pathPart.startsWith('track/')) {
      tab = 'tracks';
      trackRouteName = decodeURIComponent(pathPart.replace('track/', ''));
    } else if (['improvement', 'tracks', 'settings', 'dashboard'].includes(pathPart)) {
      tab = pathPart as any;
    }

    return {
      tab,
      sessionId,
      trackRouteName,
      filters: {
        track: filterTrack,
        carClass: filterCarClass,
        type: filterTypeVal,
        q: filterSearchVal,
      },
    };
  };

  const updateUrlFilters = (updates: { track?: string; carClass?: string; type?: string; q?: string }) => {
    const fullHash = window.location.hash.replace(/^#\/?/, '');
    const qIndex = fullHash.indexOf('?');
    const currentPath = qIndex !== -1 ? fullHash.substring(0, qIndex) : fullHash;

    const currentFilters = parseUrlState().filters;
    const track = updates.track !== undefined ? updates.track : currentFilters.track;
    const carClass = updates.carClass !== undefined ? updates.carClass : currentFilters.carClass;
    const type = updates.type !== undefined ? updates.type : currentFilters.type;
    const q = updates.q !== undefined ? updates.q : currentFilters.q;

    const params = new URLSearchParams();
    if (track && track !== 'All') params.set('track', track);
    if (carClass && carClass !== 'All') params.set('carClass', carClass);
    if (type && type !== 'All') params.set('type', type);
    if (q && q.trim() !== '') params.set('q', q.trim());

    const paramStr = params.toString();
    const newHash = `#/${currentPath}${paramStr ? `?${paramStr}` : ''}`;
    window.history.replaceState(null, '', newHash);
  };

  const setSelectedTrack = (track: string) => {
    setSelectedTrackState(track);
    updateUrlFilters({ track });
  };

  const setSelectedCarClass = (carClass: string) => {
    setSelectedCarClassState(carClass);
    updateUrlFilters({ carClass });
  };

  const setFilterType = (type: string) => {
    setFilterTypeState(type);
    updateUrlFilters({ type });
  };

  const setSearchQuery = (q: string) => {
    setSearchQueryState(q);
    updateUrlFilters({ q });
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

  const handleTabChange = (tab: 'dashboard' | 'improvement' | 'tracks' | 'sessions' | 'settings') => {
    const paramStr = new URLSearchParams(parseUrlState().filters).toString();
    const queryPart = paramStr ? `?${paramStr}` : '';
    window.location.hash = tab === 'dashboard' ? `dashboard${queryPart}` : `${tab}${queryPart}`;
  };

  const handleSelectTrack = (trackName: string) => {
    const paramStr = new URLSearchParams(parseUrlState().filters).toString();
    const queryPart = paramStr ? `?${paramStr}` : '';
    window.location.hash = `track/${encodeURIComponent(trackName)}${queryPart}`;
  };

  const tracks = Object.keys(tracksMap);

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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">

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
          />
        ) : selectedRouteTrackName ? (
          <TrackDetail
            trackName={selectedRouteTrackName}
            onBack={() => { window.location.hash = 'tracks'; }}
            onSelectSession={handleSelectSession}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
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
        ) : activeTab === 'improvement' ? (
          <ImprovementChart
            progression={progression}
            selectedTrack={selectedTrack}
            setSelectedTrack={setSelectedTrack}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
            tracks={tracks}
          />
        ) : activeTab === 'tracks' ? (
          <TrackSummaries
            sessions={sessions}
            tracksMap={tracksMap}
            onSelectTrack={handleSelectTrack}
            selectedCarClass={selectedCarClass}
            setSelectedCarClass={setSelectedCarClass}
          />
        ) : activeTab === 'settings' ? (
          <FileUploader
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
