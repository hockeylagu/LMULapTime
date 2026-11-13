import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { applySearchParamUpdates, updateSearchParams } from '../../utils/urlParams.js';
import { ReplayInspectorContent } from './inspector/ReplayInspectorContent.js';
import { GhostSyncContext, type GhostSyncState } from './inspector/ghostSyncContext.js';
import { parseGhostSyncMode } from './map/ghostSync.js';
import { RaceReplayView } from './race/RaceReplayView.js';
import { RaceModeContext } from './race/raceModeContext.js';

/** A finite number from a URL value, or null. */
const numberParam = (value: string | null): number | null => {
  const parsed = value === null || value === '' ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const ReplayInspectorPage: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const fullscreen = searchParams.get('fullscreen') ?? searchParams.get('fullScreen');
  const viewParam = searchParams.get('view');
  const view: '2d' | '3d' = viewParam === '3d' ? '3d' : '2d';
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
  const readHistoryIdx = (): number | null => {
    const state = window.history.state as { idx?: unknown } | null;
    return typeof state?.idx === 'number' ? state.idx : null;
  };
  const [entryHistoryIdx] = useState<number | null>(() => readHistoryIdx());
  const internalDepthRef = useRef(0);
  // Leaving the race replay, the lap view comes back on the lap it showed instead of loading it again.
  const [fromRace, setFromRace] = useState(false);
  const openRace = useCallback((slot: number | null, lapNumber: number | null) => {
    internalDepthRef.current += 1;
    setSearchParams(
      (prev) => applySearchParamUpdates(prev || searchParams, {
        mode: 'race', car: slot === null ? null : String(slot), lap: lapNumber === null ? null : String(lapNumber), t: null,
      }),
    );
  }, [searchParams, setSearchParams]);

  const closeRace = useCallback(() => {
    setFromRace(true);
    const currentIdx = readHistoryIdx();
    const canPopToLap = (currentIdx !== null && entryHistoryIdx !== null && currentIdx > entryHistoryIdx)
      || internalDepthRef.current > 0;
    if (canPopToLap) {
      internalDepthRef.current = Math.max(0, internalDepthRef.current - 1);
      void navigate(-1);
      return;
    }
    updateSearchParams(searchParams, setSearchParams, { mode: null, t: null, car: null, lap: null });
  }, [entryHistoryIdx, navigate, searchParams, setSearchParams]);

  const closeTelemetry = useCallback(() => {
    if (!sessionId) return;
    const currentIdx = readHistoryIdx();
    if (currentIdx !== null && entryHistoryIdx !== null) {
      const stepsBack = Math.max(1, currentIdx - entryHistoryIdx + 1);
      if (currentIdx < stepsBack) {
        void navigate(`/session/${encodeURIComponent(sessionId)}`, { replace: true });
        return;
      }
      void navigate(-stepsBack);
      return;
    }
    void navigate(-(1 + internalDepthRef.current));
  }, [entryHistoryIdx, navigate, sessionId]);

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

  if (!sessionId) return null;

  if (isRace) {
    return (
      <RaceReplayView
        sessionId={sessionId}
        initialTimeSec={numberParam(searchParams.get('t'))}
        initialSlot={numberParam(searchParams.get('car'))}
        initialLapNumber={numberParam(searchParams.get('lap'))}
        onClose={closeRace}
        onOpenLap={(driver, lap) => {
          setFromRace(true);
          updateSearchParams(searchParams, setSearchParams, {
            mode: null, t: null, car: null, lap: null, driverOrdinal: String(driver), lapOrdinal: String(lap),
            baselineSessionId: null, baselineDriverOrdinal: null, baselineLapOrdinal: null,
          });
        }}
        onStateChange={(timeSec, slot) => updateSearchParams(searchParams, setSearchParams, {
          t: String(timeSec), car: slot === null ? null : String(slot), lap: null,
        })}
      />
    );
  }

  const driverOrdinal = Number(searchParams.get('driverOrdinal') ?? 0);
  const lapOrdinal = Number(searchParams.get('lapOrdinal') ?? 0);
  const baselineDriverOrdinal = Number(searchParams.get('baselineDriverOrdinal') ?? 0);
  const baselineLapOrdinal = Number(searchParams.get('baselineLapOrdinal'));
  const baselineSession = searchParams.get('baselineSessionId');
  const corner = searchParams.get('corner');

  return (
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
        isExpanded={fullscreen === 'true' || fullscreen === '1'}
        onToggleExpanded={(expanded) => updateSearchParams(searchParams, setSearchParams, { fullscreen: expanded })}
        view={view}
        onViewChange={(newView) => updateSearchParams(searchParams, setSearchParams, { view: newView })}
      />
    </GhostSyncContext.Provider>
    </RaceModeContext.Provider>
  );
};
