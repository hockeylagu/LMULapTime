import { useState, useEffect, useCallback, useRef, Suspense, startTransition } from 'react';
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
import type { AppStatus, DetailedSession, ScanStatus, SessionProgressionPoint } from '../shared/types/index.js';
import { fetchJson, isAbortError } from './api/apiClient.js';
import { invalidateReferenceLaptimes } from './api/referenceApi.js';

// How long to wait before asking a server that did not answer again.
const SERVER_RETRY_MS = 2000;

interface SessionRouteProps {
  onBack: () => void;
  onSelectSession: (id: string) => void;
  progression: SessionProgressionPoint[];
  sessions: DetailedSession[];
}

function SessionRoute({ onBack, onSelectSession, progression, sessions }: SessionRouteProps) {
  const { sessionId } = useParams();
  if (!sessionId) return <Navigate to="/dashboard" replace />;
  return (
    <SessionDetail
      sessionId={sessionId}
      onBack={onBack}
      onSelectSession={onSelectSession}
      progression={progression}
      sessions={sessions}
    />
  );
}

interface TrackRouteProps {
  onSelectSession: (id: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  progression: SessionProgressionPoint[];
}

interface DashboardRouteProps {
  sessions: DetailedSession[];
  onSelectSession: (id: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
}

function DashboardRoute({ sessions, onSelectSession, selectedCarClass, setSelectedCarClass }: DashboardRouteProps) {
  return (
    <Dashboard
      sessions={sessions}
      onSelectSession={onSelectSession}
      selectedCarClass={selectedCarClass}
      setSelectedCarClass={setSelectedCarClass}
    />
  );
}

interface LeaderboardRouteProps {
  sessions: DetailedSession[];
  onSelectSession: (id: string) => void;
}

/** The page was Compare Laps: its links still open the leaderboard, on the same track and laps. */
function CompareRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/leaderboard', search }} replace />;
}

function LeaderboardRoute({ sessions, onSelectSession }: LeaderboardRouteProps) {
  const [searchParams] = useSearchParams();
  return (
    <LeaderboardPage
      sessions={sessions}
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

function TrackRoute({ onSelectSession, selectedCarClass, setSelectedCarClass, progression }: TrackRouteProps) {
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
      progression={progression}
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

  // Data States
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [sessions, setSessions] = useState<DetailedSession[]>([]);
  const [progression, setProgression] = useState<SessionProgressionPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [replayScanStatus, setReplayScanStatus] = useState<ScanStatus | null>(null);
  const [referenceUpdateCount, setReferenceUpdateCount] = useState<number | null>(null);

  // Poll replay scan progress only while a scan is actively running.
  // Once the scan finishes (running === false), polling stops completely,
  // making 0 requests when idle.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scanAbortRef = useRef<AbortController | null>(null);

  const startScanPolling = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (scanAbortRef.current) scanAbortRef.current.abort();

    const poll = () => {
      scanAbortRef.current = new AbortController();
      fetchJson<ScanStatus>('/api/scan/status', { signal: scanAbortRef.current.signal })
        .then((data) => {
          setReplayScanStatus(data);
          const referenceCheckPending = !!data.referenceLaptimes && !data.referenceLaptimes.checked;
          if (
            data.running ||
            data.sessionScan?.running ||
            data.telemetryScan?.running ||
            referenceCheckPending
          ) {
            pollTimerRef.current = setTimeout(poll, 1000);
          }

          const referenceRefresh = data.referenceLaptimes;
          if (
            referenceRefresh?.checked &&
            referenceRefresh.completedAt &&
            referenceRefresh.updatedCount > 0 &&
            referenceRefresh.completedAt !== referenceRefreshHandledRef.current
          ) {
            referenceRefreshHandledRef.current = referenceRefresh.completedAt;
            invalidateReferenceLaptimes();
            setReferenceUpdateCount(referenceRefresh.updatedCount);
          }
        })
        .catch((err: unknown) => {
          if (isAbortError(err)) return;
          // The server can be unreachable for a moment (starting, restarting): keep asking.
          pollTimerRef.current = setTimeout(poll, SERVER_RETRY_MS);
        });
    };
    poll();
  }, []);

  const referenceRefreshHandledRef = useRef<string | null>(null);

  const refreshReplayScanStatus = useCallback(() => {
    startScanPolling();
  }, [startScanPolling]);

  useEffect(() => {
    // Check scan status once on startup; if a background scan is running, poll until complete
    startScanPolling();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (scanAbortRef.current) scanAbortRef.current.abort();
    };
  }, [startScanPolling]);

  // Keep view filters synchronized with the router URL.
  useEffect(() => {
    setSelectedCarClassState(searchParams.get('carClass') || 'All');
  }, [searchParams]);

  const setSelectedCarClass = (carClass: string) => {
    setSelectedCarClassState(carClass);
    updateSearchParams(searchParams, setSearchParams, { carClass });
  };

  const hasLoadedRef = useRef(false);
  const dataRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchData = useCallback(async (forceRefresh = false): Promise<void> => {
    setIsRefreshing(true);
    try {
      const [statusData, sessionsData, progData] = await Promise.all([
        fetchJson<AppStatus>('/api/status'),
        fetchJson<DetailedSession[]>(`/api/sessions${forceRefresh ? '?refresh=true' : ''}`),
        fetchJson<SessionProgressionPoint[]>('/api/progression'),
      ]);

      setStatus(statusData);
      setSessions(sessionsData);
      setProgression(progData);
      hasLoadedRef.current = true;
      if (forceRefresh) startScanPolling();
    } catch (err) {
      console.error('Error fetching LMU telemetry data:', err);
      // Before the first load the server may still be starting: keep the loading screen and retry.
      if (!hasLoadedRef.current) {
        dataRetryTimerRef.current = setTimeout(() => { void fetchData(forceRefresh); }, SERVER_RETRY_MS);
      }
    } finally {
      // A transition keeps the loading screen up while the page chunk resolves, instead of flashing the Suspense
      // fallback, which React then holds for its reveal throttle (~300 ms).
      if (hasLoadedRef.current) startTransition(() => setLoading(false));
      setIsRefreshing(false);
    }
  }, [startScanPolling]);

  useEffect(() => () => clearTimeout(dataRetryTimerRef.current), []);

  useEffect(() => { preloadRoutePage(location.pathname); }, [location.pathname]);

  // Once the first page is up, fetch the other pages in the background so navigation never waits on a chunk.
  useEffect(() => {
    if (loading) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => { void prefetchRoutePages(); });
    return () => cancel(handle);
  }, [loading]);

  const scanStateRef = useRef({ replay: false, sessions: false, telemetry: false });
  useEffect(() => {
    const replayRunning = !!replayScanStatus?.running;
    const sessionsRunning = !!replayScanStatus?.sessionScan?.running;
    const telemetryRunning = !!replayScanStatus?.telemetryScan?.running;
    const previous = scanStateRef.current;
    if (
      (previous.replay && !replayRunning) ||
      (previous.sessions && !sessionsRunning) ||
      (previous.telemetry && !telemetryRunning)
    ) {
      void fetchData();
    }
    scanStateRef.current = { replay: replayRunning, sessions: sessionsRunning, telemetry: telemetryRunning };
  }, [fetchData, replayScanStatus?.running, replayScanStatus?.sessionScan?.running, replayScanStatus?.telemetryScan?.running]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
                sessions={sessions}
                onSelectSession={handleSelectSession}
                selectedCarClass={selectedCarClass}
                setSelectedCarClass={setSelectedCarClass}
              />
            } />
            <Route path="/tracks" element={
              <TrackSummaries
                sessions={sessions}
                onSelectTrack={handleSelectTrack}
                selectedCarClass={selectedCarClass}
                setSelectedCarClass={setSelectedCarClass}
              />
            } />
            <Route path="/leaderboard" element={
              <LeaderboardRoute
                sessions={sessions}
                onSelectSession={handleSelectSession}
              />
            } />
            <Route path="/compare" element={<CompareRedirect />} />
            <Route path="/settings" element={
              <Settings
                status={status}
                onUpdatePaths={() => fetchData(true)}
                replayScanStatus={replayScanStatus}
                onReplayScanTriggered={refreshReplayScanStatus}
              />
            } />
            <Route path="/session/:sessionId" element={<SessionRoute onBack={handleBackToSessions} onSelectSession={handleSelectSession} progression={progression} sessions={sessions} />} />
            <Route path="/telemetry" element={<ReplayInspectorPage />} />
            <Route path="/track/:trackName" element={<TrackRoute onSelectSession={handleSelectSession} selectedCarClass={selectedCarClass} setSelectedCarClass={setSelectedCarClass} progression={progression} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        )}
        </Suspense>
      </main>

      {!isTelemetryRoute && (
        <footer className="border-t border-lmu-border py-4 px-6 text-center text-xs text-lmu-muted">
          <p>LMU Lap Time & Sector Analyzer • Built for Le Mans Ultimate (Studio 397)</p>
        </footer>
      )}

      {referenceUpdateCount !== null && (
        <ReferenceLaptimeUpdateToast
          updatedCount={referenceUpdateCount}
          onDismiss={() => setReferenceUpdateCount(null)}
        />
      )}
    </div>
  );
}
