import React from 'react';
import { useSessionDetailData } from './session-detail/useSessionDetailData.js';
import { SessionDetailHeader } from './session-detail/SessionDetailHeader.js';
import { DriverPerformancePanel } from './session-detail/DriverPerformancePanel.js';
import { SessionTelemetryChart } from './session-detail/SessionTelemetryChart.js';
import { SessionLapTable } from './session-detail/SessionLapTable.js';
import { SessionStewardsLog } from './session-detail/SessionStewardsLog.js';
import { SessionRaceStandings } from './session-detail/SessionRaceStandings.js';

export interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
  onSelectSession?: (sessionId: string) => void;
  progression?: any[];
  sessions?: any[];
}

export const SessionDetail: React.FC<SessionDetailProps> = ({
  sessionId,
  onBack,
  onSelectSession,
  progression,
  sessions,
}) => {
  const {
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
  } = useSessionDetailData({
    sessionId,
    onSelectSession,
    initialProgression: progression,
    initialSessions: sessions,
  });

  if (loading) {
    return (
      <div className="py-20 text-center text-lmu-muted glass-panel rounded-2xl">
        <div className="inline-block animate-spin w-8 h-8 border-4 border-lmu-accent border-t-transparent rounded-full mb-3" />
        <p className="text-sm font-medium">Loading session telemetry and lap data...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="py-12 text-center text-lmu-muted glass-panel rounded-2xl">
        <p className="text-lg font-bold text-white mb-3">Session Not Found</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-lmu-accent text-white rounded-xl font-medium text-xs uppercase"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SessionDetailHeader
        session={session}
        selectedDriver={selectedDriver}
        selectedDriverName={selectedDriverName}
        setSelectedDriverName={setSelectedDriverName}
        onBack={onBack}
        copiedReplay={copiedReplay}
        handleCopyReplayPath={handleCopyReplayPath}
        relatedSession={relatedSession}
        handleNavigateToSession={handleNavigateToSession}
        handleExportCsv={handleExportCsv}
        refEntry={refEntry}
      />

      <DriverPerformancePanel
        session={session}
        selectedDriver={selectedDriver}
        isMultiClass={isMultiClass}
        isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
        allTimeCategoryTrackPB={allTimeCategoryTrackPB}
      />

      {selectedDriver && selectedDriver.laps && selectedDriver.laps.length > 0 && (
        <SessionTelemetryChart
          session={session}
          selectedDriver={selectedDriver}
          chartMetric={chartMetric}
          setChartMetric={setChartMetric}
          activeChartMetric={activeChartMetric}
          hasTireWearData={hasTireWearData}
          hasFuelData={hasFuelData}
          hasVirtualEnergyData={hasVirtualEnergyData}
          isMultiClass={isMultiClass}
          fuelStrategy={fuelStrategy}
          hiddenSeries={hiddenSeries}
          handleLegendClick={handleLegendClick}
        />
      )}

      <SessionLapTable
        session={session}
        selectedDriver={selectedDriver}
        isMultiClass={isMultiClass}
        hasTireWearData={hasTireWearData}
        hasFuelData={hasFuelData}
        hasVirtualEnergyData={hasVirtualEnergyData}
        isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
      />

      {selectedDriver && (
        <SessionStewardsLog
          selectedDriver={selectedDriver}
          showIncidentsLog={showIncidentsLog}
          setShowIncidentsLog={setShowIncidentsLog}
        />
      )}

      <SessionRaceStandings
        session={session}
        selectedDriverName={selectedDriverName}
        setSelectedDriverName={setSelectedDriverName}
        isMultiClass={isMultiClass}
      />
    </div>
  );
};
