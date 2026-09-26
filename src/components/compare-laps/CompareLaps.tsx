import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, X } from 'lucide-react';
import { CompareLapsHeader } from './CompareLapsHeader.js';
import { CompareLapsFilters } from './CompareLapsFilters.js';
import { CompareLapsDeck } from './CompareLapsDeck.js';
import { CompareSectorChart } from './CompareSectorChart.js';
import { CompareLapsTable } from './CompareLapsTable.js';
import { useCompareLapsData, AvailableLapsSortOption, CompareLapsSessionItem } from './useCompareLapsData.js';
import { ReplaySummary } from '../../../shared/types/index.js';
import { matchesTrack } from '../../../shared/domain/paceCategory.js';
import { COMPARE_LAP_COLORS } from '../../utils/themeColors.js';

export type { AvailableLapsSortOption, CompareLapsSessionItem };

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
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    availableTracks,
    selectedTrack,
    setSelectedTrack,
    selectedCarClass,
    setSelectedCarClass,
    availableCarModels,
    selectedCarModel,
    setSelectedCarModel,
    playerOnly,
    setPlayerOnlyState,
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
  } = useCompareLapsData({
    sessions,
    initialTrack,
    initialCarClass,
    initialSessionId,
    initialLapNum,
    initialCompareSessionId,
    initialCompareDriver,
    initialCompareLapNum,
  });

  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  const handleCompareTelemetry = async () => {
    if (selectedLaps.length !== 2) return;
    setTelemetryError(null);

    const lap1 = selectedLaps[0];
    const lap2 = selectedLaps[1];
    const baseLap = baselineLap?.id === lap2.id ? lap2 : lap1;
    const targetLap = baseLap.id === lap1.id ? lap2 : lap1;

    const findReplayForLap = async (lap: typeof lap1): Promise<string | null> => {
      if (lap.matchingReplayFile) {
        return lap.matchingReplayFile;
      }
      const sess = sessions.find((s) => s.id === lap.sessionId);
      if (sess?.matchingReplayFile?.name) {
        return sess.matchingReplayFile.name;
      }
      try {
        const res = await fetch('/api/replays');
        if (res.ok) {
          const replays: ReplaySummary[] = await res.json();
          const match = replays.find((r: ReplaySummary) => r.matchedSessionId === lap.sessionId);
          if (match?.name) return match.name;
          const trackMatch = replays.find(
            (r: ReplaySummary) => r.trackName && selectedTrack && matchesTrack(r.trackName, selectedTrack, '')
          );
          if (trackMatch?.name) return trackMatch.name;
        }
      } catch (err) {
        console.error('Failed to locate replay for lap:', err);
      }
      return null;
    };

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

    const telemetryParams = new URLSearchParams(searchParams);
    telemetryParams.set('replayName', targetReplay);
    telemetryParams.set('lap', String(targetLap.lapNum ?? 1));
    if (targetLap.driverName) telemetryParams.set('driverName', targetLap.driverName);
    telemetryParams.set('baselineReplay', baseReplay);
    if (baseLap.sessionId) telemetryParams.set('compareSessionId', String(baseLap.sessionId));
    if (baseLap.driverName) telemetryParams.set('compareDriver', baseLap.driverName);
    if (baseLap.lapNum !== undefined) telemetryParams.set('compareLapNum', String(baseLap.lapNum));
    navigate(`/telemetry?${telemetryParams.toString()}`);
  };

  const onCompareTelemetry = selectedLaps.length === 2 ? handleCompareTelemetry : undefined;

  return (
    <div className="space-y-6">
      <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-6 rounded-2xl space-y-4">
        <CompareLapsHeader
          selectedTrack={selectedTrack}
          allTimePBObject={allTimePBObject}
          overallTrackBestObject={overallTrackBestObject}
          isPBInComparison={isPBInComparison}
          isOverallBestInComparison={isOverallBestInComparison}
          theoreticalBestSec={apiData.theoreticalBestSec}
          selectedLapsCount={selectedLaps.length}
          onAddPersonalBest={handleAddPersonalBest}
          onAddTheoreticalBest={handleAddTheoreticalBest}
          onAddOverallTrackBest={handleAddOverallTrackBest}
          onClearAll={handleClearAll}
        />
        <CompareLapsFilters
          availableTracks={availableTracks}
          selectedTrack={selectedTrack}
          setSelectedTrack={setSelectedTrack}
          selectedCarClass={selectedCarClass}
          setSelectedCarClass={setSelectedCarClass}
          availableCarModels={availableCarModels}
          selectedCarModel={selectedCarModel}
          setSelectedCarModel={setSelectedCarModel}
          playerOnly={playerOnly}
          setPlayerOnly={setPlayerOnlyState}
        />
      </div>

      {telemetryError && (
        <div className="backdrop-blur-md p-4 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-300 text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{telemetryError}</span>
          </div>
          <button
            type="button"
            onClick={() => setTelemetryError(null)}
            className="p-1 hover:bg-rose-900/60 rounded text-rose-400 hover:text-white cursor-pointer"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <CompareLapsDeck
        selectedLaps={selectedLaps}
        baselineLap={baselineLap}
        baselineLapId={baselineLapId}
        setBaselineLapId={setBaselineLapId}
        onToggleLap={handleToggleLap}
        onSelectSession={onSelectSession}
        bestComparedS1={bestComparedS1}
        bestComparedS2={bestComparedS2}
        bestComparedS3={bestComparedS3}
        benchmarks={apiData.benchmarks}
        allLaps={apiData.laps}
        selectedCarClass={selectedCarClass}
        lapColors={COMPARE_LAP_COLORS}
      />

      {selectedLaps.length > 1 && baselineLap && (
        <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-6 rounded-2xl">
          <CompareSectorChart
            selectedLaps={selectedLaps}
            comparedLaps={comparedLaps}
            baselineLap={baselineLap}
            chartData={chartData}
            onCompareTelemetry={onCompareTelemetry}
          />
        </div>
      )}

      <CompareLapsTable
        selectedTrack={selectedTrack}
        selectedCarClass={selectedCarClass}
        playerOnly={playerOnly}
        displayLaps={displayLaps}
        emptyCount={emptyCount}
        hideEmpty={hideEmpty}
        setHideEmpty={setHideEmpty}
        availableLapsSort={availableLapsSort}
        setAvailableLapsSort={setAvailableLapsSort}
        loading={loading}
        selectedLaps={selectedLaps}
        baselineLap={baselineLap}
        allTimeBestLapId={apiData.allTimeBestLap?.id}
        bestAvailableS1={bestAvailableS1}
        bestAvailableS2={bestAvailableS2}
        bestAvailableS3={bestAvailableS3}
        onToggleLap={handleToggleLap}
      />

    </div>
  );
};
