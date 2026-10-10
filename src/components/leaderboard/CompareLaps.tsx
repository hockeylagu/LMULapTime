import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, X } from 'lucide-react';
import { CompareLapsHeader } from './CompareLapsHeader.js';
import { CompareLapsDeck } from './CompareLapsDeck.js';
import { CompareSectorChart } from './CompareSectorChart.js';
import { useCompareLapsData, CompareRequest, CompareLapsSessionItem } from './useCompareLapsData.js';
import { ComparableLap } from '../../../shared/types/index.js';
import { COMPARE_LAP_COLORS } from '../../utils/themeColors.js';
import { buildTelemetryComparePath } from '../../utils/telemetryCompareLink.js';
import { LapDebriefPanel } from './debrief/LapDebriefPanel.js';
import { loadLapPairDebrief, LapDebriefUnavailableError } from './debrief/loadLapDebrief.js';
import { SectorGapSummary } from './debrief/SectorGapSummary.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { CompareLapPicker } from './picker/CompareLapPicker.js';
import type { TelemetryLapRef } from '../../utils/telemetryCompareLink.js';

export type { CompareLapsSessionItem };

export interface CompareLapsProps {
  sessions?: CompareLapsSessionItem[];
  initialTrack?: string;
  initialCarClass?: string;
  initialSessionId?: string;
  initialLapNum?: number;
  initialCompareSessionId?: string;
  initialCompareDriver?: string;
  initialCompareLapNum?: number;
  onSelectSession?: (sessionId: string) => void;
  /** Laps the page asks to compare now (from the leaderboard). */
  compareRequest?: CompareRequest | null;
  /** The ids of the laps compared, each time they change. */
  onComparedLapsChange?: (lapIds: string[]) => void;
  /** The player's rival's lap, offered as a preset. */
  rivalLap?: ComparableLap | null;
}

/**
 * The lap the telemetry opens and the one it overlays: the player's lap against the other
 * driver's when one of the two is the player's, otherwise the lap against the baseline.
 */
export function telemetryPair(laps: ComparableLap[], baseline: ComparableLap | null): { target: ComparableLap; base: ComparableLap } {
  const players = laps.filter((l) => l.isPlayer);
  if (players.length === 1) return { target: players[0], base: laps.find((l) => !l.isPlayer)! };
  const base = baseline && laps.some((l) => l.id === baseline.id) ? baseline : laps[0];
  return { target: laps.find((l) => l.id !== base.id)!, base };
}

export const CompareLaps: React.FC<CompareLapsProps> = ({
  sessions = [],
  initialTrack,
  initialCarClass,
  initialSessionId,
  initialLapNum,
  initialCompareSessionId,
  initialCompareDriver,
  initialCompareLapNum,
  onSelectSession,
  compareRequest,
  onComparedLapsChange,
  rivalLap,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const data = useCompareLapsData({
    sessions,
    initialTrack,
    initialCarClass,
    initialSessionId,
    initialLapNum,
    initialCompareSessionId,
    initialCompareDriver,
    initialCompareLapNum,
    compareRequest,
  });
  const { selectedLaps, baselineLap, setBaselineLapId } = data;

  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [analyseRun, setAnalyseRun] = useState<{ key: number | null; fired: boolean; spent: boolean }>({ key: null, fired: false, spent: false });

  const comparedKey = selectedLaps.map((l) => l.id).join('|');
  useEffect(() => {
    onComparedLapsChange?.(comparedKey ? comparedKey.split('|') : []);
  }, [comparedKey, onComparedLapsChange]);

  const telemetryRef = (lap: ComparableLap): TelemetryLapRef | null => {
    if (!lap.sessionId || !Number.isInteger(lap.driverOrdinal) || !Number.isInteger(lap.lapOrdinal)) return null;
    return { sessionId: lap.sessionId, driverOrdinal: lap.driverOrdinal!, lapOrdinal: lap.lapOrdinal!, driverName: lap.driverName, lapNum: lap.lapNum };
  };

  const handleCompareTelemetry = async () => {
    if (selectedLaps.length !== 2) return;
    setTelemetryError(null);
    const { target: targetLap, base: baseLap } = telemetryPair(selectedLaps, baselineLap);

    const targetRef = telemetryRef(targetLap);
    const baseRef = telemetryRef(baseLap);

    if (!targetRef || !baseRef) {
      const missing: string[] = [];
      if (!baseRef) missing.push(`Baseline (${baseLap.driverName} Lap ${baseLap.lapNum || '-'})`);
      if (!targetRef) missing.push(`Target (${targetLap.driverName} Lap ${targetLap.lapNum || '-'})`);
      setTelemetryError(
        `Session lap locators are unavailable for: ${missing.join(', ')}. Refresh the comparison data and try again.`
      );
      return;
    }

    navigate(buildTelemetryComparePath(searchParams, targetRef, baseRef));
  };

  const swapBaseline = () => {
    const other = selectedLaps.find((l) => l.id !== baselineLap?.id);
    if (other) setBaselineLapId(other.id);
  };

  const debriefPair = selectedLaps.length === 2 ? telemetryPair(selectedLaps, baselineLap) : null;
  const rivalPreset = rivalLap && !selectedLaps.some((l) => l.id === rivalLap.id) ? rivalLap : null;
  const pairTheoreticalBest = debriefPair?.target.isPlayer ? data.apiData.theoreticalBestSec : null;
  const pairIds = debriefPair ? [debriefPair.target.id, debriefPair.base.id].sort().join('|') : null;
  const analysePair = compareRequest?.analyse && compareRequest.reference
    ? [compareRequest.lap.id, compareRequest.reference.id].sort().join('|')
    : null;
  const analyseMatches = analysePair !== null && pairIds === analysePair;
  // A request analyses its pair once: leaving the pair spends it, so coming back waits for the click.
  const requestKey = compareRequest?.key ?? null;
  if (analyseRun.key !== requestKey) {
    setAnalyseRun({ key: requestKey, fired: analyseMatches, spent: false });
  } else if (!analyseRun.spent && analyseRun.fired !== analyseMatches) {
    setAnalyseRun(analyseMatches ? { ...analyseRun, fired: true } : { ...analyseRun, spent: true });
  }
  const analyseRequested = analyseMatches && !analyseRun.spent;
  const loadDebrief = async (signal: AbortSignal) => {
    const { target, base } = debriefPair!;
    const targetRef = telemetryRef(target);
    const baseRef = telemetryRef(base);
    if (!targetRef || !baseRef) {
      const lap = !targetRef ? target : base;
      throw new LapDebriefUnavailableError(`${lap.driverName}'s lap ${lap.lapNum ?? '-'} has no session telemetry locator.`);
    }
    return loadLapPairDebrief(targetRef, baseRef, signal);
  };

  const compareTelemetryUrl = React.useMemo(() => {
    if (selectedLaps.length !== 2) return undefined;
    const { target: targetLap, base: baseLap } = telemetryPair(selectedLaps, baselineLap);
    const targetRef = telemetryRef(targetLap);
    const baseRef = telemetryRef(baseLap);
    return targetRef && baseRef ? buildTelemetryComparePath(searchParams, targetRef, baseRef) : undefined;
  }, [selectedLaps, baselineLap, sessions, searchParams]);

  return (
    <section aria-label="Compare laps" className="bg-lmu-card border border-lmu-border p-6 rounded-2xl space-y-4">
      <CompareLapsHeader
        selectedTrack={data.selectedTrack}
        allTimePBObject={data.allTimePBObject}
        overallTrackBestObject={data.overallTrackBestObject}
        isPBInComparison={data.isPBInComparison}
        isOverallBestInComparison={data.isOverallBestInComparison}
        theoreticalBestSec={data.apiData.theoreticalBestSec}
        selectedLapsCount={selectedLaps.length}
        rivalLap={rivalPreset}
        onAddRival={rivalPreset ? () => data.handleToggleLap(rivalPreset) : undefined}
        onSwapBaseline={selectedLaps.length === 2 ? swapBaseline : undefined}
        compareTelemetryUrl={compareTelemetryUrl}
        onCompareTelemetry={selectedLaps.length === 2 ? handleCompareTelemetry : undefined}
        onAddPersonalBest={data.handleAddPersonalBest}
        onAddTheoreticalBest={data.handleAddTheoreticalBest}
        onAddOverallTrackBest={data.handleAddOverallTrackBest}
        onClearAll={data.handleClearAll}
      />

      {telemetryError && (
        <div className="p-3 rounded-xl border border-lmu-loss-strong/40 bg-lmu-loss-deep/40 text-lmu-loss-soft text-xs flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-lmu-loss shrink-0" />
            <span>{telemetryError}</span>
          </div>
          <button
            type="button"
            onClick={() => setTelemetryError(null)}
            className={`p-1 hover:bg-lmu-loss-deep/60 rounded text-lmu-loss hover:text-white cursor-pointer ${FOCUS_RING}`}
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {data.loadError && (
        <p role="alert" className="px-4 py-3 rounded-xl border border-lmu-loss-strong/30 bg-lmu-loss-strong/10 text-sm text-lmu-loss-soft">
          Could not load laps for {data.selectedTrack}: {data.loadError}
        </p>
      )}

      <CompareLapsDeck
        laps={data.deckLaps}
        baselineLap={baselineLap}
        rivalLapId={rivalLap?.id ?? null}
        setBaselineLapId={setBaselineLapId}
        onToggleLap={data.handleToggleLap}
        onChooseLap={(lap) => data.setPickerTarget({ replaceId: lap?.id ?? null })}
        onSelectSession={onSelectSession}
        benchmarks={data.apiData.benchmarks}
        allLaps={data.apiData.laps}
        selectedCarClass={data.selectedCarClass}
        lapColors={COMPARE_LAP_COLORS}
      />

      {data.pickerTarget && (
        <CompareLapPicker
          laps={data.pickerLaps}
          anchor={data.pickerAnchor}
          replacing={data.pickerReplacing}
          comparedIds={selectedLaps.map((l) => l.id)}
          personalBestId={data.allTimePBObject?.id ?? null}
          onPick={data.handlePickLap}
          onClose={() => data.setPickerTarget(null)}
        />
      )}

      {data.pageCount > 1 && (
        <nav aria-label="Compare lap pages" className="flex items-center justify-center gap-3 text-xs text-lmu-muted">
          <button type="button" disabled={data.page <= 1} onClick={() => data.changePage(data.page - 1)} className="px-3 py-1.5 rounded-lg border border-lmu-border disabled:opacity-40">Previous</button>
          <span>Page {data.page} of {data.pageCount}</span>
          <button type="button" disabled={data.page >= data.pageCount} onClick={() => data.changePage(data.page + 1)} className="px-3 py-1.5 rounded-lg border border-lmu-border disabled:opacity-40">Next</button>
        </nav>
      )}

      {debriefPair && (
        <div className="space-y-3">
          {debriefPair.target.lapTime && debriefPair.base.lapTime && (
            <SectorGapSummary
              gap={debriefPair.target.lapTime - debriefPair.base.lapTime}
              theoreticalBest={pairTheoreticalBest}
              theoreticalGap={pairTheoreticalBest !== null ? Number((pairTheoreticalBest - debriefPair.base.lapTime).toFixed(3)) : null}
              yours={debriefPair.target}
              theirs={debriefPair.base}
            />
          )}
          <LapDebriefPanel
            pairKey={`${debriefPair.target.id}|${debriefPair.base.id}`}
            againstLabel={
              debriefPair.base.driverName !== debriefPair.target.driverName
                ? debriefPair.base.driverName
                : debriefPair.base.tag || `Lap ${debriefPair.base.lapNum ?? '-'}`
            }
            load={loadDebrief}
            autoStart={analyseRequested}
          />
        </div>
      )}

      {selectedLaps.length > 1 && baselineLap && (
        <CompareSectorChart
          selectedLaps={selectedLaps}
          comparedLaps={data.comparedLaps}
          baselineLap={baselineLap}
          chartData={data.chartData}
        />
      )}
    </section>
  );
};
