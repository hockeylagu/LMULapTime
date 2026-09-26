import React, { useCallback } from 'react';
import { Activity, BrainCircuit, Timer, X } from 'lucide-react';
import { ReplayDriverEntry, ReplayLapSummary, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { CornerSegmentComparison, LapSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { CornerConsistencyStat } from '../../../utils/cornerConsistency.js';
import { LapConsistencyStats } from '../../../utils/lapConsistency.js';
import { MapColorMode } from '../map/replayMapUtils.js';
import { ReplayMapContainer } from '../map/ReplayMapContainer.js';
import { AIReportTab } from '../analysis/AIReportTab.js';
import { CornerSpeedTable } from '../analysis/CornerSpeedTable.js';
import { ConsistencyPanel } from '../analysis/ConsistencyPanel.js';
import { CornerApexChart } from '../analysis/CornerApexChart.js';
import { getTrajectoryDistances, findIndexAtDistance } from '../../../utils/replayComparison.js';

export interface ReplayInspectorSidebarProps {
  activeTab: 'map' | 'corners' | 'ai-report';
  setActiveTab: (tab: 'map' | 'corners' | 'ai-report') => void;
  cornerCount: number;
  colorBy: MapColorMode;
  setColorBy: (mode: MapColorMode) => void;
  isCompareMode: boolean;
  baselineTrajectory?: ReplayTrajectoryData | null;
  cornerSubView: 'compare' | 'consistency';
  setCornerSubView: (view: 'compare' | 'consistency') => void;
  trajectory: ReplayTrajectoryData | null;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  currentPoint?: ReplayTrajectoryPoint;
  cornerSegments: CornerSegmentComparison[];
  selectedCornerNumber: number | null;
  handleSelectCorner: (cornerNumber: number | null) => void;
  baselineLapNumber: number | null;
  lapSegments: LapSegmentComparison[];
  currentLapSummary?: ReplayLapSummary | null;
  drivers: ReplayDriverEntry[];
  selectedDriverSlot: number | null;
  isSelfAnalysis: boolean;
  consistencyStats: LapConsistencyStats;
  cornerConsistencyStats: CornerConsistencyStat[];
  isCornerConsistencyLoading: boolean;
  handleSelectBaselineLap: (lapNumber: number) => void;
  formatLapTime: (sec?: number | null) => string;
  availableConsistencyLaps: { lapNumber: number; lapTimeSec: number; isValid: boolean }[];
  excludedConsistencyLaps: Set<number>;
  toggleConsistencyLap: (lapNumber: number) => void;
  trackVenue?: string;
  trackCourse?: string;
  layoutKey?: string;
}

export const ReplayInspectorSidebar: React.FC<ReplayInspectorSidebarProps> = ({
  activeTab,
  setActiveTab,
  cornerCount,
  colorBy,
  setColorBy,
  isCompareMode,
  baselineTrajectory,
  cornerSubView,
  setCornerSubView,
  trajectory,
  currentIndex,
  setCurrentIndex,
  currentPoint,
  cornerSegments,
  selectedCornerNumber,
  handleSelectCorner,
  baselineLapNumber,
  lapSegments,
  currentLapSummary,
  drivers,
  selectedDriverSlot,
  isSelfAnalysis,
  consistencyStats,
  cornerConsistencyStats,
  isCornerConsistencyLoading,
  handleSelectBaselineLap,
  formatLapTime,
  availableConsistencyLaps,
  excludedConsistencyLaps,
  toggleConsistencyLap,
  trackVenue,
  trackCourse,
  layoutKey,
}) => {
  const selectedCorner = React.useMemo(
    () => cornerSegments?.find(c => c.cornerNumber === selectedCornerNumber) || null,
    [cornerSegments, selectedCornerNumber]
  );
  const primaryDists = React.useMemo(
    () => (trajectory?.points ? getTrajectoryDistances(trajectory.points, trajectory.trackLengthM) : []),
    [trajectory]
  );
  const baselineDists = React.useMemo(
    () => (baselineTrajectory?.points ? getTrajectoryDistances(baselineTrajectory.points, baselineTrajectory.trackLengthM) : []),
    [baselineTrajectory]
  );

  const handleSelectMapCorner = useCallback((cornerNumber: number | null) => {
    handleSelectCorner(cornerNumber);
    if (cornerNumber !== null) setActiveTab('corners');
  }, [handleSelectCorner, setActiveTab]);

  const isDoublePanel = activeTab !== 'map';

  const mapContainer = (
    <ReplayMapContainer
      trajectory={trajectory}
      currentIndex={currentIndex}
      onSelectIndex={setCurrentIndex}
      colorBy={colorBy}
      onChangeColorBy={setColorBy}
      isCompareMode={isCompareMode}
      baselineTrajectory={baselineTrajectory}
      currentPoint={currentPoint}
      corners={cornerSegments}
      selectedCornerNumber={selectedCornerNumber}
      onSelectCornerNumber={handleSelectMapCorner}
      trackVenue={trackVenue}
      trackCourse={trackCourse}
      layoutKey={layoutKey}
      onOpenCornersTab={() => setActiveTab('corners')}
    />
  );

  return (
    <div
      className={`shrink-0 bg-lmu-bg flex flex-col min-h-0 overflow-hidden transition-all duration-200 ${
        isDoublePanel
          ? 'w-full md:w-[700px] lg:w-[800px] xl:w-[880px] 2xl:w-[980px]'
          : 'w-full md:w-[380px] lg:w-[420px] xl:w-[460px] 2xl:w-[500px]'
      }`}
    >
      <div className="px-4 py-2 bg-lmu-card border-b border-lmu-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'corners' ? 'map' : 'corners')}
            aria-pressed={activeTab === 'corners'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
              activeTab === 'corners'
                ? 'bg-lmu-accent text-white border-lmu-accent shadow-md'
                : 'bg-lmu-bg/60 text-lmu-muted hover:text-white border-lmu-border/60 hover:border-lmu-border'
            }`}
            title={activeTab === 'corners' ? 'Close Corners Panel' : 'Open Corners Panel'}
          >
            <Timer className="w-3.5 h-3.5" /> Corners ({cornerCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'ai-report' ? 'map' : 'ai-report')}
            aria-pressed={activeTab === 'ai-report'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
              activeTab === 'ai-report'
                ? 'bg-lmu-accent text-white border-lmu-accent shadow-md'
                : 'bg-lmu-bg/60 text-lmu-muted hover:text-white border-lmu-border/60 hover:border-lmu-border'
            }`}
            title={activeTab === 'ai-report' ? 'Close AI Report Panel' : 'Open AI Report Panel'}
          >
            <BrainCircuit className="w-3.5 h-3.5" /> AI Report
          </button>
        </div>

        {isDoublePanel && (
          <button
            type="button"
            onClick={() => {
              setActiveTab('map');
              handleSelectCorner(null);
            }}
            className="inline-flex items-center justify-center w-7 h-7 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close side panel"
            title="Close side panel"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isDoublePanel ? (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* LEFT SUB-PANEL: GPS Map (Always Visible) */}
          <div className="flex-1 md:w-1/2 min-w-0 flex flex-col min-h-0 p-3 gap-2.5 overflow-hidden border-b md:border-b-0 md:border-r border-lmu-border">
            {mapContainer}
          </div>

          {/* RIGHT SUB-PANEL: Corners or AI Report */}
          <div className="flex-1 md:w-1/2 min-w-0 flex flex-col min-h-0 overflow-hidden">
            {activeTab === 'corners' && (
              <div className="px-3 py-1.5 bg-lmu-card/50 border-b border-lmu-border/60 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-lmu-bg p-0.5 rounded-lg border border-lmu-border/60 flex-1 min-w-0">
                  <button
                    onClick={() => setCornerSubView('compare')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      cornerSubView === 'compare' ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'
                    }`}
                  >
                    <Timer className="w-3.5 h-3.5" /> vs Baseline
                  </button>
                  <button
                    onClick={() => setCornerSubView('consistency')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      cornerSubView === 'consistency' ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" /> Consistency
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'ai-report' && (
              <div className="px-4 py-2.5 bg-lmu-card/50 border-b border-lmu-border/60 flex items-center gap-2 shrink-0 min-h-[41px]">
                <BrainCircuit className="w-4 h-4 text-lmu-accent shrink-0" />
                <span className="text-xs font-bold text-white">AI Coaching Report</span>
              </div>
            )}

            {activeTab === 'ai-report' ? (
              <AIReportTab
                trajectory={trajectory}
                baselineTrajectory={baselineTrajectory}
                baselineLapNumber={baselineLapNumber}
                segments={lapSegments}
                currentLapSummary={currentLapSummary}
                carClass={drivers.find(driver => driver.slot === selectedDriverSlot)?.carClass}
                carModel={drivers.find(driver => driver.slot === selectedDriverSlot)?.carModel}
              />
            ) : cornerSubView === 'compare' ? (
              <CornerSpeedTable
                segments={lapSegments}
                selfAnalysis={isSelfAnalysis}
                primaryLabel={isSelfAnalysis ? `Lap ${trajectory?.currentLap ?? 1}` : `Lap ${trajectory?.currentLap ?? 1}`}
                baselineLabel={`Lap ${baselineTrajectory?.currentLap ?? baselineLapNumber ?? 1}`}
                onSelectDistance={distM => setCurrentIndex(findIndexAtDistance(primaryDists, distM))}
                selectedCornerNumber={selectedCornerNumber}
                onSelectCorner={handleSelectCorner}
                selectedCornerChart={
                  selectedCorner && trajectory?.points ? (
                    <CornerApexChart
                      corner={selectedCorner}
                      primaryPoints={trajectory.points}
                      primaryDists={primaryDists}
                      baselinePoints={baselineTrajectory?.points}
                      baselineDists={baselineDists}
                      isCompareMode={Boolean(isCompareMode && baselineTrajectory?.points?.length)}
                      compact={false}
                      currentIndex={currentIndex}
                      onSelectIndex={setCurrentIndex}
                      trackVenue={trackVenue}
                      trackCourse={trackCourse}
                      layoutKey={layoutKey}
                      replayName={trajectory.replayName}
                      onClose={() => handleSelectCorner(null)}
                      className="shrink-0"
                    />
                  ) : null
                }
                className="flex-1 min-h-0"
              />
            ) : (
              <ConsistencyPanel
                stats={consistencyStats}
                cornerStats={cornerConsistencyStats}
                isLoadingCornerStats={isCornerConsistencyLoading}
                onSelectCorner={handleSelectCorner}
                onSelectBaselineLap={handleSelectBaselineLap}
                formatLapTime={formatLapTime}
                trackPoints={trajectory?.points}
                trackBounds={trajectory?.bounds}
                availableLaps={availableConsistencyLaps}
                excludedLaps={excludedConsistencyLaps}
                onToggleLapExclusion={toggleConsistencyLap}
                currentLapNumber={trajectory?.currentLap}
                className="flex-1 min-h-0"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 h-full p-3 gap-2.5 overflow-hidden">
          {mapContainer}
        </div>
      )}
    </div>
  );
};
