import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';
import { ReferenceLaptimeEntry, PaceCategory, DetailedSession, ComparableLap } from '../../../shared/types/index.js';
import { computeTheoreticalBest, getDisplayTrackName } from '../../../shared/domain/formatters.js';
import {
  getPaceCategoryFromPercentage,
} from '../../../shared/domain/paceCategory.js';
import { createTheoreticalBestLap } from '../../../shared/domain/lapComparison.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../api/apiClient.js';
import { loadLeaderboardLayouts } from '../../api/leaderboardApi.js';
import type { LeaderboardLayout } from '../../../shared/types/leaderboard.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';

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
  page?: number;
  pageSize?: number;
  total?: number;
}

export interface UseCompareLapsParams {
  availableTracks?: string[];
  sessions?: (SessionCard | DetailedSession)[];
  initialTrack?: string;
  initialCarClass?: string;
  initialSessionId?: string;
  initialLapNumber?: number;
  initialCompareSessionId?: string;
  initialCompareDriver?: string;
  initialCompareLapNumber?: number;
  initialCompareDriverOrdinal?: number;
  initialCompareLapOrdinal?: number;
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
  availableTracks: suppliedTracks,
  sessions = [],
  initialTrack,
  initialCarClass,
  initialSessionId,
  initialLapNumber,
  initialCompareSessionId,
  initialCompareDriver,
  initialCompareLapNumber,
  initialCompareDriverOrdinal,
  initialCompareLapOrdinal,
  compareRequest,
}: UseCompareLapsParams) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [layoutTracks, setLayoutTracks] = useState<string[]>([]);
  const [locatorLaps, setLocatorLaps] = useState<ComparableLap[]>([]);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);

  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      const name = getDisplayTrackName(s.trackVenue, s.trackCourse);
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [sessions]);

  useEffect(() => {
    if (suppliedTracks !== undefined || sessions.length > 0) return;
    const controller = new AbortController();
    loadLeaderboardLayouts(controller.signal)
      .then((layouts: LeaderboardLayout[]) => setLayoutTracks([...new Set(layouts.map((item) => item.trackName).filter(Boolean))].sort()))
      .catch((error: unknown) => { if (!isAbortError(error)) setLayoutTracks([]); });
    return () => controller.abort();
  }, [sessions.length, suppliedTracks]);

  const selectedTrack = searchParams.get('track') || initialTrack || (availableTracks.length > 0 ? availableTracks[0] : layoutTracks[0] || 'Bahrain');
  const rawCarClass = searchParams.get('carClass') || initialCarClass || 'GT3';
  const selectedCarClass = rawCarClass;
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
      page: String(page),
      pageSize: '50',
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
  }, [selectedTrack, selectedCarClass, lapScope, page]);

  useEffect(() => {
    const sessionId = searchParams.get('sessionId') || initialSessionId;
    const lapNumberRaw = searchParams.get('lapNumber');
    const lapNumber = lapNumberRaw ? Number.parseInt(lapNumberRaw, 10) : initialLapNumber;
    const driverOrdinalRaw = searchParams.get('driverOrdinal');
    const lapOrdinalRaw = searchParams.get('lapOrdinal');
    const driverOrdinal = driverOrdinalRaw === null ? undefined : Number.parseInt(driverOrdinalRaw, 10);
    const lapOrdinal = lapOrdinalRaw === null ? undefined : Number.parseInt(lapOrdinalRaw, 10);
    const compareSessionId = searchParams.get('compareSessionId') || initialCompareSessionId;
    const compareDriverOrdinalRaw = searchParams.get('compareDriverOrdinal');
    const compareLapOrdinalRaw = searchParams.get('compareLapOrdinal');
    const compareDriverOrdinal = compareDriverOrdinalRaw === null ? initialCompareDriverOrdinal : Number.parseInt(compareDriverOrdinalRaw, 10);
    const compareLapOrdinal = compareLapOrdinalRaw === null ? initialCompareLapOrdinal : Number.parseInt(compareLapOrdinalRaw, 10);
    const compareLapNumberRaw = searchParams.get('compareLapNumber');
    const compareLapNumber = compareLapNumberRaw ? Number.parseInt(compareLapNumberRaw, 10) : initialCompareLapNumber;
    const targets = [
      { id: sessionId, lapNumber, driverOrdinal, lapOrdinal },
      { id: compareSessionId, lapNumber: compareLapNumber, driverOrdinal: compareDriverOrdinal, lapOrdinal: compareLapOrdinal },
    ].filter((target, index) => target.id && (Number.isInteger(target.driverOrdinal) && Number.isInteger(target.lapOrdinal) || Number.isInteger(target.lapNumber)) && (index === 0 || target.id !== sessionId || target.driverOrdinal !== driverOrdinal || target.lapOrdinal !== lapOrdinal));
    if (targets.length === 0) { setLocatorLaps([]); return; }
    const controller = new AbortController();
    const requests = targets.map(target => {
      const query = new URLSearchParams({ track: selectedTrack, carClass: selectedCarClass, playerOnly: 'false', humansOnly: 'true', sessionId: target.id!, page: '1', pageSize: '1' });
      if (Number.isInteger(target.driverOrdinal)) query.set('driverOrdinal', String(target.driverOrdinal));
      if (Number.isInteger(target.lapOrdinal)) query.set('lapOrdinal', String(target.lapOrdinal));
      if (Number.isInteger(target.lapNumber)) query.set('lapNumber', String(target.lapNumber));
      return fetchJson<CompareLapsApiData>(`/api/compare/laps?${query.toString()}`, { signal: controller.signal });
    });
    Promise.all(requests)
      .then((results) => setLocatorLaps(results.flatMap(result => result.laps)))
      .catch((error: unknown) => { if (!isAbortError(error)) setLocatorLaps([]); });
    return () => controller.abort();
  }, [searchParams, initialSessionId, initialLapNumber, initialCompareSessionId, initialCompareLapNumber, initialCompareDriverOrdinal, initialCompareLapOrdinal, selectedTrack, selectedCarClass]);

  const targetSessionId = searchParams.get('sessionId') || initialSessionId || undefined;
  const targetLapNumber =
      searchParams.get('lapNumber')
      ? parseInt(searchParams.get('lapNumber')!, 10)
      : initialLapNumber;
  const targetCompareSessionId = searchParams.get('compareSessionId') || initialCompareSessionId || undefined;
  const targetCompareDriver = searchParams.get('compareDriver') || initialCompareDriver || undefined;
  const targetCompareLapNumber =
    searchParams.get('compareLapNumber')
      ? parseInt(searchParams.get('compareLapNumber')!, 10)
      : initialCompareLapNumber;
  const targetCompareDriverOrdinal = searchParams.get('compareDriverOrdinal') === null ? initialCompareDriverOrdinal : Number.parseInt(searchParams.get('compareDriverOrdinal') || '', 10);
  const targetCompareLapOrdinal = searchParams.get('compareLapOrdinal') === null ? initialCompareLapOrdinal : Number.parseInt(searchParams.get('compareLapOrdinal') || '', 10);

  // The player's personal best is the server's exact one (dry, clean); without it there is none, never the fastest lap of the page.
  const allTimePBObject: ComparableLap | null = useMemo(() => apiData.playerBestLap
    ? { ...apiData.playerBestLap, isAllTimePB: true, tag: apiData.playerBestLap.tag || 'Personal best' }
    : null, [apiData.playerBestLap]);

  useEffect(() => {
    // Until the laps of a newly selected track or class arrive (the URL can change it, not only the
    // ribbon), apiData still holds the previous selection's laps: never pick from those.
    if (loadedScope !== lapScope) return;

    const currentScope = `${selectedTrack}__${selectedCarClass}__${targetSessionId || ''}__${targetLapNumber ?? ''}__${searchParams.get('driverOrdinal') ?? ''}__${searchParams.get('lapOrdinal') ?? ''}__${targetCompareSessionId || ''}__${targetCompareDriverOrdinal ?? targetCompareDriver ?? ''}__${targetCompareLapOrdinal ?? targetCompareLapNumber ?? ''}`;
    if (initializedScopeRef.current === currentScope) return;

    const candidates: ComparableLap[] = [];
    const targetDriverOrdinal = searchParams.get('driverOrdinal') === null ? undefined : Number.parseInt(searchParams.get('driverOrdinal') || '', 10);
    const targetLapOrdinal = searchParams.get('lapOrdinal') === null ? undefined : Number.parseInt(searchParams.get('lapOrdinal') || '', 10);
    const findSessionLap = (sessionId?: string, driverName?: string, lapNumber?: number) => [...locatorLaps, ...apiData.laps].find(
      lap => lap.sessionId === sessionId &&
        (driverName === undefined || lap.driverName === driverName) &&
        (sessionId !== targetSessionId || targetDriverOrdinal === undefined || lap.driverOrdinal === targetDriverOrdinal) &&
        (sessionId !== targetSessionId || targetLapOrdinal === undefined || lap.lapOrdinal === targetLapOrdinal) &&
        (lapNumber === undefined || lap.lapNumber === lapNumber)
    );

    const compareLap = [...locatorLaps, ...apiData.laps].find(lap => lap.sessionId === targetCompareSessionId &&
      (targetCompareDriverOrdinal === undefined || lap.driverOrdinal === targetCompareDriverOrdinal) &&
      (targetCompareLapOrdinal === undefined || lap.lapOrdinal === targetCompareLapOrdinal) &&
      (targetCompareDriverOrdinal !== undefined || targetCompareDriver === undefined || lap.driverName === targetCompareDriver) &&
      (targetCompareLapNumber === undefined || lap.lapNumber === targetCompareLapNumber));
    if (compareLap) candidates.push({ ...compareLap, tag: compareLap.tag || `Lap ${compareLap.lapNumber}` });

    const targetLap = findSessionLap(targetSessionId, undefined, targetLapNumber);
    if (targetLap && !candidates.some(candidate => candidate.id === targetLap.id)) {
      candidates.push({ ...targetLap, tag: targetLap.tag || `Lap ${targetLap.lapNumber}` });
    }

    if (allTimePBObject && !candidates.some((c) => c.id === allTimePBObject.id)) candidates.push(allTimePBObject);

    const initialSlice = candidates.slice(0, MAX_COMPARED_LAPS);
    setSelectedLaps(initialSlice);
    setBaselineLapId(initialSlice.length > 0 ? initialSlice[0].id : '');
    // A lap opened from its session (no pair asked for): offer what to set against it right away.
    if (targetLap && !compareLap) {
      setPickerTarget({ replaceId: initialSlice.find((l) => l.id !== targetLap.id)?.id ?? null });
    }
    initializedScopeRef.current = currentScope;
  }, [apiData, allTimePBObject, locatorLaps, loadedScope, lapScope, selectedTrack, selectedCarClass, targetSessionId, targetLapNumber, targetCompareSessionId, targetCompareDriver, targetCompareLapNumber, targetCompareDriverOrdinal, targetCompareLapOrdinal, searchParams]);

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

  const isPBInComparison = Boolean(allTimePBObject && selectedLaps.some((l) => l.id === allTimePBObject.id));

  const handleAddPersonalBest = () => {
    if (allTimePBObject && !isPBInComparison) handleToggleLap(allTimePBObject);
  };

  const handleAddTheoreticalBest = () => {
    if (!apiData.bestS1 || !apiData.bestS2 || !apiData.bestS3) return;
    const theoTime = computeTheoreticalBest(apiData.bestS1, apiData.bestS2, apiData.bestS3) ?? 0;
    const matchingRef = apiData.benchmarks.find((b) => (b.carClass === selectedCarClass));

    let pacePercentage: number | null = null;
    let paceCategory: PaceCategory | null = null;
    if (matchingRef?.targets.alienSec && theoTime > 0) {
      pacePercentage = parseFloat(((theoTime / matchingRef.targets.alienSec) * 100).toFixed(2));
      paceCategory = getPaceCategoryFromPercentage(pacePercentage);
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

  // The server's exact fastest valid lap on the track; none when it has none.
  const overallTrackBestObject: ComparableLap | null = useMemo(() => apiData.overallTrackBestLap
    ? { ...apiData.overallTrackBestLap, tag: apiData.overallTrackBestLap.tag || 'All-time best' }
    : null, [apiData.overallTrackBestLap]);

  const isOverallBestInComparison = Boolean(
    overallTrackBestObject && selectedLaps.some((l) => l.id === overallTrackBestObject.id)
  );

  const handleAddOverallTrackBest = () => {
    if (overallTrackBestObject && !isOverallBestInComparison) handleToggleLap(overallTrackBestObject);
  };

  const deckLaps = useMemo(() => deckOrder(selectedLaps), [selectedLaps]);
  const changePage = (nextPage: number) => {
    updateSearchParams(searchParams, setSearchParams, { page: nextPage <= 1 ? null : String(nextPage) });
  };

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
    availableTracks: suppliedTracks ?? (availableTracks.length > 0 ? availableTracks : layoutTracks),
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
    page,
    pageCount: Math.max(1, Math.ceil((apiData.total ?? apiData.laps.length) / (apiData.pageSize ?? 50))),
    changePage,
    pickerLaps: [...apiData.laps, ...locatorLaps.filter((lap) => !apiData.laps.some((item) => item.id === lap.id))],
  };
}
