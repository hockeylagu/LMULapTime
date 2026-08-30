import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { ImprovementChart } from './components/ImprovementChart';
import { TrackSummaries } from './components/TrackSummaries';
import { SessionDetail } from './components/SessionDetail';
import { FileUploader } from './components/FileUploader';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'improvement' | 'tracks' | 'sessions' | 'settings'>('dashboard');
  const [status, setStatus] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [progression, setProgression] = useState<any[]>([]);
  const [tracksMap, setTracksMap] = useState<any>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<string>('All');
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Helper to parse location hash for routing
  const parseHash = () => {
    const rawHash = window.location.hash.replace(/^#\/?/, '');
    if (rawHash.startsWith('session/')) {
      const sessionId = rawHash.replace('session/', '');
      return { tab: 'dashboard' as const, sessionId: decodeURIComponent(sessionId) };
    }
    if (['improvement', 'tracks', 'settings', 'dashboard'].includes(rawHash)) {
      return { tab: rawHash as any, sessionId: null };
    }
    return { tab: 'dashboard' as const, sessionId: null };
  };

  const handleHashChange = useCallback(() => {
    const { tab, sessionId } = parseHash();
    setActiveTab(tab);
    setSelectedSessionId(sessionId);
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
    window.location.hash = tab === 'dashboard' ? '' : tab;
  };

  const handleSelectTrack = (trackName: string) => {
    setSelectedTrack(trackName);
    window.location.hash = 'improvement';
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
        ) : activeTab === 'dashboard' ? (
          <Dashboard
            sessions={sessions}
            onSelectSession={handleSelectSession}
            selectedTrack={selectedTrack}
            setSelectedTrack={setSelectedTrack}
          />
        ) : activeTab === 'improvement' ? (
          <ImprovementChart
            progression={progression}
            selectedTrack={selectedTrack}
            setSelectedTrack={setSelectedTrack}
            tracks={tracks}
          />
        ) : activeTab === 'tracks' ? (
          <TrackSummaries
            tracksMap={tracksMap}
            onSelectTrack={handleSelectTrack}
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
