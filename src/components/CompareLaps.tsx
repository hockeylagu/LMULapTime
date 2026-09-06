import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { CompareLapsHeader } from './compare-laps/CompareLapsHeader';
import { CompareLapsFilters } from './compare-laps/CompareLapsFilters';
import { CompareLapsDeck } from './compare-laps/CompareLapsDeck';
import { CompareSectorChart } from './compare-laps/CompareSectorChart';
import { CompareLapsTable } from './compare-laps/CompareLapsTable';
import { ReplayInspectorModal } from './replay/ReplayInspectorModal';
import { useCompareLapsData, AvailableLapsSortOption, CompareLapsSessionItem } from './compare-laps/useCompareLapsData';
import { ReplaySummary } from '../../server/types.js';

export type { AvailableLapsSortOption, CompareLapsSessionItem };

interface CompareLapsProps {
  sessions: CompareLapsSessionItem[];
  initialTrack?: string;
  initialCarClass?: string;
  initialSessionId?: string;
  initialLapNum?: number;
  onSelectSession?: (sessionId: string) => void;
}

const LAP_COLORS = ['#ECC94B', '#3182CE', '#38A169', '#E53E3E', '#9F7AEA'];

export const CompareLaps: React.FC<CompareLapsProps> = ({
  sessions = [],
  initialTrack,
  initialCarClass,
  initialSessionId,
  initialLapNum,
  onSelectSession,
}) => {
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
  });

  const [telemetryModalOpen, setTelemetryModalOpen] = useState(false);
  const [telemetryTargetReplay, setTelemetryTargetReplay] = useState<string>('');
  const [telemetryTargetLap, setTelemetryTargetLap] = useState<number>(1);
  const [telemetryBaselineReplay, setTelemetryBaselineReplay] = useState<string | null>(null);
  const [telemetryBaselineLap, setTelemetryBaselineLap] = useState<number | null>(null);
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
            (r: ReplaySummary) => r.trackName && selectedTrack && r.trackName.toLowerCase().includes(selectedTrack.toLowerCase())
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

    setTelemetryTargetReplay(targetReplay);
    setTelemetryTargetLap(targetLap.lapNum ?? 1);
    setTelemetryBaselineReplay(baseReplay);
    setTelemetryBaselineLap(baseLap.lapNum ?? 1);
    setTelemetryModalOpen(true);
  };

  const onCompareTelemetry = selectedLaps.length === 2 ? handleCompareTelemetry : undefined;

  const handleCloseTelemetry = () => {
    setTelemetryModalOpen(false);
    setTelemetryTargetReplay('');
    setTelemetryTargetLap(1);
    setTelemetryBaselineReplay(null);
    setTelemetryBaselineLap(null);
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-2xl space-y-4">
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
        <div className="glass-panel p-4 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-300 text-xs flex items-center justify-between gap-3 animate-fadeIn">
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
        lapColors={LAP_COLORS}
      />

      {selectedLaps.length > 1 && baselineLap && (
        <div className="glass-panel p-6 rounded-2xl">
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

      {telemetryModalOpen && telemetryTargetReplay && (
        <ReplayInspectorModal
          isOpen={telemetryModalOpen}
          onClose={handleCloseTelemetry}
          replayName={telemetryTargetReplay}
          initialLapNumber={telemetryTargetLap}
          initialCompareMode={true}
          initialBaselineReplayName={telemetryBaselineReplay}
          initialBaselineLapNumber={telemetryBaselineLap}
        />
      )}
    </div>
  );
};
