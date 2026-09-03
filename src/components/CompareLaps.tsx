import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Gauge,
  Flag,
  RotateCcw,
  Sparkles,
  Award,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  FilterX,
  Trophy,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';
import { ReferenceLaptimeEntry, PaceCategory } from '../../server/types.js';
import { formatTime, getDisplayTrackName } from '../utils/formatters.js';
import {
  getPaceCategoryStyle,
  formatPacePercentage,
  VEHICLE_CLASS_OPTIONS,
  matchesCarClass,
  getPaceCategoryFromPercentage,
} from '../utils/paceCategory.js';
import {
  ComparableLap,
  computeLapDeltas,
  createTheoreticalBestLap,
  filterLapsByCarCategory,
} from '../utils/lapComparison.js';
import { getHashRouteAndParams, updateHashParams } from '../utils/urlParams.js';

interface CompareLapsProps {
  sessions: any[];
  initialTrack?: string;
  initialCarClass?: string;
  initialSessionId?: string;
  initialLapNum?: number;
  onSelectSession?: (sessionId: string) => void;
}

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

export const CompareLaps: React.FC<CompareLapsProps> = ({
  sessions = [],
  initialTrack,
  initialCarClass,
  initialSessionId,
  initialLapNum,
  onSelectSession,
}) => {
  const { params } = getHashRouteAndParams();

  // Tracks available from sessions
  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => {
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
  const [playerOnly, setPlayerOnlyState] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [availableLapsSort, setAvailableLapsSort] = useState<AvailableLapsSortOption>('lap-asc');
  const [hideEmpty, setHideEmptyState] = useState<boolean>(params.get('hideEmpty') !== 'false');

  const [apiData, setApiData] = useState<{
    laps: ComparableLap[];
    allTimeBestLap: ComparableLap | null;
    overallTrackBestLap?: ComparableLap | null;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    theoreticalBestSec: number | null;
    benchmarks: ReferenceLaptimeEntry[];
  }>({
    laps: [],
    allTimeBestLap: null,
    overallTrackBestLap: null,
    bestS1: null,
    bestS2: null,
    bestS3: null,
    theoreticalBestSec: null,
    benchmarks: [],
  });

  const [selectedLaps, setSelectedLaps] = useState<ComparableLap[]>([]);
  const [baselineLapId, setBaselineLapId] = useState<string>('');

  const setSelectedTrack = (track: string) => {
    setSelectedTrackState(track);
    setSelectedCarModelState('All');
    setSelectedLaps([]);
    setBaselineLapId('');
    updateHashParams({ track, model: null });
  };

  const setSelectedCarClass = (carClass: string) => {
    setSelectedCarClassState(carClass);
    setSelectedCarModelState('All');
    setSelectedLaps([]);
    setBaselineLapId('');
    updateHashParams({ carClass, model: null });
  };

  const setSelectedCarModel = (model: string) => {
    setSelectedCarModelState(model);
    updateHashParams({ model });
  };

  const setHideEmpty = (hide: boolean) => {
    setHideEmptyState(hide);
    updateHashParams({ hideEmpty: hide });
  };

  // Fetch comparable laps from backend whenever track, class, or playerOnly changes
  useEffect(() => {
    if (!selectedTrack) return;
    setLoading(true);

    const query = new URLSearchParams({
      track: selectedTrack,
      carClass: selectedCarClass,
      playerOnly: String(playerOnly),
    });

    fetch(`/api/compare/laps?${query.toString()}`)
      .then(res => res.json())
      .then(data => {
        setApiData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch comparable laps:', err);
        setLoading(false);
      });
  }, [selectedTrack, selectedCarClass, playerOnly]);

  const targetSessionId = initialSessionId || params.get('sessionId') || undefined;
  const targetLapNum = initialLapNum !== undefined
    ? initialLapNum
    : params.get('lapNum')
    ? parseInt(params.get('lapNum')!, 10)
    : undefined;

  // Auto-populate comparison deck whenever apiData updates (e.g. when track or class changes)
  useEffect(() => {
    const candidates: ComparableLap[] = [];

    // 1. Try to find the specific initial lap requested
    if (targetSessionId) {
      const found = apiData.laps.find(
        l => l.sessionId === targetSessionId && (targetLapNum === undefined || l.lapNum === targetLapNum)
      );
      if (found) {
        candidates.push({
          ...found,
          tag: found.tag || `Lap ${found.lapNum}`,
        });
      }
    }

    // 2. ALWAYS add the Personal Best lap alongside the requested lap if available
    const pbLap = apiData.allTimeBestLap || (
      apiData.laps && apiData.laps.length > 0
        ? [...apiData.laps]
            .filter(l => l.isValid && l.lapTime && l.lapTime > 0)
            .sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999))[0]
        : null
    );

    if (pbLap) {
      const pbLapFormatted: ComparableLap = {
        ...pbLap,
        isAllTimePB: true,
        tag: pbLap.tag || '⭐ Personal Best',
      };
      if (!candidates.some(c => c.id === pbLapFormatted.id)) {
        candidates.push(pbLapFormatted);
      }
    }

    const initialSlice = candidates.slice(0, 4);
    setSelectedLaps(initialSlice);
    setBaselineLapId(initialSlice.length > 0 ? initialSlice[0].id : '');
  }, [apiData, selectedCarClass, targetSessionId, targetLapNum]);

  // Available car models in the current result set
  const availableCarModels = useMemo(() => {
    const models = new Set<string>();
    apiData.laps.forEach(l => {
      if (l.carType) models.add(l.carType);
    });
    return Array.from(models).sort();
  }, [apiData.laps]);

  // Filtered laps by car category & model
  const baseFilteredLaps = useMemo(() => {
    return filterLapsByCarCategory(apiData.laps, selectedCarClass, selectedCarModel);
  }, [apiData.laps, selectedCarClass, selectedCarModel]);

  // Count of empty/invalid/pit laps
  const emptyCount = useMemo(() => {
    return baseFilteredLaps.filter(l => !l.isValid || !l.lapTime || l.lapTime <= 0 || l.isPitStop).length;
  }, [baseFilteredLaps]);

  // Filtered and sorted laps for table display
  const displayLaps = useMemo(() => {
    let laps = baseFilteredLaps;
    if (hideEmpty) {
      laps = laps.filter(l => l.isValid && l.lapTime !== null && l.lapTime > 0 && !l.isPitStop);
    }
    
    return [...laps].sort((a, b) => {
      switch (availableLapsSort) {
        case 'lap-asc':
          return (a.lapTime ?? 9999) - (b.lapTime ?? 9999);
        case 'lap-desc':
          return (b.lapTime ?? -1) - (a.lapTime ?? -1);
        case 'date-desc':
          return (b.timestamp ?? 0) - (a.timestamp ?? 0);
        case 'date-asc':
          return (a.timestamp ?? 0) - (b.timestamp ?? 0);
        case 'speed-desc':
          return (b.topSpeed ?? 0) - (a.topSpeed ?? 0);
        case 'speed-asc':
          return (a.topSpeed ?? 999) - (b.topSpeed ?? 999);
        case 's1-asc':
          return (a.s1 ?? 9999) - (b.s1 ?? 9999);
        case 's2-asc':
          return (a.s2 ?? 9999) - (b.s2 ?? 9999);
        case 's3-asc':
          return (a.s3 ?? 9999) - (b.s3 ?? 9999);
        case 'pace-asc':
          return (a.pacePercentage ?? 999) - (b.pacePercentage ?? 999);
        default:
          return (a.lapTime ?? 9999) - (b.lapTime ?? 9999);
      }
    });
  }, [baseFilteredLaps, hideEmpty, availableLapsSort]);

  // Best sector times across all valid available laps currently displayed (with fallback to apiData track bests)
  const bestAvailableS1 = useMemo(() => {
    const valid = displayLaps
      .filter(l => l.isValid && l.s1 !== null && l.s1 !== undefined && l.s1 > 0)
      .map(l => l.s1 as number);
    if (valid.length > 0) return Math.min(...valid);
    return apiData.bestS1 ?? null;
  }, [displayLaps, apiData.bestS1]);

  const bestAvailableS2 = useMemo(() => {
    const valid = displayLaps
      .filter(l => l.isValid && l.s2 !== null && l.s2 !== undefined && l.s2 > 0)
      .map(l => l.s2 as number);
    if (valid.length > 0) return Math.min(...valid);
    return apiData.bestS2 ?? null;
  }, [displayLaps, apiData.bestS2]);

  const bestAvailableS3 = useMemo(() => {
    const valid = displayLaps
      .filter(l => l.isValid && l.s3 !== null && l.s3 !== undefined && l.s3 > 0)
      .map(l => l.s3 as number);
    if (valid.length > 0) return Math.min(...valid);
    return apiData.bestS3 ?? null;
  }, [displayLaps, apiData.bestS3]);

  // Active baseline lap
  const baselineLap = useMemo(() => {
    return selectedLaps.find(l => l.id === baselineLapId) || selectedLaps[0] || null;
  }, [selectedLaps, baselineLapId]);

  // Best sector times among currently selected laps in the comparison deck
  const bestComparedS1 = useMemo(() => {
    const valid = selectedLaps.filter(l => l.isValid && l.s1 !== null && l.s1 > 0).map(l => l.s1 as number);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [selectedLaps]);

  const bestComparedS2 = useMemo(() => {
    const valid = selectedLaps.filter(l => l.isValid && l.s2 !== null && l.s2 > 0).map(l => l.s2 as number);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [selectedLaps]);

  const bestComparedS3 = useMemo(() => {
    const valid = selectedLaps.filter(l => l.isValid && l.s3 !== null && l.s3 > 0).map(l => l.s3 as number);
    return valid.length > 0 ? Math.min(...valid) : null;
  }, [selectedLaps]);

  // Toggle selection of a lap
  const handleToggleLap = (lap: ComparableLap) => {
    const exists = selectedLaps.some(l => l.id === lap.id);
    if (exists) {
      const next = selectedLaps.filter(l => l.id !== lap.id);
      setSelectedLaps(next);
      if (baselineLapId === lap.id) {
        setBaselineLapId(next.length > 0 ? next[0].id : '');
      }
    } else {
      if (selectedLaps.length >= 4) {
        // Replace the last non-baseline lap or append if possible
        const next = [...selectedLaps.slice(0, 3), lap];
        setSelectedLaps(next);
      } else {
        const next = [...selectedLaps, lap];
        setSelectedLaps(next);
        if (!baselineLapId) {
          setBaselineLapId(lap.id);
        }
      }
    }
  };

  const handleAddTheoreticalBest = () => {
    if (!apiData.bestS1 || !apiData.bestS2 || !apiData.bestS3) return;
    const theoTime = parseFloat((apiData.bestS1 + apiData.bestS2 + apiData.bestS3).toFixed(3));

    const matchingRef = apiData.benchmarks.find(b =>
      matchesCarClass(b.carClass, '', selectedCarClass)
    ) || apiData.benchmarks[0];

    let pacePercentage: number | null = null;
    let paceCategory: PaceCategory | null = null;

    if (matchingRef?.target100Sec && theoTime > 0) {
      pacePercentage = parseFloat(((theoTime / matchingRef.target100Sec) * 100).toFixed(2));
      paceCategory = getPaceCategoryFromPercentage(pacePercentage);
    } else {
      const sampleLap = apiData.laps.find(l => l.isValid && l.lapTime && l.pacePercentage);
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
    if (!selectedLaps.some(l => l.id === theoLap.id || l.isTheoreticalBest)) {
      handleToggleLap(theoLap);
    }
  };

  // Personal Best Lap Object
  const allTimePBObject: ComparableLap | null = useMemo(() => {
    if (apiData.allTimeBestLap) {
      return {
        ...apiData.allTimeBestLap,
        isAllTimePB: true,
        tag: apiData.allTimeBestLap.tag || '⭐ Personal Best',
      };
    }
    const valid = apiData.laps.filter(l => l.isValid && l.lapTime && l.lapTime > 0);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999));
    return {
      ...sorted[0],
      isAllTimePB: true,
      tag: sorted[0].tag || '⭐ Personal Best',
    };
  }, [apiData]);

  const isPBInComparison = allTimePBObject
    ? selectedLaps.some(l => l.id === allTimePBObject.id)
    : false;

  const handleAddPersonalBest = () => {
    if (!allTimePBObject) return;
    if (selectedLaps.some(l => l.id === allTimePBObject.id)) return;
    if (selectedLaps.length >= 4) {
      alert('Maximum of 4 laps can be compared simultaneously.');
      return;
    }
    const updated = [...selectedLaps, allTimePBObject];
    setSelectedLaps(updated);
    if (!baselineLapId) setBaselineLapId(allTimePBObject.id);
  };

  // Overall Track Best Lap Object (Track record across ALL drivers on this track without driver restriction)
  const overallTrackBestObject: ComparableLap | null = useMemo(() => {
    if (apiData.overallTrackBestLap) {
      return {
        ...apiData.overallTrackBestLap,
        isOverallTrackBest: true,
        tag: apiData.overallTrackBestLap.tag || `🏆 All-Time Best (${apiData.overallTrackBestLap.driverName})`,
      };
    }
    if (apiData.allTimeBestLap) {
      return {
        ...apiData.allTimeBestLap,
        isOverallTrackBest: true,
        tag: `🏆 All-Time Best (${apiData.allTimeBestLap.driverName})`,
      };
    }
    const valid = apiData.laps.filter(l => l.isValid && l.lapTime && l.lapTime > 0);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => (a.lapTime || 9999) - (b.lapTime || 9999));
    return {
      ...sorted[0],
      isOverallTrackBest: true,
      tag: `🏆 All-Time Best (${sorted[0].driverName})`,
    };
  }, [apiData]);

  const isOverallBestInComparison = overallTrackBestObject
    ? selectedLaps.some(l => l.id === overallTrackBestObject.id)
    : false;

  const handleAddOverallTrackBest = () => {
    if (!overallTrackBestObject) return;
    if (selectedLaps.some(l => l.id === overallTrackBestObject.id)) return;
    if (selectedLaps.length >= 4) {
      alert('Maximum of 4 laps can be compared simultaneously.');
      return;
    }
    const updated = [...selectedLaps, overallTrackBestObject];
    setSelectedLaps(updated);
    if (!baselineLapId) setBaselineLapId(overallTrackBestObject.id);
  };

  const handleClearAll = () => {
    setSelectedLaps([]);
    setBaselineLapId('');
  };

  // Laps compared against the baseline (excluding baseline itself since its delta is always 0)
  const comparedLaps = useMemo(() => {
    if (!baselineLap) return [];
    return selectedLaps.filter(l => l.id !== baselineLap.id);
  }, [selectedLaps, baselineLap]);

  // Prepare sector time difference (delta vs baseline) chart data
  const chartData = useMemo(() => {
    if (!baselineLap || comparedLaps.length === 0) return [];

    return [
      {
        metric: 'Sector 1',
        metricKey: 's1' as const,
        ...comparedLaps.reduce((acc, lap) => {
          const baseVal = baselineLap.s1 ?? 0;
          const lapVal = lap.s1 ?? 0;
          acc[lap.id] = baseVal > 0 && lapVal > 0 ? parseFloat((lapVal - baseVal).toFixed(3)) : 0;
          return acc;
        }, {} as Record<string, number>),
      },
      {
        metric: 'Sector 2',
        metricKey: 's2' as const,
        ...comparedLaps.reduce((acc, lap) => {
          const baseVal = baselineLap.s2 ?? 0;
          const lapVal = lap.s2 ?? 0;
          acc[lap.id] = baseVal > 0 && lapVal > 0 ? parseFloat((lapVal - baseVal).toFixed(3)) : 0;
          return acc;
        }, {} as Record<string, number>),
      },
      {
        metric: 'Sector 3',
        metricKey: 's3' as const,
        ...comparedLaps.reduce((acc, lap) => {
          const baseVal = baselineLap.s3 ?? 0;
          const lapVal = lap.s3 ?? 0;
          acc[lap.id] = baseVal > 0 && lapVal > 0 ? parseFloat((lapVal - baseVal).toFixed(3)) : 0;
          return acc;
        }, {} as Record<string, number>),
      },
      {
        metric: 'Full Lap',
        metricKey: 'lapTime' as const,
        ...comparedLaps.reduce((acc, lap) => {
          const baseVal = baselineLap.lapTime ?? 0;
          const lapVal = lap.lapTime ?? 0;
          acc[lap.id] = baseVal > 0 && lapVal > 0 ? parseFloat((lapVal - baseVal).toFixed(3)) : 0;
          return acc;
        }, {} as Record<string, number>),
      },
    ];
  }, [comparedLaps, baselineLap]);

  // Color palette for compared laps
  const LAP_COLORS = ['#ECC94B', '#3182CE', '#38A169', '#E53E3E', '#9F7AEA'];

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30 flex items-center gap-1">
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Telemetry Studio
              </span>
              <span className="text-xs text-lmu-muted">Apples-to-Apples Sector & Speed Analysis</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white mt-1 flex items-center gap-2">
              Multi-Lap & Cross-Session Comparator
            </h2>
            <p className="text-xs text-lmu-muted mt-0.5">
              Compare any lap against Session Bests, Driver All-Time PBs, Theoretical Optimal Sectors, and Alien Reference Targets.
            </p>
          </div>

          {/* Quick Presets & Clear */}
          <div className="flex flex-wrap items-center gap-2">
            {allTimePBObject && !isPBInComparison && allTimePBObject.id !== overallTrackBestObject?.id && (
              <button
                onClick={handleAddPersonalBest}
                className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                title="Add your Personal Best lap for this track & category"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                + Personal Best ({formatTime(allTimePBObject.lapTime)})
              </button>
            )}

            {apiData.theoreticalBestSec && (
              <button
                onClick={handleAddTheoreticalBest}
                className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/40 text-purple-300 text-xs font-bold transition-all flex items-center gap-1.5"
                title="Add all-time theoretical optimal lap for this track & category"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                + Theoretical Best ({formatTime(apiData.theoreticalBestSec)})
              </button>
            )}

            {/* All-Time Best Lap for this Track across all drivers without driver restriction */}
            {overallTrackBestObject && !isOverallBestInComparison && (
              <button
                onClick={handleAddOverallTrackBest}
                className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                title={`Add all-time fastest lap on ${selectedTrack} by ${overallTrackBestObject.driverName} (${overallTrackBestObject.lapTimeString}) across all drivers`}
              >
                <Award className="w-3.5 h-3.5 text-amber-400" />
                + All-Time Best ({overallTrackBestObject.lapTimeString})
              </button>
            )}

            {selectedLaps.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded-xl bg-lmu-card hover:bg-rose-950/40 border border-lmu-border hover:border-rose-500/40 text-xs text-lmu-muted hover:text-rose-400 font-semibold transition-all flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="pt-4 border-t border-lmu-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Track Selector */}
          <div>
            <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
              Track
            </label>
            <select
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
              className="w-full bg-lmu-bg border border-lmu-border rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-lmu-accent"
            >
              {availableTracks.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Vehicle Category Selector */}
          <div>
            <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
              Vehicle Category
            </label>
            <select
              value={selectedCarClass}
              onChange={(e) => setSelectedCarClass(e.target.value)}
              className="w-full bg-lmu-bg border border-lmu-border rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-lmu-accent"
            >
              {VEHICLE_CLASS_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Car Model Selector */}
          <div>
            <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
              Car Model
            </label>
            <select
              value={selectedCarModel}
              onChange={(e) => setSelectedCarModel(e.target.value)}
              className="w-full bg-lmu-bg border border-lmu-border rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-lmu-accent"
            >
              <option value="All">All {selectedCarClass} Cars</option>
              {availableCarModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Driver Mode Filter */}
          <div className="flex flex-col justify-end">
            <label className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider block mb-1">
              Driver Scope
            </label>
            <div className="flex items-center gap-1 bg-lmu-bg p-1 rounded-xl border border-lmu-border">
              <button
                onClick={() => setPlayerOnlyState(true)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  playerOnly
                    ? 'bg-lmu-accent text-white shadow-sm font-bold'
                    : 'text-lmu-muted hover:text-white'
                }`}
              >
                ⭐ Player Only
              </button>
              <button
                onClick={() => setPlayerOnlyState(false)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  !playerOnly
                    ? 'bg-lmu-accent text-white shadow-sm font-bold'
                    : 'text-lmu-muted hover:text-white'
                }`}
              >
                All Drivers
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Side-by-Side Lap Comparison Deck */}
      {selectedLaps.length > 0 ? (
        <div className="glass-panel p-5 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Flag className="w-4 h-4 text-lmu-gold" />
                Side-by-Side Lap Telemetry Comparison ({selectedLaps.length}/4)
              </h3>
              <p className="text-xs text-lmu-muted mt-0.5">
                Set any lap as the <strong className="text-lmu-gold">Baseline</strong> for instant sector and velocity delta calculations.
              </p>
            </div>

            {/* Baseline Lap Indicator */}
            {baselineLap && (
              <div className="flex items-center gap-2 text-xs bg-lmu-bg px-3 py-1.5 rounded-xl border border-lmu-gold/40 text-lmu-gold font-medium">
                <span>Active Baseline:</span>
                <strong className="text-white font-mono">
                  {baselineLap.tag || `Lap ${baselineLap.lapNum || 'Best'}`} ({baselineLap.lapTimeString})
                </strong>
              </div>
            )}
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {selectedLaps.map((lap, index) => {
              const isBaseline = lap.id === baselineLap?.id;
              const deltas = baselineLap ? computeLapDeltas(baselineLap, lap) : null;
              const color = LAP_COLORS[index % LAP_COLORS.length];
              const isCardS1Best = lap.isValid && lap.s1 !== null && bestComparedS1 !== null && Math.abs(lap.s1 - bestComparedS1) < 0.0005;
              const isCardS2Best = lap.isValid && lap.s2 !== null && bestComparedS2 !== null && Math.abs(lap.s2 - bestComparedS2) < 0.0005;
              const isCardS3Best = lap.isValid && lap.s3 !== null && bestComparedS3 !== null && Math.abs(lap.s3 - bestComparedS3) < 0.0005;

              return (
                <div
                  key={lap.id}
                  className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    isBaseline
                      ? 'bg-lmu-card/90 border-lmu-gold shadow-lg shadow-lmu-gold/10'
                      : 'bg-lmu-card/50 border-lmu-border hover:border-lmu-border/80'
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
                          {lap.tag || `Lap ${lap.lapNum || '-'}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isBaseline && (
                          <button
                            onClick={() => setBaselineLapId(lap.id)}
                            className="text-[10px] text-lmu-muted hover:text-lmu-gold font-semibold transition-colors px-1.5 py-0.5 rounded hover:bg-lmu-bg"
                            title="Set as baseline for deltas"
                          >
                            Set Baseline
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleLap(lap)}
                          className="text-lmu-muted hover:text-rose-400 p-0.5 rounded transition-colors"
                          title="Remove from comparison"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Driver & Car Info */}
                    <div className="mt-3">
                      <p className="text-xs text-lmu-muted truncate" title={lap.driverName}>
                        {lap.driverName}
                      </p>
                      <p className="text-xs font-medium text-white truncate" title={lap.carType}>
                        {lap.carType}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-lmu-muted mt-0.5">
                        <span className="px-1.5 py-0.2 bg-lmu-bg rounded text-[10px] font-semibold text-lmu-cyan border border-lmu-border">
                          {lap.carClass}
                        </span>
                        {lap.sessionName && (
                          <span className="truncate">
                            {lap.sessionName} ({lap.sessionType || 'P'})
                          </span>
                        )}
                      </div>
                      <h4 className="text-2xl font-extrabold font-mono text-white mt-0.5">
                        {lap.lapTimeString}
                      </h4>
                      {(() => {
                        let cat = lap.paceCategory;
                        let pct = lap.pacePercentage;

                        if (!cat && lap.lapTime && lap.lapTime > 0) {
                          const matchingRef = apiData.benchmarks.find(b =>
                            matchesCarClass(b.carClass, '', selectedCarClass)
                          ) || apiData.benchmarks[0];

                          if (matchingRef?.target100Sec) {
                            pct = parseFloat(((lap.lapTime / matchingRef.target100Sec) * 100).toFixed(2));
                            cat = getPaceCategoryFromPercentage(pct);
                          } else {
                            const sampleLap = apiData.laps.find(l => l.isValid && l.lapTime && l.pacePercentage);
                            if (sampleLap?.lapTime && sampleLap.pacePercentage) {
                              const target100 = sampleLap.lapTime / (sampleLap.pacePercentage / 100);
                              pct = parseFloat(((lap.lapTime / target100) * 100).toFixed(2));
                              cat = getPaceCategoryFromPercentage(pct);
                            }
                          }
                        }

                        if (!cat) return null;

                        return (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${getPaceCategoryStyle(cat).badgeClass}`}>
                              <span>{getPaceCategoryStyle(cat).emoji}</span>
                              <span>{cat}</span>
                              {pct !== null && pct !== undefined && (
                                <span className="opacity-80">({formatPacePercentage(pct)})</span>
                              )}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Sector Breakdown */}
                    <div className="mt-3 space-y-2 text-xs font-mono">
                      {/* S1 */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
                        <span className="text-lmu-gold font-sans font-semibold">S1</span>
                        <div className="flex items-baseline gap-2">
                          <span className={`font-bold ${isCardS1Best ? 'text-lmu-gold' : 'text-white'}`}>
                            {lap.s1String || formatTime(lap.s1)}
                          </span>
                          {deltas && !isBaseline && (
                            <span className={`text-[11px] font-bold ${deltas.s1DeltaClass}`}>
                              {deltas.s1DeltaFormatted}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* S2 */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
                        <span className="text-lmu-blue font-sans font-semibold">S2</span>
                        <div className="flex items-baseline gap-2">
                          <span className={`font-bold ${isCardS2Best ? 'text-lmu-blue' : 'text-white'}`}>
                            {lap.s2String || formatTime(lap.s2)}
                          </span>
                          {deltas && !isBaseline && (
                            <span className={`text-[11px] font-bold ${deltas.s2DeltaClass}`}>
                              {deltas.s2DeltaFormatted}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* S3 */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
                        <span className="text-lmu-green font-sans font-semibold">S3</span>
                        <div className="flex items-baseline gap-2">
                          <span className={`font-bold ${isCardS3Best ? 'text-lmu-green' : 'text-white'}`}>
                            {lap.s3String || formatTime(lap.s3)}
                          </span>
                          {deltas && !isBaseline && (
                            <span className={`text-[11px] font-bold ${deltas.s3DeltaClass}`}>
                              {deltas.s3DeltaFormatted}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Top Speed & Tires */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
                        <span className="text-[10px] uppercase text-lmu-muted font-sans block">Top Speed</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-bold text-lmu-cyan font-mono">
                            {lap.topSpeed ? `${lap.topSpeed.toFixed(1)} km/h` : 'N/A'}
                          </span>
                        </div>
                        {deltas && !isBaseline && deltas.speedDelta !== null && (
                          <span className={`text-[10px] font-bold font-mono ${deltas.speedDeltaClass}`}>
                            {deltas.speedDeltaFormatted}
                          </span>
                        )}
                      </div>

                      <div className="p-2 rounded-lg bg-lmu-bg/40 border border-lmu-border/40">
                        <span className="text-[10px] uppercase text-lmu-muted font-sans block">Tires & Wear</span>
                        <span className="text-xs text-white font-medium block truncate mt-0.5">
                          {lap.fCompound || lap.rCompound ? `${lap.fCompound || lap.rCompound}` : 'Standard'}
                        </span>
                        {lap.tireWear ? (
                          <span className="text-[10px] text-lmu-gold font-mono font-bold block" title={`FL: ${lap.tireWear.fl}% | FR: ${lap.tireWear.fr}%\nRL: ${lap.tireWear.rl}% | RR: ${lap.tireWear.rr}%`}>
                            Wear: {lap.tireWear.avg}% avg
                          </span>
                        ) : (
                          <span className="text-[10px] text-lmu-muted">
                            {lap.isPitStop ? '🛑 Pit Stop' : lap.isValid ? '✓ Valid Lap' : '⚠️ Incomplete'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fuel & Virtual Energy if available */}
                    {(lap.fuel !== undefined && lap.fuel !== null || lap.virtualEnergy !== undefined && lap.virtualEnergy !== null) && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                        {lap.fuel !== undefined && lap.fuel !== null && (
                          <div className="p-1.5 rounded-lg bg-lmu-bg/30 border border-lmu-border/30 flex items-center justify-between text-[11px]">
                            <span className="text-lmu-muted font-sans">⛽ Fuel:</span>
                            <span className="text-amber-300 font-bold">
                              {lap.fuel}% {lap.fuelUsed ? `(-${lap.fuelUsed}%)` : ''}
                            </span>
                          </div>
                        )}
                        {lap.virtualEnergy !== undefined && lap.virtualEnergy !== null && (
                          <div className="p-1.5 rounded-lg bg-lmu-bg/30 border border-lmu-border/30 flex items-center justify-between text-[11px]">
                            <span className="text-lmu-muted font-sans">⚡ VE:</span>
                            <span className="text-indigo-300 font-bold">
                              {lap.virtualEnergy}% {lap.virtualEnergyUsed ? `(-${lap.virtualEnergyUsed}%)` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Open Session Link if available */}
                  {lap.sessionId && onSelectSession && (
                    <div className="mt-3 pt-2 border-t border-lmu-border/40 text-right">
                      <button
                        onClick={() => onSelectSession(lap.sessionId!)}
                        className="text-[11px] text-lmu-muted hover:text-lmu-gold transition-colors font-medium"
                      >
                        View Full Session →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sector Comparison Bar Chart */}
          {selectedLaps.length > 1 && baselineLap && (
            <div className="pt-4 border-t border-lmu-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-lmu-accent" />
                    Sector Telemetry Breakdown (Time Difference vs Baseline)
                  </h4>
                  <p className="text-[11px] text-lmu-muted mt-0.5">
                    Baseline Reference: <strong className="text-lmu-gold">{baselineLap.tag || `Lap ${baselineLap.lapNum || '-'}`}</strong> ({baselineLap.lapTimeString})
                  </p>
                </div>

                <div className="text-[11px] font-mono flex items-center gap-3">
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    Negative = Faster
                  </span>
                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                    Positive = Slower
                  </span>
                </div>
              </div>

              <div className="h-64 min-h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.5} />
                    <ReferenceLine y={0} stroke="#718096" strokeDasharray="3 3" />
                    <XAxis dataKey="metric" stroke="#718096" tick={{ fill: '#A0AEC0', fontSize: 11 }} />
                    <YAxis
                      stroke="#718096"
                      tick={{ fill: '#A0AEC0', fontSize: 11 }}
                      tickFormatter={(val) => val === 0 ? '0.000s' : (val > 0 ? `+${val.toFixed(2)}s` : `${val.toFixed(2)}s`)}
                    />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload || !payload.length) return null;
                        const metricItem = chartData.find(d => d.metric === label);
                        const metricKey = metricItem?.metricKey as 's1' | 's2' | 's3' | 'lapTime' | undefined;

                        return (
                          <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-1.5 font-mono">
                            <div className="flex items-center justify-between gap-4 border-b border-lmu-border/60 pb-1 mb-1 font-sans">
                              <p className="font-bold text-white">{label} Delta vs Baseline</p>
                              <span className="text-[10px] text-lmu-gold">Base: {baselineLap.tag || `Lap ${baselineLap.lapNum || '-'}`}</span>
                            </div>
                            {(() => {
                              const seen = new Set<string>();
                              const uniquePayload = payload.filter((p: any) => {
                                const key = String(p.dataKey || '');
                                if (!key || seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              });

                              return uniquePayload.map((p: any) => {
                                const lap = selectedLaps.find(l => l.id === p.dataKey);
                                const isBase = lap?.id === baselineLap.id;
                                const rawSecVal = metricKey && lap ? lap[metricKey] : null;
                                const deltaVal = p.value as number;

                                const deltaColor = isBase
                                  ? '#ECC94B'
                                  : deltaVal < 0
                                  ? '#48BB78'
                                  : deltaVal > 0
                                  ? '#F56565'
                                  : '#A0AEC0';

                                const formattedDelta = isBase
                                  ? '±0.000s (Baseline)'
                                  : deltaVal > 0
                                  ? `+${deltaVal.toFixed(3)}s`
                                  : deltaVal < 0
                                  ? `${deltaVal.toFixed(3)}s`
                                  : '0.000s';

                                return (
                                  <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                                    <span style={{ color: p.color }} className="font-semibold truncate max-w-[140px]">
                                      {lap?.tag || `Lap ${lap?.lapNum || '-'}`}:
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold font-mono" style={{ color: deltaColor }}>
                                        {formattedDelta}
                                      </span>
                                      {rawSecVal !== null && rawSecVal !== undefined && (
                                        <span className="text-lmu-muted text-[11px] font-mono">
                                          ({formatTime(rawSecVal)})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
                    {comparedLaps.map((lap) => (
                      <Bar
                        key={lap.id}
                        dataKey={lap.id}
                        name={lap.tag || `Lap ${lap.lapNum || '-'}`}
                        radius={[4, 4, 0, 0]}
                      >
                        {chartData.map((entry, entryIndex) => {
                          const val = (entry as any)[lap.id] as number;
                          const cellColor = val < 0
                            ? '#10B981' // Green for faster / time gained
                            : val > 0
                            ? '#EF4444' // Red for slower / time lost
                            : '#718096'; // Neutral for 0
                          return <Cell key={`cell-${lap.id}-${entryIndex}`} fill={cellColor} />;
                        })}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="py-12 text-center glass-panel rounded-2xl">
          <ArrowLeftRight className="w-8 h-8 text-lmu-muted mx-auto mb-2 opacity-50" />
          <h3 className="text-base font-bold text-white">No Laps Selected for Comparison</h3>
          <p className="text-xs text-lmu-muted mt-1 max-w-md mx-auto">
            Select laps from the explorer table below, or click any quick preset above (Theoretical Best, Alien Target, All-Time PB) to start comparing!
          </p>
        </div>
      )}

      {/* Available Laps Explorer Table */}
      <div className="glass-panel p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Gauge className="w-4 h-4 text-lmu-accent" />
              Available Laps on {selectedTrack} ({displayLaps.length} Laps)
            </h3>
            <p className="text-xs text-lmu-muted mt-0.5">
              Filtered by vehicle class <strong className="text-white">{selectedCarClass}</strong> to guarantee fair telemetry comparisons.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Hide Empty / Invalid Laps Filter Toggle */}
            <button
              onClick={() => setHideEmpty(!hideEmpty)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                hideEmpty
                  ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
                  : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
              }`}
              title={
                hideEmpty
                  ? "Hiding invalid, pit stop, and empty laps. Click to show all."
                  : "Showing all laps including invalid/pit stops. Click to filter out empty results."
              }
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Hide Empty Laps</span>
              {emptyCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    hideEmpty ? 'bg-lmu-accent text-white' : 'bg-lmu-border text-lmu-muted'
                  }`}
                >
                  {emptyCount}
                </span>
              )}
            </button>

            {/* Order By Selector */}
            <div className="flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-2.5 py-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-lmu-accent" />
              <label htmlFor="sort-laps-select" className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider">
                Order:
              </label>
              <select
                id="sort-laps-select"
                value={availableLapsSort}
                onChange={(e) => setAvailableLapsSort(e.target.value as AvailableLapsSortOption)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
              >
                <option value="lap-asc" className="bg-lmu-card text-white">⚡ Best Lap Time (Fastest First)</option>
                <option value="lap-desc" className="bg-lmu-card text-white">🐢 Slowest Lap Time</option>
                <option value="date-desc" className="bg-lmu-card text-white">🕒 Most Recent Session (Last)</option>
                <option value="date-asc" className="bg-lmu-card text-white">📅 Oldest Session First</option>
                <option value="speed-desc" className="bg-lmu-card text-white">🚀 Highest Top Speed</option>
                <option value="s1-asc" className="bg-lmu-card text-white">⏱️ Best Sector 1 (S1)</option>
                <option value="s2-asc" className="bg-lmu-card text-white">⏱️ Best Sector 2 (S2)</option>
                <option value="s3-asc" className="bg-lmu-card text-white">⏱️ Best Sector 3 (S3)</option>
                <option value="pace-asc" className="bg-lmu-card text-white">🏆 Benchmark Pace %</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-lmu-muted">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-lmu-accent border-t-transparent rounded-full mb-2" />
            <p className="text-xs font-medium">Scanning sessions on {selectedTrack}...</p>
          </div>
        ) : displayLaps.length === 0 ? (
          <div className="py-8 text-center text-lmu-muted text-xs">
            <p>No completed laps found for {selectedTrack} in {selectedCarClass}.</p>
            {hideEmpty && emptyCount > 0 && (
              <p className="mt-2 text-lmu-muted">
                Note: {emptyCount} invalid / pit / empty lap{emptyCount > 1 ? 's are' : ' is'} hidden.{' '}
                <button
                  onClick={() => setHideEmpty(false)}
                  className="text-lmu-accent underline hover:text-white font-semibold"
                >
                  Click here to show empty laps
                </button>.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs text-lmu-muted">
              <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border select-none">
                <tr>
                  <th className="px-3 py-3">Action</th>
                  
                  <th
                    onClick={() => setAvailableLapsSort(prev => prev === 'date-desc' ? 'date-asc' : 'date-desc')}
                    className="px-3 py-3 cursor-pointer hover:text-lmu-accent transition-colors"
                    title="Sort by Session Date (Recent / Oldest)"
                  >
                    <div className="flex items-center gap-1">
                      Session & Date
                      {availableLapsSort === 'date-desc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                      {availableLapsSort === 'date-asc' && <ChevronUp className="w-3 h-3 text-lmu-accent" />}
                    </div>
                  </th>

                  <th className="px-3 py-3">Driver & Car</th>
                  <th className="px-3 py-3 text-center">Lap</th>

                  <th
                    onClick={() => setAvailableLapsSort(prev => prev === 'lap-asc' ? 'lap-desc' : 'lap-asc')}
                    className="px-3 py-3 text-right cursor-pointer hover:text-lmu-accent transition-colors"
                    title="Sort by Lap Time (Best / Slowest)"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Lap Time
                      {availableLapsSort === 'lap-asc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                      {availableLapsSort === 'lap-desc' && <ChevronUp className="w-3 h-3 text-lmu-accent" />}
                    </div>
                  </th>

                  <th
                    onClick={() => setAvailableLapsSort('pace-asc')}
                    className="px-3 py-3 text-center cursor-pointer hover:text-lmu-accent transition-colors"
                    title="Sort by Benchmark Pace Percentage"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Pace
                      {availableLapsSort === 'pace-asc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                    </div>
                  </th>

                  <th
                    onClick={() => setAvailableLapsSort('s1-asc')}
                    className="px-3 py-3 text-right cursor-pointer hover:text-lmu-gold transition-colors"
                    title="Sort by Sector 1 (S1)"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-lmu-gold/90">S1</span>
                      {availableLapsSort === 's1-asc' && <ChevronDown className="w-3 h-3 text-lmu-gold" />}
                    </div>
                  </th>

                  <th
                    onClick={() => setAvailableLapsSort('s2-asc')}
                    className="px-3 py-3 text-right cursor-pointer hover:text-lmu-blue transition-colors"
                    title="Sort by Sector 2 (S2)"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-lmu-blue/90">S2</span>
                      {availableLapsSort === 's2-asc' && <ChevronDown className="w-3 h-3 text-lmu-blue" />}
                    </div>
                  </th>

                  <th
                    onClick={() => setAvailableLapsSort('s3-asc')}
                    className="px-3 py-3 text-right cursor-pointer hover:text-lmu-green transition-colors"
                    title="Sort by Sector 3 (S3)"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-lmu-green/90">S3</span>
                      {availableLapsSort === 's3-asc' && <ChevronDown className="w-3 h-3 text-lmu-green" />}
                    </div>
                  </th>

                  <th
                    onClick={() => setAvailableLapsSort(prev => prev === 'speed-desc' ? 'speed-asc' : 'speed-desc')}
                    className="px-3 py-3 text-right cursor-pointer hover:text-lmu-accent transition-colors"
                    title="Sort by Top Speed"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Top Speed
                      {availableLapsSort === 'speed-desc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                      {availableLapsSort === 'speed-asc' && <ChevronUp className="w-3 h-3 text-lmu-accent" />}
                    </div>
                  </th>

                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lmu-border/50 font-mono">
                {displayLaps.map(lap => {
                  const isSelected = selectedLaps.some(l => l.id === lap.id);
                  const isBaseline = baselineLap?.id === lap.id;
                  const isAllTimePB = apiData.allTimeBestLap?.id === lap.id;

                  const isS1Best = lap.isValid && lap.s1 !== null && bestAvailableS1 !== null && Math.abs(lap.s1 - bestAvailableS1) < 0.0005;
                  const isS2Best = lap.isValid && lap.s2 !== null && bestAvailableS2 !== null && Math.abs(lap.s2 - bestAvailableS2) < 0.0005;
                  const isS3Best = lap.isValid && lap.s3 !== null && bestAvailableS3 !== null && Math.abs(lap.s3 - bestAvailableS3) < 0.0005;

                  return (
                    <tr
                      key={lap.id}
                      className={`hover:bg-lmu-card/50 transition-colors ${
                        isBaseline ? 'bg-lmu-gold/15' : isSelected ? 'bg-lmu-blue/15' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 font-sans">
                        <button
                          onClick={() => handleToggleLap(lap)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-lmu-accent text-white shadow-sm'
                              : 'bg-lmu-bg hover:bg-lmu-border text-white border border-lmu-border'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              Compare
                            </>
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-2.5 font-sans">
                        <span className="font-bold text-white block">
                          {lap.sessionName || 'Session'} ({lap.sessionType || 'P'})
                        </span>
                        <span className="text-[11px] text-lmu-muted">{lap.dateString}</span>
                      </td>

                      <td className="px-3 py-2.5 font-sans">
                        <span className="font-semibold text-white block truncate max-w-[160px]">
                          {lap.driverName}
                        </span>
                        <span className="text-[11px] text-lmu-muted truncate block max-w-[160px]">
                          {lap.carType}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-center font-bold text-white">
                        {lap.lapNum}
                      </td>

                      <td className={`px-3 py-2.5 text-right font-bold ${
                        isAllTimePB ? 'text-lmu-gold font-extrabold' : lap.isSessionBest ? 'text-lmu-blue' : lap.isInferred ? 'text-amber-300/80 italic font-mono' : 'text-white'
                      }`}>
                        {lap.isInferred ? `~${lap.lapTimeString}` : lap.lapTimeString}
                      </td>

                      <td className="px-3 py-2.5 text-center font-sans">
                        {lap.paceCategory ? (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${getPaceCategoryStyle(lap.paceCategory).badgeClass}`}>
                            <span>{getPaceCategoryStyle(lap.paceCategory).emoji}</span>
                            <span>{lap.paceCategory}</span>
                          </span>
                        ) : '-'}
                      </td>

                      <td className={`px-3 py-2.5 text-right font-mono ${isS1Best ? 'text-lmu-gold font-bold' : ''}`} title={isS1Best ? 'Best Sector 1' : undefined}>
                        {lap.s1String || formatTime(lap.s1)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${isS2Best ? 'text-lmu-blue font-bold' : ''}`} title={isS2Best ? 'Best Sector 2' : undefined}>
                        {lap.s2String || formatTime(lap.s2)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${isS3Best ? 'text-lmu-green font-bold' : ''}`} title={isS3Best ? 'Best Sector 3' : undefined}>
                        {lap.s3String || formatTime(lap.s3)}
                      </td>

                      <td className="px-3 py-2.5 text-right text-white">
                        {lap.topSpeed ? `${lap.topSpeed.toFixed(1)}` : '-'}
                      </td>

                      <td className="px-3 py-2.5 text-center font-sans">
                        {lap.isPitStop ? (
                          <span className="text-[10px] text-amber-400 font-bold">PIT</span>
                        ) : lap.isOutLap ? (
                          <span className="text-[10px] text-cyan-400 font-semibold" title="Out Lap (rejoining track from pit lane)">OUT LAP</span>
                        ) : lap.isValid ? (
                          <span className="text-[10px] text-lmu-green font-semibold">Valid</span>
                        ) : lap.isInferred ? (
                          <span className="text-[10px] text-amber-400 font-semibold">Inferred</span>
                        ) : (
                          <span className="text-[10px] text-rose-400 font-semibold">Invalid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
