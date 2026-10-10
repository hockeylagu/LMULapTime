import React, { useCallback } from 'react';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { Activity, BrainCircuit, Timer } from 'lucide-react';
import { ReplayDriverEntry, ReplayLapSummary, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { CornerSegmentComparison, LapSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { CornerConsistencyStat } from '../../../utils/cornerConsistency.js';
import { LapConsistencyStats } from '../../../utils/lapConsistency.js';
import { ReplayInspectorSidebarTabs } from './ReplayInspectorSidebarTabs.js';
import { MapColorMode } from '../map/replayMapUtils.js';
import { ReplayMapContainer } from '../map/ReplayMapContainer.js';
import { AIReportTab } from '../analysis/AIReportTab.js';
import { CornerSpeedTable } from '../analysis/CornerSpeedTable.js';
import { ConsistencyPanel, type LapConsistencyOption } from '../analysis/ConsistencyPanel.js';
import { CornerApexChart } from '../analysis/CornerApexChart.js';
import { getTrajectoryDistances, getDistancesInReferenceFrame, findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

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
  availableConsistencyLaps: LapConsistencyOption[];
  excludedConsistencyLaps: Set<number>;
  toggleConsistencyLap: (lapNumber: number) => void;
  trackVenue?: string;
  trackCourse?: string;
  layoutKey?: string;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
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
  isPlaying,
  onTogglePlay,
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
  // In the primary lap's frame (matched by track station), like the corner windows it is drawn against.
  const baselineDists = React.useMemo(
    () => (baselineTrajectory?.points && trajectory?.points
      ? getDistancesInReferenceFrame(baselineTrajectory.points, trajectory.points, trajectory.trackLengthM)
      : []),
    [baselineTrajectory, trajectory]
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
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
      colorBy={colorBy}
      onChangeColorBy={setColorBy}
      isCompareMode={isCompareMode}
      baselineTrajectory={baselineTrajectory}
      primaryCarClass={resolveDriverCarClass(drivers.find(driver => driver.slot === selectedDriverSlot))}
      baselineCarClass={baselineTrajectory?.sessionId === trajectory?.sessionId
        ? resolveDriverCarClass(drivers.find(driver => driver.slot === baselineTrajectory?.driverSlot)) : undefined}
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
      <ReplayInspectorSidebarTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cornerCount={cornerCount}
        onClosePanel={() => {
          setActiveTab('map');
          handleSelectCorner(null);
        }}
      />

      {isDoublePanel ? (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* LEFT SUB-PANEL: GPS Map (Always Visible) */}
          <div className="flex-1 md:w-1/2 min-w-0 flex flex-col min-h-0 p-0 gap-0 overflow-hidden border-b md:border-b-0 md:border-r border-lmu-border">
            {mapContainer}
          </div>

          {/* RIGHT SUB-PANEL: Corners or AI Report */}
          <div className="flex-1 md:w-1/2 min-w-0 flex flex-col min-h-0 overflow-hidden">
            {activeTab === 'corners' && (
              <div className="px-3 py-1.5 border-b border-lmu-border/60 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <button
                    onClick={() => setCornerSubView('compare')}
                    aria-pressed={cornerSubView === 'compare'}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-colors cursor-pointer ${
                      cornerSubView === 'compare' ? 'bg-lmu-raised text-white' : 'text-lmu-muted hover:text-white'
                    } ${FOCUS_RING}`}
                  >
                    <Timer className="w-3.5 h-3.5 text-lmu-muted" /> {isSelfAnalysis ? 'Lap analysis' : 'vs Baseline'}
                  </button>
                  <button
                    onClick={() => setCornerSubView('consistency')}
                    aria-pressed={cornerSubView === 'consistency'}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-colors cursor-pointer ${
                      cornerSubView === 'consistency' ? 'bg-lmu-raised text-white' : 'text-lmu-muted hover:text-white'
                    } ${FOCUS_RING}`}
                  >
                    <Activity className="w-3.5 h-3.5 text-lmu-muted" /> Consistency
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'ai-report' && (
              <div className="px-4 py-2.5 bg-lmu-card/50 border-b border-lmu-border/60 flex items-center gap-2 shrink-0 min-h-[41px]">
                <BrainCircuit className="w-4 h-4 text-lmu-accent-text shrink-0" />
                <span className="text-xs font-bold text-white">AI Coaching Report</span>
              </div>
            )}

            {activeTab === 'ai-report' ? (
              <AIReportTab
                trajectory={trajectory}
                baselineTrajectory={baselineTrajectory}
                baselineLapNumber={baselineLapNumber}
                segments={lapSegments}
                cornerStats={cornerConsistencyStats}
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
                trackLengthM={trajectory?.trackLengthM}
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
        <div className="flex-1 flex flex-col min-h-0 h-full p-0 gap-0 overflow-hidden">
          {mapContainer}
        </div>
      )}
    </div>
  );
};
