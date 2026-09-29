import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, X } from 'lucide-react';
import { CompareLapsHeader } from './CompareLapsHeader.js';
import { CompareLapsDeck } from './CompareLapsDeck.js';
import { CompareSectorChart } from './CompareSectorChart.js';
import { useCompareLapsData, CompareRequest, CompareLapsSessionItem } from './useCompareLapsData.js';
import { ComparableLap, ReplaySummary } from '../../../shared/types/index.js';
import { fetchJson } from '../../api/apiClient.js';
import { COMPARE_LAP_COLORS } from '../../utils/themeColors.js';
import { buildTelemetryComparePath } from '../../utils/telemetryCompareLink.js';
import { LapDebriefPanel } from './debrief/LapDebriefPanel.js';
import { loadLapPairDebrief, LapDebriefUnavailableError } from './debrief/loadLapDebrief.js';
import { SectorGapSummary } from './debrief/SectorGapSummary.js';

export type { CompareLapsSessionItem };

export interface CompareLapsProps {
  sessions: CompareLapsSessionItem[];
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

  const findReplayForLap = async (lap: ComparableLap): Promise<string | null> => {
    if (lap.matchingReplayFile) {
      return lap.matchingReplayFile;
    }
    const sess = sessions.find((s) => s.id === lap.sessionId);
    if (sess?.matchingReplayFile?.name) {
      return sess.matchingReplayFile.name;
    }
    // Only the replay linked to the lap's own session records it: another replay of the track is
    // another session (or layout), and would show someone else's lap.
    try {
      const replays = await fetchJson<ReplaySummary[]>('/api/replays');
      const match = replays.find((r) => r.matchedSessionId === lap.sessionId);
      if (match?.name) return match.name;
    } catch (err) {
      console.error('Failed to locate replay for lap:', err);
    }
    return null;
  };

  const handleCompareTelemetry = async () => {
    if (selectedLaps.length !== 2) return;
    setTelemetryError(null);
    const { target: targetLap, base: baseLap } = telemetryPair(selectedLaps, baselineLap);

    const [targetReplay, baseReplay] = await Promise.all([
      findReplayForLap(targetLap),
      findReplayForLap(baseLap),
    ]);

    if (!targetReplay || !baseReplay) {
      const missing: string[] = [];
      if (!baseReplay) missing.push(`Baseline (${baseLap.driverName} Lap ${baseLap.lapNum || '-'})`);
      if (!targetReplay) missing.push(`Target (${targetLap.driverName} Lap ${targetLap.lapNum || '-'})`);
      setTelemetryError(
        `Unable to locate replay recording (.vcr) for: ${missing.join(', ')}. Telemetry comparison requires recorded replay telemetry.`
      );
      return;
    }

    navigate(buildTelemetryComparePath(
      searchParams,
      { replayName: targetReplay, driverName: targetLap.driverName, lapNum: targetLap.lapNum },
      { replayName: baseReplay, sessionId: baseLap.sessionId, driverName: baseLap.driverName, lapNum: baseLap.lapNum },
    ));
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
    const [targetReplay, baseReplay] = await Promise.all([findReplayForLap(target), findReplayForLap(base)]);
    if (!targetReplay || !baseReplay) {
      const lap = !targetReplay ? target : base;
      throw new LapDebriefUnavailableError(`${lap.driverName}'s lap ${lap.lapNum ?? '-'} has no replay to compare with.`);
    }
    return loadLapPairDebrief(
      { replayName: targetReplay, driverName: target.driverName, lapNum: target.lapNum },
      { replayName: baseReplay, sessionId: base.sessionId, driverName: base.driverName, lapNum: base.lapNum },
      signal,
    );
  };

  return (
    <section aria-label="Compare laps" className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-6 rounded-2xl space-y-4">
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
        onCompareTelemetry={selectedLaps.length === 2 ? handleCompareTelemetry : undefined}
        onAddPersonalBest={data.handleAddPersonalBest}
        onAddTheoreticalBest={data.handleAddTheoreticalBest}
        onAddOverallTrackBest={data.handleAddOverallTrackBest}
        onClearAll={data.handleClearAll}
      />

      {telemetryError && (
        <div className="p-3 rounded-xl border border-lmu-loss-strong/40 bg-lmu-loss-deep/40 text-lmu-loss-soft text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-lmu-loss shrink-0" />
            <span>{telemetryError}</span>
          </div>
          <button
            type="button"
            onClick={() => setTelemetryError(null)}
            className="p-1 hover:bg-lmu-loss-deep/60 rounded text-lmu-loss hover:text-white cursor-pointer"
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
        onSelectSession={onSelectSession}
        benchmarks={data.apiData.benchmarks}
        allLaps={data.apiData.laps}
        selectedCarClass={data.selectedCarClass}
        lapColors={COMPARE_LAP_COLORS}
      />

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
