import React, { useCallback, useRef, useState } from 'react';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { Activity, Timer } from 'lucide-react';
import { ReplayDriverEntry, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { CornerSegmentComparison, LapSegmentComparison } from '../../../utils/cornerAnalysis/types.js';
import { CornerConsistencyStat } from '../../../utils/cornerConsistency.js';
import { LapConsistencyStats } from '../../../utils/lapConsistency.js';
import { ReplayInspectorSidebarTabs } from './ReplayInspectorSidebarTabs.js';
import { PanelResizeHandle, usePanelWidth } from './PanelResizeHandle.js';
import { MapColorMode } from '../map/replayMapUtils.js';
import { ReplayMapContainer } from '../map/ReplayMapContainer.js';
import { CornerSpeedTable } from '../analysis/CornerSpeedTable.js';
import { ConsistencyPanel } from '../analysis/ConsistencyPanel.js';
import type { LapConsistencyOption } from '../analysis/LapSelectorDropdown.js';
import { CornerApexChart } from '../analysis/CornerApexChart.js';
import { CornerConclusionBlock } from '../analysis/conclusion/CornerConclusionBlock.js';
import { getTrajectoryDistances, getDistancesInReferenceFrame, findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export interface ReplayInspectorSidebarProps {
  activeTab: 'map' | 'corners';
  setActiveTab: (tab: 'map' | 'corners') => void;
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
  drivers: ReplayDriverEntry[];
  selectedDriverSlot: number | null;
  isSelfAnalysis: boolean;
  consistencyStats: LapConsistencyStats;
  cornerConsistencyStats: CornerConsistencyStat[];
  isCornerConsistencyLoading: boolean;
  cornerConsistencyUnavailableReason: string | null;
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
  isExpanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  view?: '2d' | '3d';
  onChangeView?: (view: '2d' | '3d') => void;
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
  isExpanded,
  onToggleExpanded,
  view,
  onChangeView,
  currentPoint,
  cornerSegments,
  selectedCornerNumber,
  handleSelectCorner,
  baselineLapNumber,
  lapSegments,
  drivers,
  selectedDriverSlot,
  isSelfAnalysis,
  consistencyStats,
  cornerConsistencyStats,
  isCornerConsistencyLoading,
  cornerConsistencyUnavailableReason,
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
  const panel = useRef<HTMLDivElement>(null), [dragging, setDragging] = useState(false);
  const [panelWidth, setPanelWidth] = usePanelWidth(isDoublePanel ? 'double' : 'single');

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
      isExpanded={isExpanded} onToggleExpanded={onToggleExpanded}
      view={view}
      onChangeView={onChangeView}
    />
  );

  return (
    <div ref={panel} style={{'--panel-w': `${panelWidth ?? 0}px`} as React.CSSProperties}
      className={`relative shrink-0 bg-lmu-bg flex flex-col min-h-0 overflow-hidden w-full md:w-[var(--panel-w)] ${dragging ? '' : 'transition-all duration-200'} ${
        isDoublePanel
          ? 'md:min-w-[700px] lg:min-w-[800px] xl:min-w-[880px] 2xl:min-w-[980px]'
          : 'md:min-w-[380px] lg:min-w-[420px] xl:min-w-[460px] 2xl:min-w-[500px]'
      }`}
    >
      {/* The breakpoint widths are the minimum: the divider only widens the panel over the charts. */}
      <PanelResizeHandle panel={panel} onResize={setPanelWidth} onDragging={setDragging} />
      <ReplayInspectorSidebarTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cornerCount={cornerCount}
        onClosePanel={() => {
          setActiveTab('map');
          handleSelectCorner(null);
        }}
      />

      {/* One tree for every tab: the map keeps its place, so opening Corners never reloads its 3D view. */}
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${isDoublePanel ? 'md:flex-row' : ''}`}>
        {/* LEFT SUB-PANEL: GPS Map (Always Visible) */}
        <div className={`flex-1 min-w-0 flex flex-col min-h-0 p-0 gap-0 overflow-hidden ${isDoublePanel ? 'md:w-1/2 border-b md:border-b-0 md:border-r border-lmu-border' : ''}`}>
          {mapContainer}
        </div>

        {/* RIGHT SUB-PANEL: Corners */}
        {isDoublePanel && (
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

            {cornerSubView === 'compare' ? (
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
                      footer={<CornerConclusionBlock trajectory={trajectory} baseline={isCompareMode ? baselineTrajectory : null} cornerNumber={selectedCorner.cornerNumber} />}
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
                cornerStatsUnavailableReason={cornerConsistencyUnavailableReason}
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
        )}
      </div>
    </div>
  );
};
