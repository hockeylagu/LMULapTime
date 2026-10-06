import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { ReferenceLaptimeEntry, PaceCategory, DetailedSession, ComparableLap } from '../../../shared/types/index.js';
import { getDisplayTrackName } from '../../../shared/domain/formatters.js';
import {
  matchesCarClass,
  getPaceCategoryFromPercentage,
} from '../../../shared/domain/paceCategory.js';
import { createTheoreticalBestLap } from '../../../shared/domain/lapComparison.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../api/apiClient.js';

/** The /api/compare/laps response. */
interface CompareLapsApiData {
  laps: ComparableLap[];
  allTimeBestLap: ComparableLap | null;
  playerBestLap?: ComparableLap | null;
  overallTrackBestLap?: ComparableLap | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBestSec: number | null;
  benchmarks: ReferenceLaptimeEntry[];
}

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
  initialCompareSessionId?: string;
  initialCompareDriver?: string;
  initialCompareLapNum?: number;
  /** Laps the page asks to compare now (a new key each time). */
  compareRequest?: CompareRequest | null;
}

/**
 * What the page asks of the comparison: a pair (the reference becomes the baseline), or one lap
 * picked on the leaderboard (added, or removed when it is already compared).
 */
export interface CompareRequest {
  key: number;
  lap: ComparableLap;
  reference?: ComparableLap;
  /** Also works out where the time is, without waiting for the click. */
  analyse?: boolean;
}

/** Laps compared at once: a lap and its reference. */
export const MAX_COMPARED_LAPS = 2;

/** The lap the deltas are measured against: the other driver's when one of the two is the player's. */
export function defaultBaselineId(laps: ComparableLap[]): string {
  const players = laps.filter((l) => l.isPlayer);
  if (laps.length === 2 && players.length === 1) return laps.find((l) => !l.isPlayer)!.id;
  return laps[0]?.id ?? '';
}

/** The laps left to right: the player's lap on the left of the other driver's, otherwise as picked. */
export function deckOrder(laps: ComparableLap[]): ComparableLap[] {
  if (laps.length === 2 && !laps[0].isPlayer && laps[1].isPlayer) return [laps[1], laps[0]];
  return laps;
}

/** Adds a lap, or removes it when it is compared already. Full, the newest pick stays with it. */
export function toggleComparedLap(laps: ComparableLap[], lap: ComparableLap): ComparableLap[] {
  if (laps.some((l) => l.id === lap.id)) return laps.filter((l) => l.id !== lap.id);
  if (laps.length >= MAX_COMPARED_LAPS) return [laps[laps.length - 1], lap];
  return [...laps, lap];
}

/**
 * Puts a picked lap in the comparison: in place of `replaceId` when that lap is compared, otherwise
 * in the empty slot (or, full, as a leaderboard pick would). A lap already compared stays as it is.
 */
export function placeComparedLap(laps: ComparableLap[], lap: ComparableLap, replaceId: string | null): ComparableLap[] {
  if (laps.some((l) => l.id === lap.id)) return laps;
  if (replaceId && laps.some((l) => l.id === replaceId)) return laps.map((l) => (l.id === replaceId ? lap : l));
  return toggleComparedLap(laps, lap);
}

/** The slot the lap picker fills: the compared lap it replaces, or null for the empty slot. */
export interface LapPickerTarget {
  replaceId: string | null;
}

const NO_COMPARE_LAPS: CompareLapsApiData = {
  laps: [],
  allTimeBestLap: null,
  playerBestLap: null,
  overallTrackBestLap: null,
  bestS1: null,
  bestS2: null,
  bestS3: null,
  theoreticalBestSec: null,
  benchmarks: [],
};

export function useCompareLapsData({
  sessions,
  initialTrack,
  initialCarClass,
  initialSessionId,
  initialLapNum,
  initialCompareSessionId,
  initialCompareDriver,
  initialCompareLapNum,
  compareRequest,
}: UseCompareLapsParams) {
  const [searchParams] = useSearchParams();

  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      const name = getDisplayTrackName(s.trackVenue, s.trackCourse);
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [sessions]);

  const selectedTrack = searchParams.get('track') || initialTrack || (availableTracks.length > 0 ? availableTracks[0] : 'Bahrain');
  const selectedCarClass = searchParams.get('carClass') || initialCarClass || 'LMGT3';
  const [loading, setLoading] = useState<boolean>(false);

  const [apiData, setApiData] = useState<CompareLapsApiData>(NO_COMPARE_LAPS);
  // Why the laps for the selected track could not be loaded; null otherwise.
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedLaps, setSelectedLaps] = useState<ComparableLap[]>([]);
  const [baselineLapId, setBaselineLapId] = useState<string>('');
  const [pickerTarget, setPickerTarget] = useState<LapPickerTarget | null>(null);

  const initializedScopeRef = useRef<string>('');
  // The track and class the laps in apiData were loaded for: laps are only picked from data of the current selection.
  const [loadedScope, setLoadedScope] = useState<string>('');
  const lapScope = `${selectedTrack}__${selectedCarClass}`;

  // The page picks the track and class (the ribbon): laps of the previous pick are never kept.
  const [selectionScope, setSelectionScope] = useState(lapScope);
  if (selectionScope !== lapScope) {
    setSelectionScope(lapScope);
    setSelectedLaps([]);
    setBaselineLapId('');
    setPickerTarget(null);
  }

  useEffect(() => {
    if (!selectedTrack) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    // The player's own laps and bests; the other drivers' laps come from the leaderboard.
    const query = new URLSearchParams({
      track: selectedTrack,
      carClass: selectedCarClass,
      playerOnly: 'true',
      // The compare page only ever shows real people: offline sessions' other drivers are AI.
      humansOnly: 'true',
    });
    fetchJson<CompareLapsApiData>(`/api/compare/laps?${query.toString()}`, { signal: controller.signal })
      .then((data) => {
        setApiData(data);
        setLoadedScope(lapScope);
        setLoading(false);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.error('Failed to fetch compare laps:', err);
        // Never leave the previous track's or layout's laps under the new selection.
        setApiData(NO_COMPARE_LAPS);
        setLoadedScope(lapScope);
        setLoadError(apiErrorMessage(err, 'The laps for this track could not be loaded.'));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [selectedTrack, selectedCarClass, lapScope]);

  const targetSessionId = searchParams.get('sessionId') || initialSessionId || undefined;
  const targetLapNum =
    searchParams.get('lapNum')
      ? parseInt(searchParams.get('lapNum')!, 10)
      : initialLapNum;
  const targetCompareSessionId = searchParams.get('compareSessionId') || initialCompareSessionId || undefined;
  const targetCompareDriver = searchParams.get('compareDriver') || initialCompareDriver || undefined;
  const targetCompareLapNum =
    searchParams.get('compareLapNum')
      ? parseInt(searchParams.get('compareLapNum')!, 10)
      : initialCompareLapNum;

  useEffect(() => {
    // Until the laps of a newly selected track or class arrive (the URL can change it, not only the
    // ribbon), apiData still holds the previous selection's laps: never pick from those.
    if (loadedScope !== lapScope) return;

    const currentScope = `${selectedTrack}__${selectedCarClass}__${targetSessionId || ''}__${targetLapNum ?? ''}__${targetCompareSessionId || ''}__${targetCompareDriver || ''}__${targetCompareLapNum ?? ''}`;
    if (initializedScopeRef.current === currentScope) return;

    const candidates: ComparableLap[] = [];
    const findSessionLap = (sessionId?: string, driverName?: string, lapNum?: number) => apiData.laps.find(
      lap => lap.sessionId === sessionId &&
        (driverName === undefined || lap.driverName === driverName) &&
        (lapNum === undefined || lap.lapNum === lapNum)
    );

    const compareLap = findSessionLap(targetCompareSessionId, targetCompareDriver, targetCompareLapNum);
    if (compareLap) candidates.push({ ...compareLap, tag: compareLap.tag || `Lap ${compareLap.lapNum}` });

    const targetLap = findSessionLap(targetSessionId, undefined, targetLapNum);
    if (targetLap && !candidates.some(candidate => candidate.id === targetLap.id)) {
      candidates.push({ ...targetLap, tag: targetLap.tag || `Lap ${targetLap.lapNum}` });
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
        tag: pbLap.tag || 'Personal best',
      };
      if (!candidates.some((c) => c.id === pbLapFormatted.id)) {
        candidates.push(pbLapFormatted);
      }
    }

    const initialSlice = candidates.slice(0, MAX_COMPARED_LAPS);
    setSelectedLaps(initialSlice);
    setBaselineLapId(initialSlice.length > 0 ? initialSlice[0].id : '');
    // A lap opened from its session (no pair asked for): offer what to set against it right away.
    if (targetLap && !compareLap) {
      setPickerTarget({ replaceId: initialSlice.find((l) => l.id !== targetLap.id)?.id ?? null });
    }
    initializedScopeRef.current = currentScope;
  }, [apiData, loadedScope, lapScope, selectedTrack, selectedCarClass, targetSessionId, targetLapNum, targetCompareSessionId, targetCompareDriver, targetCompareLapNum]);

  const handleToggleLap = (lap: ComparableLap) => {
    const next = toggleComparedLap(selectedLaps, lap);
    setSelectedLaps(next);
    // A lap added picks the baseline again; a lap removed only moves it when it was the baseline.
    if (next.length > selectedLaps.length || next.length === MAX_COMPARED_LAPS || !next.some((l) => l.id === baselineLapId)) {
      setBaselineLapId(defaultBaselineId(next));
    }
  };

  // What the page asked for (the leaderboard). Declared after the default selection above so that,
  // when the laps of the pick arrive in the same render, the request is what stays selected.
  const appliedRequestKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!compareRequest || appliedRequestKeyRef.current === compareRequest.key || loadedScope !== lapScope) return;
    appliedRequestKeyRef.current = compareRequest.key;
    if (compareRequest.reference) {
      setSelectedLaps([compareRequest.reference, compareRequest.lap]);
      setBaselineLapId(compareRequest.reference.id);
      return;
    }
    const next = toggleComparedLap(selectedLaps, compareRequest.lap);
    setSelectedLaps(next);
    setBaselineLapId(defaultBaselineId(next));
  }, [compareRequest, loadedScope, lapScope, selectedLaps]);

  const baselineLap = useMemo(() => {
    if (selectedLaps.length === 0) return null;
    return selectedLaps.find((l) => l.id === baselineLapId) || selectedLaps[0];
  }, [selectedLaps, baselineLapId]);

  const handleClearAll = () => {
    setSelectedLaps([]);
    setBaselineLapId('');
    setPickerTarget(null);
  };

  /** Fills the picker's slot. The lap replacing the baseline becomes the baseline. */
  const handlePickLap = (lap: ComparableLap) => {
    const replaceId = pickerTarget?.replaceId ?? null;
    const next = placeComparedLap(selectedLaps, lap, replaceId);
    setSelectedLaps(next);
    if (replaceId && replaceId === baselineLapId && next.some((l) => l.id === lap.id)) setBaselineLapId(lap.id);
    else if (!next.some((l) => l.id === baselineLapId)) setBaselineLapId(defaultBaselineId(next));
    setPickerTarget(null);
  };

  // The lap staying in the comparison while the picker fills the other slot.
  const pickerAnchor = pickerTarget
    ? selectedLaps.find((l) => l.id !== pickerTarget.replaceId) ?? null
    : null;
  const pickerReplacing = pickerTarget?.replaceId ? selectedLaps.find((l) => l.id === pickerTarget.replaceId) ?? null : null;

  const allTimePBObject: ComparableLap | null = useMemo(() => {
    const fastest = (list: ComparableLap[]) => [...list]
      .filter((l) => l.isValid && l.lapTime && l.lapTime > 0)
      .sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999))[0];
    // The laps loaded are the player's own (playerOnly), some without the flag.
    const best = apiData.playerBestLap ?? fastest(apiData.laps.filter((l) => l.isPlayer))
      ?? fastest(apiData.laps) ?? apiData.allTimeBestLap ?? null;
    return best ? { ...best, isAllTimePB: true, tag: best.tag || 'Personal best' } : null;
  }, [apiData.playerBestLap, apiData.allTimeBestLap, apiData.laps]);

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
      return { ...apiData.overallTrackBestLap, tag: apiData.overallTrackBestLap.tag || 'All-time best' };
    }
    const valid = apiData.laps.filter((l) => l.isValid && l.lapTime && l.lapTime > 0);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999));
    return sorted.length > 0 ? { ...sorted[0], tag: 'All-time best' } : null;
  }, [apiData.overallTrackBestLap, apiData.laps]);

  const isOverallBestInComparison = Boolean(
    overallTrackBestObject && selectedLaps.some((l) => l.id === overallTrackBestObject.id)
  );

  const handleAddOverallTrackBest = () => {
    if (overallTrackBestObject && !isOverallBestInComparison) handleToggleLap(overallTrackBestObject);
  };

  const deckLaps = useMemo(() => deckOrder(selectedLaps), [selectedLaps]);

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
    selectedCarClass,
    loading,
    loadError,
    apiData,
    selectedLaps,
    deckLaps,
    baselineLap,
    baselineLapId,
    setBaselineLapId,
    handleToggleLap,
    handleClearAll,
    pickerTarget,
    setPickerTarget,
    pickerAnchor,
    pickerReplacing,
    handlePickLap,
    allTimePBObject,
    isPBInComparison,
    handleAddPersonalBest,
    handleAddTheoreticalBest,
    overallTrackBestObject,
    isOverallBestInComparison,
    handleAddOverallTrackBest,
    comparedLaps,
    chartData,
  };
}
