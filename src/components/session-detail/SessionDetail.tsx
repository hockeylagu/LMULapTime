import React from 'react';
import { useSessionDetailData } from './useSessionDetailData.js';
import { SessionDetailHeader } from './overview/SessionDetailHeader.js';
import { DriverPerformancePanel } from './overview/DriverPerformancePanel.js';
import { SessionDebriefCard } from './debrief/SessionDebriefCard.js';
import { SessionTelemetryChart } from './chart/SessionTelemetryChart.js';
import { SessionLapTable } from './table/SessionLapTable.js';
import { SessionRaceStandings } from './standings/SessionRaceStandings.js';
import { DetailedSession, SessionProgressionPoint } from '../../../shared/types/index.js';
import { LoadingState } from '../common/index.js';
import { FOCUS_RING } from '../common/buttonStyles.js';

export interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
  onSelectSession?: (sessionId: string) => void;
  progression?: SessionProgressionPoint[];
  sessions?: DetailedSession[];
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
    loadError,
    selectedDriver,
    selectedDriverName,
    setSelectedDriverName,
    chartMetric,
    setChartMetric,
    hiddenSeries,
    handleLegendClick,
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
      <LoadingState
        title="Loading Session Telemetry"
        subtitle="Loading session telemetry and lap data..."
        dataTestId="session-detail-loading"
      />
    );
  }

  if (!session) {
    return (
      <div className="py-12 text-center text-lmu-muted bg-lmu-card border border-lmu-border rounded-2xl">
        <p className="text-lg font-bold text-white mb-3">{loadError ? 'Could Not Load Session' : 'Session Not Found'}</p>
        {loadError && <p role="alert" className="text-sm text-lmu-loss mb-4">{loadError}</p>}
        <button
          onClick={onBack}
          className={`px-4 py-2 bg-lmu-accent text-white rounded-xl font-medium text-xs uppercase tracking-wider ${FOCUS_RING}`}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && <p role="alert" className="text-sm text-lmu-loss">Session refresh failed: {loadError}</p>}
      <SessionDetailHeader
        session={session}
        selectedDriver={selectedDriver}
        selectedDriverName={selectedDriverName}
        setSelectedDriverName={setSelectedDriverName}
        onBack={onBack}
        relatedSession={relatedSession}
        handleNavigateToSession={handleNavigateToSession}
        refEntry={refEntry}
      />

      <DriverPerformancePanel
        session={session}
        selectedDriver={selectedDriver}
        isMultiClass={isMultiClass}
        isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
        allTimeCategoryTrackPB={allTimeCategoryTrackPB}
      />

      {selectedDriver && session.matchingReplayFile && (
        <SessionDebriefCard session={session} selectedDriver={selectedDriver} />
      )}

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

      <SessionRaceStandings
        session={session}
        selectedDriverName={selectedDriverName}
        setSelectedDriverName={setSelectedDriverName}
        isMultiClass={isMultiClass}
      />
    </div>
  );
};
