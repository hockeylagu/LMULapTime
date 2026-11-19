import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { applySearchParamUpdates, updateSearchParams } from '../../utils/urlParams.js';
import { ReplayInspectorContent } from './inspector/ReplayInspectorContent.js';
import { GhostSyncContext, type GhostSyncState } from './inspector/ghostSyncContext.js';
import { parseGhostSyncMode } from './map/ghostSync.js';
import { RaceReplayView } from './race/RaceReplayView.js';
import { fetchRaceOverview } from '../../api/replayApi.js';
import { loadRace3DView, RaceModeContext } from './race/raceModeContext.js';
import { SceneShellsContext, useSharedSceneShells } from './view3d/scene/sceneShells.js';
import { TelemetryVisit } from './telemetryVisit.js';

/** How long after the lap view opens the session replay's overview is asked for (about 0.2 s of server work, 80 KB). */
const OVERVIEW_AHEAD_MS = 1000;

/** A finite number from a URL value, or null. */
const numberParam = (value: string | null): number | null => {
  const parsed = value === null || value === '' ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const ReplayInspectorPage: React.FC = () => {
  const { pathname, key: locationKey } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const fullscreen = searchParams.get('fullscreen') ?? searchParams.get('fullScreen');
  const viewParam = searchParams.get('view');
  const view: '2d' | '3d' = viewParam === '3d' ? '3d' : '2d';
  // The race and lap views share one 3D scene per circuit: switching keeps its renderer, scenery and car models.
  const sceneShells = useSharedSceneShells();
  // Marker A is kept as a distance, so it survives a lap or resolution reload.
  const [markerDistM, setMarkerDistM] = useState<number | null>(null);
  // From A needs marker A (a reload keeps the URL mode but not the marker): without it, Distance.
  const urlSyncMode = parseGhostSyncMode(searchParams.get('sync'));
  const syncMode = urlSyncMode === 'anchored' && markerDistM === null ? 'distance' : urlSyncMode;
  const ghostSync = useMemo<GhostSyncState>(() => ({
    mode: syncMode,
    setMode: mode => updateSearchParams(searchParams, setSearchParams, { sync: mode === 'distance' ? null : mode }),
    markerDistM, setMarkerDistM,
  }), [syncMode, markerDistM, searchParams, setSearchParams]);
  const isRace = searchParams.get('mode') === 'race';
  // Where Back leaves to, kept across a remount (hot reload, page reload).
  const [visit] = useState(() => new TelemetryVisit(isRace));
  useEffect(() => { visit.noteEntry(); }, [visit, locationKey]);
  // Leaving the race replay, the lap view comes back on the lap it showed instead of loading it again.
  const [fromRace, setFromRace] = useState(false);
  // Seconds into the lap the other mode opens at: the lap view's cursor for the race, the race clock for the lap view.
  const [handoffLapSec, setHandoffLapSec] = useState<number | null>(null);
  const openRace = useCallback((slot: number | null, lapNumber: number | null, lapSec?: number | null) => {
    visit.markRaceFromLap();
    setHandoffLapSec(lapSec ?? null);
    setSearchParams(
      (prev) => applySearchParamUpdates(prev || searchParams, {
        mode: 'race', car: slot === null ? null : String(slot), lap: lapNumber === null ? null : String(lapNumber), t: null,
      }),
    );
  }, [visit, searchParams, setSearchParams]);

  // Back leaves the page for the entry before the one it opened on, however many race views it opened since.
  const closeTelemetry = useCallback(() => {
    if (!sessionId) return;
    const { currentIdx, entryIdx } = visit;
    const stepsBack = currentIdx !== null && entryIdx !== null ? Math.max(1, currentIdx - entryIdx + 1) : 1;
    if (currentIdx !== null && currentIdx < stepsBack) {
      void navigate(`/session/${encodeURIComponent(sessionId)}`, { replace: true });
      return;
    }
    void navigate(-stepsBack);
  }, [visit, navigate, sessionId]);

  // Back from the race returns where it was opened from: the lap view (the entry before, pushed by `openRace`), or the
  // page before the telemetry page when it opened on the race, so Back never leads into a lap view the user did not come from.
  const closeRace = useCallback(() => {
    setFromRace(true); setHandoffLapSec(null);
    if (!visit.raceFromLap) { closeTelemetry(); return; }
    const { currentIdx, entryIdx } = visit;
    if (currentIdx !== null && entryIdx !== null && currentIdx > entryIdx) { void navigate(-1); return; }
    updateSearchParams(searchParams, setSearchParams, { mode: null, t: null, car: null, lap: null });
  }, [visit, navigate, closeTelemetry, searchParams, setSearchParams]);

  useEffect(() => {
    if (pathname !== '/telemetry' && pathname !== '/replay') return;
    if (!sessionId) {
      void navigate('/dashboard', { replace: true });
      return;
    }
    if (viewParam !== '2d' && viewParam !== '3d') {
      updateSearchParams(searchParams, setSearchParams, { view: '2d' });
    }
  }, [navigate, pathname, sessionId, viewParam, searchParams, setSearchParams]);

  // The session replay's overview (and in 3D its 3D code) loads once the lap view has had its own requests: the race then opens
  // without a loading page or card. A failure surfaces in the race, which asks again.
  const ahead3d = view === '3d';
  useEffect(() => {
    if (!sessionId || isRace) return;
    // Leaving the session stops the ask; switching to its race hands it over (`fetchRaceOverview`).
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchRaceOverview(sessionId, controller.signal).catch(() => {});
      if (ahead3d) loadRace3DView().catch(() => {});
    }, OVERVIEW_AHEAD_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [sessionId, isRace, ahead3d]);

  if (!sessionId) return null;

  if (isRace) {
    return (
      <SceneShellsContext.Provider value={sceneShells}>
      <RaceReplayView
        sessionId={sessionId}
        initialTimeSec={numberParam(searchParams.get('t'))}
        initialSlot={numberParam(searchParams.get('car'))}
        initialLapNumber={numberParam(searchParams.get('lap'))}
        initialLapSec={handoffLapSec}
        view={view}
        onViewChange={newView => updateSearchParams(searchParams, setSearchParams, { view: newView })}
        onClose={closeRace}
        onOpenLap={(driver, lap, lapSec) => {
          setFromRace(true); setHandoffLapSec(lapSec);
          updateSearchParams(searchParams, setSearchParams, {
            mode: null, t: null, car: null, lap: null, driverOrdinal: String(driver), lapOrdinal: String(lap),
            baselineSessionId: null, baselineDriverOrdinal: null, baselineLapOrdinal: null,
          });
        }}
        onStateChange={(timeSec, slot) => updateSearchParams(searchParams, setSearchParams, {
          t: String(timeSec), car: slot === null ? null : String(slot), lap: null,
        })}
      />
      </SceneShellsContext.Provider>
    );
  }

  const driverOrdinal = Number(searchParams.get('driverOrdinal') ?? 0);
  const lapOrdinal = Number(searchParams.get('lapOrdinal') ?? 0);
  const baselineDriverOrdinal = Number(searchParams.get('baselineDriverOrdinal') ?? 0);
  const baselineLapOrdinal = Number(searchParams.get('baselineLapOrdinal'));
  const baselineSession = searchParams.get('baselineSessionId');
  const corner = searchParams.get('corner');

  return (
    <SceneShellsContext.Provider value={sceneShells}>
    <RaceModeContext.Provider value={openRace}>
    <GhostSyncContext.Provider value={ghostSync}>
      <ReplayInspectorContent
        isOpen
        onClose={closeTelemetry}
        sessionId={sessionId}
        initialDriverOrdinal={Number.isInteger(driverOrdinal) && driverOrdinal >= 0 ? driverOrdinal : 0}
        initialLapOrdinal={Number.isInteger(lapOrdinal) && lapOrdinal >= 0 ? lapOrdinal : 0}
        onLocatorChange={(driver, lap) => updateSearchParams(searchParams, setSearchParams, {
          driverOrdinal: String(driver),
          lapOrdinal: String(lap),
        })}
        initialCompareMode={Boolean(baselineSession)}
        initialBaselineSessionId={baselineSession}
        initialBaselineDriverOrdinal={Number.isInteger(baselineDriverOrdinal) && baselineDriverOrdinal >= 0 ? baselineDriverOrdinal : 0}
        initialBaselineLapOrdinal={Number.isInteger(baselineLapOrdinal) && baselineLapOrdinal >= 0 ? baselineLapOrdinal : undefined}
        initialCornerNumber={corner ? parseInt(corner, 10) : undefined}
        resumeShownLap={fromRace}
        initialLapSec={handoffLapSec}
        isExpanded={fullscreen === 'true' || fullscreen === '1'}
        onToggleExpanded={(expanded) => updateSearchParams(searchParams, setSearchParams, { fullscreen: expanded })}
        view={view}
        onViewChange={(newView) => updateSearchParams(searchParams, setSearchParams, { view: newView })}
      />
    </GhostSyncContext.Provider>
    </RaceModeContext.Provider>
    </SceneShellsContext.Provider>
  );
};
