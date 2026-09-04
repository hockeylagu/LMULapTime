import React from 'react';
import { CompareLapsHeader } from './compare-laps/CompareLapsHeader';
import { CompareLapsFilters } from './compare-laps/CompareLapsFilters';
import { CompareLapsDeck } from './compare-laps/CompareLapsDeck';
import { CompareSectorChart } from './compare-laps/CompareSectorChart';
import { CompareLapsTable } from './compare-laps/CompareLapsTable';
import { useCompareLapsData, AvailableLapsSortOption, CompareLapsSessionItem } from './compare-laps/useCompareLapsData';

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
          />
        </div>
      )}

      <CompareLapsTable
        selectedTrack={selectedTrack}
        selectedCarClass={selectedCarClass}
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
