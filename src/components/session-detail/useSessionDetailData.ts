import { useState, useEffect, useMemo } from 'react';
import { DetailedSession, SessionProgressionPoint } from '../../../server/types.js';
import { matchesTrack, matchesCarClass, findReferenceEntry } from '../../utils/paceCategory.js';
import { findRelatedSession } from './sessionDetailHelpers.js';

export interface UseSessionDetailDataParams {
  sessionId: string;
  onSelectSession?: (sessionId: string) => void;
  initialProgression?: SessionProgressionPoint[];
  initialSessions?: any[];
}

// Module-level in-memory cache for instant sub-millisecond session switching
export const clientSessionCache = new Map<string, DetailedSession>();
let clientRefCache: any = null;

export function clearSessionDetailCache() {
  clientSessionCache.clear();
  clientRefCache = null;
}

export function useSessionDetailData({
  sessionId,
  onSelectSession,
  initialProgression,
  initialSessions,
}: UseSessionDetailDataParams) {
  const cachedInitial = clientSessionCache.get(sessionId) || null;
  const [session, setSession] = useState<DetailedSession | null>(cachedInitial);
  const [refCache, setRefCache] = useState<any>(clientRefCache);
  const [progression, setProgression] = useState<SessionProgressionPoint[]>(
    initialProgression || []
  );
  const [allSessions, setAllSessions] = useState<any[]>(
    initialSessions || []
  );
  const [loading, setLoading] = useState<boolean>(!cachedInitial);
  const [selectedDriverName, setSelectedDriverName] = useState<string>(() => {
    if (cachedInitial?.playerDriver) return cachedInitial.playerDriver.name;
    if (cachedInitial?.drivers?.[0]) return cachedInitial.drivers[0].name;
    return '';
  });
  const [copiedReplay, setCopiedReplay] = useState<boolean>(false);
  const [showIncidentsLog, setShowIncidentsLog] = useState<boolean>(false);
  const [chartMetric, setChartMetric] = useState<'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions'>('lapTime');
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});

  const handleLegendClick = (e: any) => {
    if (!e || !e.dataKey) return;
    const key = String(e.dataKey);
    setHiddenSeries((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    if (initialProgression && initialProgression.length > 0) {
      setProgression(initialProgression);
    }
  }, [initialProgression]);

  useEffect(() => {
    if (initialSessions && initialSessions.length > 0) {
      setAllSessions(initialSessions);
    }
  }, [initialSessions]);

  useEffect(() => {
    let isCurrent = true;
    const memCached = clientSessionCache.get(sessionId);
    if (memCached) {
      setSession(memCached);
      if (memCached.playerDriver) {
        setSelectedDriverName(memCached.playerDriver.name);
      } else if (memCached.drivers?.[0]) {
        setSelectedDriverName(memCached.drivers[0].name);
      }
      setLoading(false);
    } else {
      setLoading(true);
    }

    // 1. Fetch Session Telemetry Data (primary critical path)
    fetch(`/api/session/${sessionId}`)
      .then((res) => res.json())
      .then((sessionData) => {
        if (!isCurrent) return;
        if (sessionData && !sessionData.error) {
          clientSessionCache.set(sessionId, sessionData);
          setSession(sessionData);
          if (sessionData.playerDriver) {
            setSelectedDriverName(sessionData.playerDriver.name);
          } else if (sessionData.drivers && sessionData.drivers.length > 0) {
            setSelectedDriverName(sessionData.drivers[0].name);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isCurrent) return;
        console.error('Failed to load session detail data:', err);
        setLoading(false);
      });

    // 2. Fetch Reference Targets (if not yet cached in memory)
    if (!clientRefCache) {
      fetch('/api/reference-laptimes')
        .then((res) => res.json())
        .then((refData) => {
          if (!isCurrent) return;
          clientRefCache = refData;
          setRefCache(refData);
        })
        .catch(() => null);
    }

    // 3. Fetch Progression in background (if not supplied via props)
    if (!initialProgression || initialProgression.length === 0) {
      fetch('/api/progression')
        .then((res) => res.json())
        .then((progData) => {
          if (!isCurrent) return;
          if (Array.isArray(progData)) {
            setProgression(progData);
          }
        })
        .catch(() => null);
    }

    // 4. Fetch All Sessions summary in background (if not supplied via props)
    if (!initialSessions || initialSessions.length === 0) {
      fetch('/api/sessions')
        .then((res) => res.json())
        .then((allSessionsData) => {
          if (!isCurrent) return;
          if (Array.isArray(allSessionsData)) {
            setAllSessions(allSessionsData);
          }
        })
        .catch(() => null);
    }

    return () => {
      isCurrent = false;
    };
  }, [sessionId, initialProgression, initialSessions]);

  const selectedDriver = useMemo(() => {
    if (!session) return undefined;
    return session.drivers
      ? session.drivers.find((d) => d.name === selectedDriverName) || session.drivers[0]
      : undefined;
  }, [session, selectedDriverName]);

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
      session.drivers.map((d) => (d.carClass || '').trim().toLowerCase()).filter(Boolean)
    );
    return uniqueClasses.size > 1;
  }, [session]);

  const activeChartMetric =
    (chartMetric === 'tireWear' && !hasTireWearData) || (chartMetric === 'fuelEnergy' && !hasFuelData)
      ? 'lapTime'
      : chartMetric;

  const allTimeCategoryTrackPB = useMemo(() => {
    if (!session || !selectedDriver || progression.length === 0) return null;
    const driverClass = selectedDriver.carClass || selectedDriver.carType || '';
    const driverNorm = (selectedDriver.name || '').toLowerCase().trim();

    const matchingLapTimes = progression
      .filter((p) => {
        const isTrack =
          matchesTrack(session.trackVenue, p.trackVenue, p.trackCourse) ||
          matchesTrack(p.displayTrack || p.trackVenue, session.trackVenue, session.trackCourse);
        const isClass =
          matchesCarClass(p.carClass, p.carType, driverClass) ||
          matchesCarClass(driverClass, selectedDriver.carType, p.carClass);
        const isDriver =
          !driverNorm ||
          (p.driverName || '').toLowerCase().trim() === driverNorm ||
          (p.driverName || '').toLowerCase().includes(driverNorm) ||
          driverNorm.includes((p.driverName || '').toLowerCase());
        return isTrack && isClass && isDriver && p.bestLapTime !== null && p.bestLapTime > 0;
      })
      .map((p) => p.bestLapTime as number);

    return matchingLapTimes.length > 0 ? Math.min(...matchingLapTimes) : selectedDriver.bestLapTime;
  }, [session, selectedDriver, progression]);

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
          selectedDriver.carClass || selectedDriver.carType,
          selectedDriver.carType
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

  const handleCopyReplayPath = () => {
    if (session?.matchingReplayFile) {
      navigator.clipboard.writeText(session.matchingReplayFile.path);
      setCopiedReplay(true);
      setTimeout(() => setCopiedReplay(false), 2000);
    }
  };

  const handleExportCsv = () => {
    if (!selectedDriver || !session) return;
    const headers = [
      'Lap',
      'LapTime_Seconds',
      'LapTime_Formatted',
      'DeltaPrevLap_Seconds',
      'DeltaOptimal_Seconds',
      'PaceCategory',
      'PacePercentage',
      'S1',
      'S2',
      'S3',
      'TopSpeed_kmh',
      'FrontTire',
      'RearTire',
      'PitStop',
      'Valid',
    ];
    const theo = selectedDriver.theoreticalBest;
    const rows = selectedDriver.laps.map((l, idx, allLaps) => {
      const prevLap = idx > 0 ? allLaps[idx - 1] : null;
      const prevDelta = l.lapTime && prevLap && prevLap.lapTime ? (l.lapTime - prevLap.lapTime).toFixed(3) : '';
      const optDelta = l.lapTime && theo ? (l.lapTime - theo).toFixed(3) : '';

      return [
        l.lapNum,
        l.lapTime || '',
        l.lapTimeString,
        prevDelta,
        optDelta,
        l.paceCategory || '',
        l.pacePercentage ? `${l.pacePercentage}%` : '',
        l.s1 || '',
        l.s2 || '',
        l.s3 || '',
        l.topSpeed || '',
        l.fCompound,
        l.rCompound,
        l.isPitStop ? 'Yes' : 'No',
        l.isValid ? 'Yes' : 'No',
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${session.trackVenue}_${session.sessionName}_${selectedDriver.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const candidatePool = allSessions.length > 0 ? allSessions : progression;
  const relatedSession = useMemo(() => {
    return findRelatedSession(session, candidatePool);
  }, [session, candidatePool]);

  const handleNavigateToSession = (targetId: string) => {
    if (onSelectSession) {
      onSelectSession(targetId);
    } else {
      window.location.hash = `#session/${encodeURIComponent(targetId)}`;
    }
  };

  return {
    session,
    loading,
    selectedDriver,
    selectedDriverName,
    setSelectedDriverName,
    copiedReplay,
    showIncidentsLog,
    setShowIncidentsLog,
    chartMetric,
    setChartMetric,
    hiddenSeries,
    handleLegendClick,
    handleCopyReplayPath,
    handleExportCsv,
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
    relatedSession,
  };
}
