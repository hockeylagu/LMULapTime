import { useState, useEffect, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Navbar } from './components/navbar/Navbar.js';
import { ReferenceLaptimeUpdateToast } from './components/common/ReferenceLaptimeUpdateToast.js';
import { LoadingState } from './components/common/LoadingState.js';
import {
  Dashboard,
  TrackSummaries,
  SessionDetail,
  TrackDetail,
  Settings,
  LeaderboardPage,
  ReplayInspectorPage,
  prefetchRoutePages,
  preloadRoutePage,
} from './routePages.js';
import { updateSearchParams } from './utils/urlParams';

import { useAppData } from './api/useAppData.js';
import { SessionDataContext } from './api/sessionDataContext.js';

interface SessionRouteProps {
  onBack: () => void;
  onSelectSession: (id: string) => void;


}

function SessionRoute({ onBack, onSelectSession }: SessionRouteProps) {
  const { sessionId } = useParams();
  if (!sessionId) return <Navigate to="/dashboard" replace />;
  return (
    <SessionDetail
      sessionId={sessionId}
      onBack={onBack}
      onSelectSession={onSelectSession}


    />
  );
}

interface TrackRouteProps {
  onSelectSession: (id: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;

}

interface DashboardRouteProps {

  onSelectSession: (id: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
}

function DashboardRoute({ onSelectSession, selectedCarClass, setSelectedCarClass }: DashboardRouteProps) {
  return (
    <Dashboard

      onSelectSession={onSelectSession}
      selectedCarClass={selectedCarClass}
      setSelectedCarClass={setSelectedCarClass}
    />
  );
}

interface LeaderboardRouteProps {

  onSelectSession: (id: string) => void;
}

/** The page was Compare Laps: its links still open the leaderboard, on the same track and laps. */
function CompareRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/leaderboard', search }} replace />;
}

function LeaderboardRoute({ onSelectSession }: LeaderboardRouteProps) {
  const [searchParams] = useSearchParams();
  return (
    <LeaderboardPage

      onSelectSession={onSelectSession}
      initialTrack={searchParams.get('track') || undefined}
      initialCarClass={searchParams.get('carClass') || undefined}
      initialSessionId={searchParams.get('sessionId') || undefined}
      initialLapNum={searchParams.get('lapNum') ? parseInt(searchParams.get('lapNum')!, 10) : undefined}
      initialCompareSessionId={searchParams.get('compareSessionId') || undefined}
      initialCompareDriver={searchParams.get('compareDriver') || undefined}
      initialCompareLapNum={searchParams.get('compareLapNum') ? parseInt(searchParams.get('compareLapNum')!, 10) : undefined}
    />
  );
}

function TrackRoute({ onSelectSession, selectedCarClass, setSelectedCarClass }: TrackRouteProps) {
  const { trackName } = useParams();
  const navigate = useNavigate();
  if (!trackName) return <Navigate to="/tracks" replace />;
  return (
    <TrackDetail
      trackName={trackName}
      onBack={() => navigate(selectedCarClass !== 'All' ? `/tracks?carClass=${encodeURIComponent(selectedCarClass)}` : '/tracks', { replace: true })}
      onSelectSession={onSelectSession}
      selectedCarClass={selectedCarClass}
      setSelectedCarClass={setSelectedCarClass}

    />
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTelemetryRoute = location.pathname === '/telemetry';
  // Global Filter States
  const [selectedCarClass, setSelectedCarClassState] = useState<string>('All');

  const { status, loading, isRefreshing, replayScanStatus,
    referenceUpdateCount, setReferenceUpdateCount, revision, error, fetchData,
    refreshReplayScanStatus } = useAppData();

  // Keep view filters synchronized with the router URL.
  useEffect(() => {
    setSelectedCarClassState(searchParams.get('carClass') || 'All');
  }, [searchParams]);

  const setSelectedCarClass = (carClass: string) => {
    setSelectedCarClassState(carClass);
    updateSearchParams(searchParams, setSearchParams, { carClass });
  };

  useEffect(() => { preloadRoutePage(location.pathname); }, [location.pathname]);

  // Once the first page is up, fetch the other pages in the background so navigation never waits on a chunk.
  useEffect(() => {
    if (loading) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => { void prefetchRoutePages(); });
    return () => cancel(handle);
  }, [loading]);

  const handleSelectSession = (id: string) => {
    navigate(`/session/${encodeURIComponent(id)}`);
  };

  const handleBackToSessions = () => {
    navigate('/dashboard', { replace: true });
  };

  const handleSelectTrack = (trackName: string) => {
    const suffix = selectedCarClass !== 'All' ? `?carClass=${encodeURIComponent(selectedCarClass)}` : '';
    navigate(`/track/${encodeURIComponent(trackName)}${suffix}`);
  };

  return (
    <SessionDataContext.Provider value={{ revision, scan: replayScanStatus }}>
    <div className="min-h-screen min-w-[1480px] bg-lmu-bg text-lmu-text flex flex-col font-sans">

      {!isTelemetryRoute && (
        <Navbar
          status={status}
          replayScanStatus={replayScanStatus}
          onRefresh={() => fetchData(true)}
          isRefreshing={isRefreshing}
        />
      )}

      {/* Main Content Area: a fixed 1500px column; the 1480px floor above (a 1500px window less its scrollbar) scrolls sideways rather than reflowing */}
      <main className={isTelemetryRoute ? 'flex-1 min-h-0 w-full' : 'flex-1 max-w-[1500px] w-full mx-auto px-8 py-6'}>

        {/* Above the loading switch so a page still downloading keeps the loading screen up (see startTransition). */}
        <Suspense fallback={<LoadingState size="compact" showQuote={false} title="Loading page" dataTestId="route-loading-state" />}>
        {loading ? (
          <LoadingState
            title="Loading LMU Replay & Timing Database"
            subtitle="Scanning UserData\LOG\Results and UserData\Replays..."
            dataTestId="app-loading-state"
          />
        ) : (
          <Routes>
            <Route path="/dashboard" element={
              <DashboardRoute

                onSelectSession={handleSelectSession}
                selectedCarClass={selectedCarClass}
                setSelectedCarClass={setSelectedCarClass}
              />
            } />
            <Route path="/tracks" element={
              <TrackSummaries

                onSelectTrack={handleSelectTrack}
                selectedCarClass={selectedCarClass}
                setSelectedCarClass={setSelectedCarClass}
              />
            } />
            <Route path="/leaderboard" element={
              <LeaderboardRoute

                onSelectSession={handleSelectSession}
              />
            } />
            <Route path="/compare" element={<CompareRedirect />} />
            <Route path="/settings" element={
              <Settings
                status={status}
                onUpdatePaths={(resultsDir) => fetchData(resultsDir === undefined)}
                replayScanStatus={replayScanStatus}
                onReplayScanTriggered={refreshReplayScanStatus}
              />
            } />
            <Route path="/session/:sessionId" element={<SessionRoute onBack={handleBackToSessions} onSelectSession={handleSelectSession} />} />
            <Route path="/telemetry" element={<ReplayInspectorPage />} />
            <Route path="/track/:trackName" element={<TrackRoute onSelectSession={handleSelectSession} selectedCarClass={selectedCarClass} setSelectedCarClass={setSelectedCarClass} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        )}
        </Suspense>
      </main>

      {error && <p role="alert" className="px-8 py-2 text-sm text-lmu-warn">{error}</p>}

      {!isTelemetryRoute && (
        <footer className="border-t border-lmu-border py-4 px-6 text-center text-xs text-lmu-muted">
          <p>LMU Lap Time & Sector Analyzer • Built for Le Mans Ultimate (Studio 397)</p>
        </footer>
      )}

      {referenceUpdateCount !== null && location.pathname !== '/settings' && (
        <ReferenceLaptimeUpdateToast
          updatedCount={referenceUpdateCount}
          onDismiss={() => setReferenceUpdateCount(null)}
        />
      )}
    </div>
    </SessionDataContext.Provider>
  );
}
