import { useState, useEffect, useMemo, useRef } from 'react';
import { ReferenceLaptimeEntry, PaceCategory, DetailedSession } from '../../../server/types.js';
import { getDisplayTrackName } from '../../utils/formatters.js';
import {
  matchesCarClass,
  getPaceCategoryFromPercentage,
} from '../../utils/paceCategory.js';
import {
  ComparableLap,
  createTheoreticalBestLap,
  filterLapsByCarCategory,
} from '../../utils/lapComparison.js';
import { getHashRouteAndParams, updateHashParams } from '../../utils/urlParams.js';

export type AvailableLapsSortOption =
  | 'lap-asc'
  | 'lap-desc'
  | 'date-desc'
  | 'date-asc'
  | 'speed-desc'
  | 'speed-asc'
  | 's1-asc'
  | 's2-asc'
  | 's3-asc'
  | 'pace-asc';

export type CompareLapsSessionItem = DetailedSession | (Omit<Partial<DetailedSession>, 'sessionType'> & {
  id: string;
  trackVenue: string;
  trackCourse?: string;
  timeString?: string;
  sessionType?: string;
  sessionName?: string;
});

export interface UseCompareLapsParams {
  sessions: CompareLapsSessionItem[];
  initialTrack?: string;
  initialCarClass?: string;
  initialSessionId?: string;
  initialLapNum?: number;
}

export function useCompareLapsData({
  sessions,
  initialTrack,
  initialCarClass,
  initialSessionId,
  initialLapNum,
}: UseCompareLapsParams) {
  const { params } = getHashRouteAndParams();

  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      const name = getDisplayTrackName(s.trackVenue, s.trackCourse);
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [sessions]);

  const defaultTrack = initialTrack || params.get('track') || (availableTracks.length > 0 ? availableTracks[0] : 'Bahrain');
  const defaultCarClass = initialCarClass || params.get('carClass') || 'LMGT3';

  const [selectedTrack, setSelectedTrackState] = useState<string>(defaultTrack);
  const [selectedCarClass, setSelectedCarClassState] = useState<string>(defaultCarClass);
  const [selectedCarModel, setSelectedCarModelState] = useState<string>(params.get('model') || 'All');
  const [playerOnly, setPlayerOnlyState] = useState<boolean>(
    params.get('playerOnly') === 'false' ? false : true
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [availableLapsSort, setAvailableLapsSort] = useState<AvailableLapsSortOption>('lap-asc');
  const [hideEmpty, setHideEmptyState] = useState<boolean>(params.get('hideEmpty') !== 'false');

  const [apiData, setApiData] = useState<{
    laps: ComparableLap[];
    allTimeBestLap: ComparableLap | null;
    playerBestLap?: ComparableLap | null;
    overallTrackBestLap?: ComparableLap | null;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    theoreticalBestSec: number | null;
    benchmarks: ReferenceLaptimeEntry[];
  }>({
    laps: [],
    allTimeBestLap: null,
    playerBestLap: null,
    overallTrackBestLap: null,
    bestS1: null,
    bestS2: null,
    bestS3: null,
    theoreticalBestSec: null,
    benchmarks: [],
  });

  const [selectedLaps, setSelectedLaps] = useState<ComparableLap[]>([]);
  const [baselineLapId, setBaselineLapId] = useState<string>('');

  const initializedScopeRef = useRef<string>('');
  const hasFetchedRef = useRef<boolean>(false);

  const setSelectedTrack = (track: string) => {
    setSelectedTrackState(track);
    setSelectedCarModelState('All');
    setSelectedLaps([]);
    setBaselineLapId('');
    initializedScopeRef.current = '';
    hasFetchedRef.current = false;
    updateHashParams({ track, model: null });
  };

  const setSelectedCarClass = (carClass: string) => {
    setSelectedCarClassState(carClass);
    setSelectedCarModelState('All');
    setSelectedLaps([]);
    setBaselineLapId('');
    initializedScopeRef.current = '';
    hasFetchedRef.current = false;
    updateHashParams({ carClass, model: null });
  };

  const setSelectedCarModel = (model: string) => {
    setSelectedCarModelState(model);
    updateHashParams({ model });
  };

  const setPlayerOnly = (val: boolean) => {
    setPlayerOnlyState(val);
    if (!val) {
      setSelectedLaps([]);
      setBaselineLapId('');
      initializedScopeRef.current = '';
    }
    updateHashParams({ playerOnly: val ? null : 'false' });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateHashParams({ hideEmpty: hide });
  };

  useEffect(() => {
    if (!selectedTrack) return;
    setLoading(true);
    const query = new URLSearchParams({
      track: selectedTrack,
      carClass: selectedCarClass,
      playerOnly: String(playerOnly),
    });
    fetch(`/api/compare/laps?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setApiData(data);
        hasFetchedRef.current = true;
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch compare laps:', err);
        setLoading(false);
      });
  }, [selectedTrack, selectedCarClass, playerOnly]);

  const targetSessionId = initialSessionId || params.get('sessionId') || undefined;
  const targetLapNum =
    initialLapNum !== undefined
      ? initialLapNum
      : params.get('lapNum')
      ? parseInt(params.get('lapNum')!, 10)
      : undefined;

  useEffect(() => {
    if (!hasFetchedRef.current) return;

    const currentScope = `${selectedTrack}__${selectedCarClass}__${targetSessionId || ''}__${targetLapNum ?? ''}`;

    // If already initialized for this track and vehicle class scope,
    // preserve whatever laps the user has selected (keeps player laps when changing driver scope)
    if (initializedScopeRef.current === currentScope) {
      if (apiData.laps.length > 0) {
        setSelectedLaps((prevSelected) =>
          prevSelected.map((selLap) => {
            const fresh = apiData.laps.find((l) => l.id === selLap.id);
            if (!fresh) return selLap;
            return {
              ...fresh,
              tag: selLap.tag || fresh.tag,
              isAllTimePB: selLap.isAllTimePB || fresh.isAllTimePB,
              isTheoreticalBest: selLap.isTheoreticalBest || fresh.isTheoreticalBest,
            };
          })
        );
      }
      return;
    }

    const candidates: ComparableLap[] = [];

    if (!playerOnly) {
      setSelectedLaps([]);
      setBaselineLapId('');
      initializedScopeRef.current = currentScope;
      return;
    }

    if (targetSessionId) {
      const found = apiData.laps.find(
        (l) => l.sessionId === targetSessionId && (targetLapNum === undefined || l.lapNum === targetLapNum)
      );
      if (found) {
        candidates.push({
          ...found,
          tag: found.tag || `Lap ${found.lapNum}`,
        });
      }
    }

    const pbLap =
      apiData.playerBestLap ||
      apiData.allTimeBestLap ||
      (apiData.laps && apiData.laps.length > 0
        ? [...apiData.laps]
            .filter((l) => l.isValid && l.lapTime && l.lapTime > 0)
            .sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999))[0]
        : null);

    if (pbLap) {
      const pbLapFormatted: ComparableLap = {
        ...pbLap,
        isAllTimePB: true,
        tag: pbLap.tag || '⭐ Personal Best',
      };
      if (!candidates.some((c) => c.id === pbLapFormatted.id)) {
        candidates.push(pbLapFormatted);
      }
    }

    const initialSlice = candidates.slice(0, 4);
    setSelectedLaps(initialSlice);
    setBaselineLapId(initialSlice.length > 0 ? initialSlice[0].id : '');
    initializedScopeRef.current = currentScope;
  }, [apiData, selectedTrack, selectedCarClass, targetSessionId, targetLapNum]);

  const availableCarModels = useMemo(() => {
    const set = new Set<string>();
    apiData.laps.forEach((l) => {
      if (l.carType) set.add(l.carType);
    });
    return Array.from(set).sort();
  }, [apiData.laps]);

  const baseFilteredLaps = useMemo(() => {
    return filterLapsByCarCategory(apiData.laps, selectedCarClass, selectedCarModel);
  }, [apiData.laps, selectedCarClass, selectedCarModel]);

  const emptyCount = useMemo(() => {
    return baseFilteredLaps.filter((l) => !l.isValid || !l.lapTime || l.lapTime <= 0 || l.isPitStop).length;
  }, [baseFilteredLaps]);

  const displayLaps = useMemo(() => {
    let list = baseFilteredLaps;
    if (hideEmpty) {
      list = list.filter((l) => l.isValid && !l.isPitStop && l.lapTime !== null && l.lapTime > 0);
    }
    const sorted = [...list].sort((a, b) => {
      if (availableLapsSort === 'lap-asc') return (a.lapTime ?? 999999) - (b.lapTime ?? 999999);
      if (availableLapsSort === 'lap-desc') return (b.lapTime ?? -1) - (a.lapTime ?? -1);
      if (availableLapsSort === 'date-desc') return (b.dateString || '').localeCompare(a.dateString || '');
      if (availableLapsSort === 'date-asc') return (a.dateString || '').localeCompare(b.dateString || '');
      if (availableLapsSort === 'speed-desc') return (b.topSpeed ?? -1) - (a.topSpeed ?? -1);
      if (availableLapsSort === 'speed-asc') return (a.topSpeed ?? 999999) - (b.topSpeed ?? 999999);
      if (availableLapsSort === 's1-asc') return (a.s1 ?? 999999) - (b.s1 ?? 999999);
      if (availableLapsSort === 's2-asc') return (a.s2 ?? 999999) - (b.s2 ?? 999999);
      if (availableLapsSort === 's3-asc') return (a.s3 ?? 999999) - (b.s3 ?? 999999);
      if (availableLapsSort === 'pace-asc') return (a.pacePercentage ?? 999999) - (b.pacePercentage ?? 999999);
      return 0;
    });
    return playerOnly ? sorted : sorted.slice(0, 100);
  }, [baseFilteredLaps, hideEmpty, availableLapsSort, playerOnly]);

  const baselineLap = useMemo(() => {
    if (selectedLaps.length === 0) return null;
    return selectedLaps.find((l) => l.id === baselineLapId) || selectedLaps[0];
  }, [selectedLaps, baselineLapId]);

  const handleToggleLap = (lap: ComparableLap) => {
    const exists = selectedLaps.some((l) => l.id === lap.id);
    if (exists) {
      const next = selectedLaps.filter((l) => l.id !== lap.id);
      setSelectedLaps(next);
      if (baselineLapId === lap.id) {
        setBaselineLapId(next.length > 0 ? next[0].id : '');
      }
    } else {
      if (selectedLaps.length >= 4) {
        setSelectedLaps([...selectedLaps.slice(0, 3), lap]);
      } else {
        setSelectedLaps([...selectedLaps, lap]);
      }
      if (selectedLaps.length === 0) {
        setBaselineLapId(lap.id);
      }
    }
  };

  const handleClearAll = () => {
    setSelectedLaps([]);
    setBaselineLapId('');
  };

  const allTimePBObject: ComparableLap | null = useMemo(() => {
    if (apiData.playerBestLap) {
      return { ...apiData.playerBestLap, isAllTimePB: true, tag: apiData.playerBestLap.tag || '⭐ Personal Best' };
    }
    const playerValid = apiData.laps.filter((l) => (l.isPlayer || playerOnly) && l.isValid && l.lapTime && l.lapTime > 0);
    if (playerValid.length > 0) {
      const sorted = [...playerValid].sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999));
      return { ...sorted[0], isAllTimePB: true, tag: '⭐ Personal Best' };
    }
    if (apiData.allTimeBestLap) {
      return { ...apiData.allTimeBestLap, isAllTimePB: true, tag: apiData.allTimeBestLap.tag || '⭐ Personal Best' };
    }
    const valid = apiData.laps.filter((l) => l.isValid && l.lapTime && l.lapTime > 0);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999));
    return sorted.length > 0 ? { ...sorted[0], isAllTimePB: true, tag: '⭐ Personal Best' } : null;
  }, [apiData.playerBestLap, apiData.allTimeBestLap, apiData.laps, playerOnly]);

  const isPBInComparison = Boolean(allTimePBObject && selectedLaps.some((l) => l.id === allTimePBObject.id));

  const handleAddPersonalBest = () => {
    if (allTimePBObject && !isPBInComparison) handleToggleLap(allTimePBObject);
  };

  const handleAddTheoreticalBest = () => {
    if (!apiData.bestS1 || !apiData.bestS2 || !apiData.bestS3) return;
    const theoTime = apiData.bestS1 + apiData.bestS2 + apiData.bestS3;
    const matchingRef = apiData.benchmarks.find((b) => matchesCarClass(b.carClass, '', selectedCarClass)) || apiData.benchmarks[0];

    let pacePercentage: number | null = null;
    let paceCategory: PaceCategory | null = null;
    if (matchingRef?.target100Sec && theoTime > 0) {
      pacePercentage = parseFloat(((theoTime / matchingRef.target100Sec) * 100).toFixed(2));
      paceCategory = getPaceCategoryFromPercentage(pacePercentage);
    } else {
      const sampleLap = apiData.laps.find((l) => l.isValid && l.lapTime && l.pacePercentage);
      if (sampleLap?.lapTime && sampleLap.pacePercentage) {
        const target100 = sampleLap.lapTime / (sampleLap.pacePercentage / 100);
        pacePercentage = parseFloat(((theoTime / target100) * 100).toFixed(2));
        paceCategory = getPaceCategoryFromPercentage(pacePercentage);
      }
    }

    const theoLap = createTheoreticalBestLap(
      apiData.bestS1,
      apiData.bestS2,
      apiData.bestS3,
      'Theoretical Optimal',
      selectedCarClass,
      'Best Sectors Combined',
      '⚡ Theoretical Best',
      paceCategory,
      pacePercentage
    );
    if (!selectedLaps.some((l) => l.id === theoLap.id || l.isTheoreticalBest)) {
      handleToggleLap(theoLap);
    }
  };

  const overallTrackBestObject: ComparableLap | null = useMemo(() => {
    if (apiData.overallTrackBestLap) {
      return { ...apiData.overallTrackBestLap, tag: apiData.overallTrackBestLap.tag || '🏆 All-Time Best' };
    }
    const valid = apiData.laps.filter((l) => l.isValid && l.lapTime && l.lapTime > 0);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999));
    return sorted.length > 0 ? { ...sorted[0], tag: '🏆 All-Time Best' } : null;
  }, [apiData.overallTrackBestLap, apiData.laps]);

  const isOverallBestInComparison = Boolean(
    overallTrackBestObject && selectedLaps.some((l) => l.id === overallTrackBestObject.id)
  );

  const handleAddOverallTrackBest = () => {
    if (overallTrackBestObject && !isOverallBestInComparison) handleToggleLap(overallTrackBestObject);
  };

  const bestComparedS1 = useMemo(() => {
    const valid = selectedLaps.map((l) => l.s1).filter((v): v is number => v !== null && v > 0);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [selectedLaps]);

  const bestComparedS2 = useMemo(() => {
    const valid = selectedLaps.map((l) => l.s2).filter((v): v is number => v !== null && v > 0);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [selectedLaps]);

  const bestComparedS3 = useMemo(() => {
    const valid = selectedLaps.map((l) => l.s3).filter((v): v is number => v !== null && v > 0);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [selectedLaps]);

  const bestAvailableS1 = useMemo(() => {
    const valid = displayLaps.map((l) => l.s1).filter((v): v is number => v !== null && v > 0);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [displayLaps]);

  const bestAvailableS2 = useMemo(() => {
    const valid = displayLaps.map((l) => l.s2).filter((v): v is number => v !== null && v > 0);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [displayLaps]);

  const bestAvailableS3 = useMemo(() => {
    const valid = displayLaps.map((l) => l.s3).filter((v): v is number => v !== null && v > 0);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [displayLaps]);

  const comparedLaps = useMemo(() => {
    if (!baselineLap) return selectedLaps;
    return [baselineLap, ...selectedLaps.filter((l) => l.id !== baselineLap.id)];
  }, [selectedLaps, baselineLap]);

  const chartData = useMemo(() => {
    if (!baselineLap || comparedLaps.length === 0) return [];
    return (['s1', 's2', 's3', 'lapTime'] as const).map((key) => {
      const metricLabel = key === 'lapTime' ? 'Full Lap' : `Sector ${key.slice(1)}`;
      return {
        metric: metricLabel,
        metricKey: key,
        ...comparedLaps.reduce((acc, lap) => {
          const baseVal = baselineLap[key] ?? 0;
          const lapVal = lap[key] ?? 0;
          acc[lap.id] = baseVal > 0 && lapVal > 0 ? parseFloat((lapVal - baseVal).toFixed(3)) : 0;
          return acc;
        }, {} as Record<string, number>),
      };
    });
  }, [comparedLaps, baselineLap]);

  return {
    availableTracks,
    selectedTrack,
    setSelectedTrack,
    selectedCarClass,
    setSelectedCarClass,
    availableCarModels,
    selectedCarModel,
    setSelectedCarModel,
    playerOnly,
    setPlayerOnlyState: setPlayerOnly,
    setPlayerOnly,
    loading,
    availableLapsSort,
    setAvailableLapsSort,
    hideEmpty,
    setHideEmpty,
    apiData,
    selectedLaps,
    baselineLap,
    baselineLapId,
    setBaselineLapId,
    handleToggleLap,
    handleClearAll,
    allTimePBObject,
    isPBInComparison,
    handleAddPersonalBest,
    handleAddTheoreticalBest,
    overallTrackBestObject,
    isOverallBestInComparison,
    handleAddOverallTrackBest,
    bestComparedS1,
    bestComparedS2,
    bestComparedS3,
    bestAvailableS1,
    bestAvailableS2,
    bestAvailableS3,
    comparedLaps,
    chartData,
    displayLaps,
    emptyCount,
  };
}
