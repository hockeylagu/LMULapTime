import { useState, useEffect, useMemo } from 'react';
import { useSessionDataContext } from '../../api/sessionDataContext.js';
import type { LegendPayload } from 'recharts';
import { DetailedSession, SessionProgressionPoint, ReferenceLaptimesCache } from '../../../shared/types/index.js';
import { findReferenceEntry } from '../../../shared/domain/paceCategory.js';
import { findWeekendSessions, CandidateRelatedSession } from '../../../shared/domain/weekendSessions.js';
import type { WeekendSessionLink } from '../../../shared/domain/weekendSessions.js';
import { ApiError, apiErrorMessage, fetchJson, isAbortError } from '../../api/apiClient.js';
import { loadReferenceLaptimes, peekReferenceLaptimes } from '../../api/referenceApi.js';

export interface UseSessionDetailDataParams {
  sessionId: string;
  onSelectSession?: (sessionId: string) => void;
  initialProgression?: SessionProgressionPoint[];
  initialSessions?: DetailedSession[];
}

export function useSessionDetailData({
  sessionId,
  onSelectSession,
  initialProgression,
  initialSessions,
}: UseSessionDetailDataParams) {
  const { revision } = useSessionDataContext();
  const [loadedSession, setLoadedSession] = useState<{ sessionId: string; data: DetailedSession } | null>(null);
  const session = loadedSession?.sessionId === sessionId ? loadedSession.data : null;
  const [refCache, setRefCache] = useState<ReferenceLaptimesCache | null>(peekReferenceLaptimes);
  // Injected history supports isolated views; ordinary navigation reads compact context with the detail.
  // Read from props, never copied into state: a parent passing a new array on each render must not
  // restart loading (it re-rendered forever).
  const hasInitialProgression = initialProgression !== undefined;
  const hasInitialSessions = initialSessions !== undefined;
  const [personalBest, setPersonalBest] = useState<{
    session: DetailedSession; driverOrdinal: number; bestLapTime: number | null;
  } | null>(null);
  const [personalBestError, setPersonalBestError] = useState<string | null>(null);
  const [fetchedRelated, setFetchedRelated] = useState<WeekendSessionLink<CandidateRelatedSession>[]>([]);
  const progression = hasInitialProgression && initialProgression ? initialProgression : [];
  const allSessions = hasInitialSessions && initialSessions ? initialSessions : [];
  const [settledSessionId, setSettledSessionId] = useState<string | null>(null);
  const loading = !session && settledSessionId !== sessionId;
  // Why the session could not be loaded; null while loading, when loaded, or when the server has no such session.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDriverOrdinal, setSelectedDriverOrdinal] = useState<number | null>(null);
  const [chartMetric, setChartMetric] = useState<'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions'>('lapTime');
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const handleLegendClick = (e: LegendPayload) => {
    if (!e || !e.dataKey) return;
    const key = typeof e.dataKey === 'function' ? '' : String(e.dataKey);
    if (!key) return;
    setHiddenSeries((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    let isCurrent = true;
    const abortController = new AbortController();
    const { signal } = abortController;
    const existingSession = loadedSession?.sessionId === sessionId ? loadedSession.data : null;
    if (!existingSession) {
      setLoadedSession(null);
      setSettledSessionId(null);
      setSelectedDriverOrdinal(null);
    }
    setLoadError(null);

    // 1. Fetch Session Telemetry Data (primary critical path)
    fetchJson<DetailedSession & {historyContext?:{ready?:boolean;relatedSessions:WeekendSessionLink<CandidateRelatedSession>[];personalBests:Array<{driverOrdinal:number;bestLapTime:number|null}>}}>(`/api/session/${encodeURIComponent(sessionId)}`, { signal })
      .then((sessionData) => {
        if (!isCurrent) return;
        setLoadedSession({ sessionId, data: sessionData });
        setFetchedRelated(sessionData.historyContext?.relatedSessions ?? []);
        const driverOrdinal = sessionData.playerDriver?.driverOrdinal;
        const best = sessionData.historyContext?.personalBests?.find(item => item.driverOrdinal === driverOrdinal);
        if (driverOrdinal !== undefined && (best || sessionData.historyContext?.ready === false)) {
          setPersonalBest({ session: sessionData, driverOrdinal, bestLapTime: sessionData.historyContext?.ready === false ? null : best?.bestLapTime ?? null });
        }
        if (!existingSession && sessionData.playerDriver) {
          setSelectedDriverOrdinal(sessionData.playerDriver.driverOrdinal ?? null);
        }
        setLoadError(null);
        setSettledSessionId(sessionId);
      })
      .catch((err) => {
        if (!isCurrent || isAbortError(err)) return;
        console.error('Failed to load session detail data:', err);
        if (err instanceof ApiError && err.status === 404) {
          setLoadedSession((current) => current?.sessionId === sessionId ? null : current);
          setSelectedDriverOrdinal(null);
          setLoadError(null);
        } else {
          setLoadError(apiErrorMessage(err, 'The session could not be loaded.'));
        }
        setSettledSessionId(sessionId);
      });

    // 2. Fetch Reference Targets (shared across views until a benchmark refresh)
    loadReferenceLaptimes()
      .then((refData) => { if (isCurrent) setRefCache(refData); })
      .catch(() => null);

    return () => {
      isCurrent = false;
      abortController.abort();
    };
  }, [sessionId, hasInitialProgression, hasInitialSessions, revision]);

  const selectedDriver = useMemo(() => {
    if (!session) return undefined;
    if (!session.drivers || selectedDriverOrdinal === null) return undefined;
    return session.drivers.find(driver => driver.driverOrdinal === selectedDriverOrdinal);
  }, [session, selectedDriverOrdinal]);

  useEffect(() => {
    setPersonalBestError(null);
    if (!session || !selectedDriver || selectedDriver.driverOrdinal === undefined) return;
    const driverOrdinal = selectedDriver.driverOrdinal;
    if (personalBest?.session === session && personalBest.driverOrdinal === driverOrdinal) return;
    const controller = new AbortController();
    fetchJson<{ bestLapTime: number | null; ready: boolean }>(
      `/api/session/${encodeURIComponent(session.id)}/personal-best/${driverOrdinal}`, { signal: controller.signal }
    ).then(result => {
      if (!controller.signal.aborted) setPersonalBest({ session, driverOrdinal, bestLapTime: result.ready ? result.bestLapTime : null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setPersonalBestError(apiErrorMessage(error, 'Could not load the driver personal best.'));
      }
    });
    return () => controller.abort();
  }, [session, selectedDriver, personalBest]);

  const hasTireWearData = useMemo(() => {
    return (
      selectedDriver?.laps?.some(
        (l) => l.tireWear !== undefined && l.tireWear !== null && (l.tireWear.fl !== null || l.tireWear.avg !== null)
      ) ?? false
    );
  }, [selectedDriver]);

  const hasVirtualEnergyData = useMemo(() => {
    return (
      (selectedDriver?.laps?.some((l) => l.virtualEnergy !== null && l.virtualEnergy !== undefined) ||
        (selectedDriver?.avgVePerLap !== null && selectedDriver?.avgVePerLap !== undefined)) ??
      false
    );
  }, [selectedDriver]);

  const hasFuelData = useMemo(() => {
    return (
      (selectedDriver?.laps?.some(
        (l) => (l.fuel !== null && l.fuel !== undefined) || (l.virtualEnergy !== null && l.virtualEnergy !== undefined)
      ) ||
        (selectedDriver?.avgFuelPerLap !== null && selectedDriver?.avgFuelPerLap !== undefined) ||
        hasVirtualEnergyData) ??
      false
    );
  }, [selectedDriver, hasVirtualEnergyData]);

  const isMultiClass = useMemo(() => {
    if (!session?.drivers) return false;
    const uniqueClasses = new Set(
      session.drivers.map((d) => d.carClass).filter(Boolean)
    );
    return uniqueClasses.size > 1;
  }, [session]);

  const activeChartMetric =
    (chartMetric === 'tireWear' && !hasTireWearData) || (chartMetric === 'fuelEnergy' && !hasFuelData)
      ? 'lapTime'
      : chartMetric;

  const allTimeCategoryTrackPB = useMemo(() => {
    if (!session || !selectedDriver) return null;
    if (selectedDriver.driverOrdinal === undefined) return null;
    return personalBest?.session === session && personalBest.driverOrdinal === selectedDriver.driverOrdinal
      ? personalBest.bestLapTime : null;
  }, [session, selectedDriver, personalBest]);

  const isCurrentSessionAllTimePB =
    selectedDriver?.bestLapTime !== null &&
    allTimeCategoryTrackPB !== null &&
    (selectedDriver?.bestLapTime || 0) <= allTimeCategoryTrackPB + 0.0005;

  const refEntry = useMemo(() => {
    return refCache?.entries && session && selectedDriver
      ? findReferenceEntry(
          refCache.entries,
          session.trackVenue,
          session.trackCourse || '',
          selectedDriver.carClass
        )
      : null;
  }, [refCache, session, selectedDriver]);

  const fuelStrategy = useMemo(() => {
    if (!selectedDriver || !selectedDriver.avgFuelPerLap) return null;
    const avgFuel = selectedDriver.avgFuelPerLap;
    const estFuelLaps = selectedDriver.estFuelStintLaps || (avgFuel > 0 ? Math.floor(100 / avgFuel) : null);
    const avgVe = selectedDriver.avgVePerLap || null;
    const estVeLaps = selectedDriver.estVeStintLaps || (avgVe && avgVe > 0 ? Math.floor(100 / avgVe) : null);

    const optimalRatio = avgFuel > 0 && avgVe && avgVe > 0 ? parseFloat((avgFuel / avgVe).toFixed(2)) : null;
    const zeroWasteFuelPct = estVeLaps && avgFuel ? Math.min(100, Math.ceil((estVeLaps + 0.5) * avgFuel)) : null;

    let limiter: 've' | 'fuel' | 'balanced' | null = null;
    let lapDelta = 0;
    let surplusFuelPct = 0;

    if (estFuelLaps && estVeLaps) {
      if (estVeLaps < estFuelLaps - 1) {
        limiter = 've';
        lapDelta = estFuelLaps - estVeLaps;
        surplusFuelPct = Math.max(0, Math.round(100 - estVeLaps * avgFuel));
      } else if (estFuelLaps < estVeLaps - 1) {
        limiter = 'fuel';
        lapDelta = estVeLaps - estFuelLaps;
      } else {
        limiter = 'balanced';
      }
    }

    return {
      avgFuel,
      estFuelLaps,
      avgVe,
      estVeLaps,
      optimalRatio,
      zeroWasteFuelPct,
      limiter,
      lapDelta,
      surplusFuelPct,
    };
  }, [selectedDriver]);

  const candidatePool: CandidateRelatedSession[] = allSessions.length > 0 ? allSessions : progression;
  const relatedSessions = useMemo(() => {
    return hasInitialSessions ? findWeekendSessions(session, candidatePool) : fetchedRelated;
  }, [session, candidatePool, hasInitialSessions, fetchedRelated]);

  const handleNavigateToSession = (targetId: string) => {
    if (onSelectSession) {
      onSelectSession(targetId);
    }
  };

  return {
    session,
    loading,
    loadError,
    personalBestError,
    selectedDriver,
    selectedDriverOrdinal,
    setSelectedDriverOrdinal,
    chartMetric,
    setChartMetric,
    hiddenSeries,
    handleLegendClick,
    handleNavigateToSession,
    hasTireWearData,
    hasFuelData,
    hasVirtualEnergyData,
    isMultiClass,
    activeChartMetric,
    allTimeCategoryTrackPB,
    isCurrentSessionAllTimePB,
    refEntry,
    fuelStrategy,
    relatedSessions,
  };
}
