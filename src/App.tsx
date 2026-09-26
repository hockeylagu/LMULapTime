import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Navbar,
  Dashboard,
  TrackSummaries,
  SessionDetail,
  TrackDetail,
  Settings,
  CompareLaps,
  ReplayInspectorPage,
  ReferenceLaptimeUpdateToast,
} from './components/index.js';
import { updateSearchParams } from './utils/urlParams';
import type { AppStatus, DetailedSession, ScanStatus, SessionProgressionPoint } from '../server/core/types';

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

interface CompareRouteProps {
  sessions: DetailedSession[];
  onSelectSession: (id: string) => void;
}

function CompareRoute({ sessions, onSelectSession }: CompareRouteProps) {
  const [searchParams] = useSearchParams();
  return (
    <CompareLaps
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
      fetch('/api/scan/status', { signal: scanAbortRef.current.signal })
        .then((res) => res.json())
        .then((data: ScanStatus) => {
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
            setReferenceUpdateCount(referenceRefresh.updatedCount);
          }
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
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

  const fetchData = useCallback(async (forceRefresh = false) => {
    setIsRefreshing(true);
    try {
      const [statusRes, sessionsRes, progRes] = await Promise.all([
        fetch('/api/status'),
        fetch(`/api/sessions${forceRefresh ? '?refresh=true' : ''}`),
        fetch('/api/progression'),
      ]);

      const statusData = await statusRes.json();
      const sessionsData = await sessionsRes.json();
      const progData = await progRes.json();

      setStatus(statusData);
      setSessions(sessionsData);
      setProgression(progData);
      if (forceRefresh) startScanPolling();
    } catch (err) {
      console.error('Error fetching LMU telemetry data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [startScanPolling]);

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
    <div className="min-h-screen bg-lmu-bg text-lmu-text flex flex-col font-sans">

      {!isTelemetryRoute && (
        <Navbar
          status={status}
          replayScanStatus={replayScanStatus}
          onRefresh={() => fetchData(true)}
          isRefreshing={isRefreshing}
        />
      )}

      {/* Main Content Area */}
      <main className={isTelemetryRoute ? 'flex-1 min-h-0 w-full' : 'flex-1 max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6'}>

        {loading ? (
          <div className="py-24 text-center bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] rounded-2xl">
            <div className="inline-block animate-spin w-10 h-10 border-4 border-lmu-accent border-t-transparent rounded-full mb-4" />
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Loading LMU Replay & Timing Database</h3>
            <p className="text-xs text-lmu-muted mt-1">Scanning UserData\LOG\Results and UserData\Replays...</p>
          </div>
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
            <Route path="/compare" element={
              <CompareRoute
                sessions={sessions}
                onSelectSession={handleSelectSession}
              />
            } />
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
      </main>

      {!isTelemetryRoute && (
        <footer className="border-t border-lmu-border/50 py-4 px-6 text-center text-xs text-lmu-muted bg-lmu-card/75 backdrop-blur-md border border-white/[0.07]">
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
