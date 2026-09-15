import React from 'react';
import { Activity, BrainCircuit, Gauge, Timer } from 'lucide-react';
import {
  ReplayDriverEntry,
  ReplayLapSummary,
  ReplayTrajectoryData,
  ReplayTrajectoryPoint,
} from '../../../../server/types.js';
import { CornerConsistencyStat, CornerSegmentComparison, LapSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { LapConsistencyStats } from '../../../utils/lapConsistency.js';
import { MapColorMode } from '../map/replayMapUtils.js';
import { ReplayMapContainer } from '../map/ReplayMapContainer.js';
import { AIReportTab } from '../analysis/AIReportTab.js';
import { CornerSpeedTable } from '../analysis/CornerSpeedTable.js';
import { ConsistencyPanel } from '../analysis/ConsistencyPanel.js';

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
  return (
    <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[460px] 2xl:w-[500px] shrink-0 bg-lmu-bg flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-2.5 bg-lmu-card border-b border-lmu-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'map' ? 'bg-lmu-accent text-white shadow-md' : 'text-lmu-muted hover:text-white hover:bg-lmu-card'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" /> GPS Map
          </button>
          <button
            onClick={() => setActiveTab('corners')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'corners' ? 'bg-lmu-accent text-white shadow-md' : 'text-lmu-muted hover:text-white hover:bg-lmu-card'
            }`}
          >
            <Timer className="w-3.5 h-3.5" /> Corners ({cornerCount})
          </button>
          <button
            onClick={() => setActiveTab('ai-report')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              activeTab === 'ai-report' ? 'bg-lmu-accent text-white shadow-md' : 'text-lmu-muted hover:text-white hover:bg-lmu-card'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" /> AI Report
          </button>
        </div>
      </div>

      {activeTab === 'corners' && (
        <div className="px-3 py-1.5 bg-lmu-card/50 border-b border-lmu-border/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 bg-lmu-bg p-0.5 rounded-lg border border-lmu-border/60 w-full">
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

      {activeTab === 'map' ? (
        <div className="flex-1 flex flex-col min-h-0 h-full p-3 gap-2.5 overflow-hidden">
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
            onSelectCornerNumber={handleSelectCorner}
            trackVenue={trackVenue}
            trackCourse={trackCourse}
            layoutKey={layoutKey}
          />
        </div>
      ) : activeTab === 'ai-report' ? (
        <AIReportTab
          trajectory={trajectory}
          baselineTrajectory={baselineTrajectory}
          baselineLapNumber={baselineLapNumber}
          segments={lapSegments}
          currentLapSummary={currentLapSummary}
          carClass={drivers.find(driver => driver.slot === selectedDriverSlot)?.carClass}
          carModel={drivers.find(driver => driver.slot === selectedDriverSlot)?.carModel}
        />
      ) : activeTab === 'corners' && cornerSubView === 'compare' ? (
        <CornerSpeedTable
          segments={lapSegments}
          selfAnalysis={isSelfAnalysis}
          primaryLabel={isSelfAnalysis ? `Lap ${trajectory?.currentLap ?? 1}` : `Lap ${trajectory?.currentLap ?? 1}`}
          baselineLabel={`Lap ${baselineTrajectory?.currentLap ?? baselineLapNumber ?? 1}`}
          onSelectDistance={distM => setCurrentIndex(Math.max(0, distM))}
          selectedCornerNumber={selectedCornerNumber}
          onSelectCorner={handleSelectCorner}
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
  );
};
