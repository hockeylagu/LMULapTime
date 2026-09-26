import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReplayInspectorModalBody } from '../../../../src/components/replay/inspector/ReplayInspectorModalBody';
import { LapSegmentComparison } from '../../../../src/utils/cornerAnalysis';

vi.mock('../../../../src/components/replay/inspector/ReplayInspectorHeader', () => ({
  ReplayInspectorHeader: (props: { replayName?: string | null }) => (
    <div data-testid="mock-header">Header: {props.replayName}</div>
  ),
}));

vi.mock('../../../../src/components/replay/telemetry/TelemetryStripCharts', () => ({
  TelemetryStripCharts: (props: { headerContent: React.ReactNode; initialStraight?: unknown }) => (
    <div data-testid="mock-charts">
      Charts
      {props.headerContent}
      {props.initialStraight ? <span data-testid="has-straight" /> : null}
    </div>
  ),
}));

vi.mock('../../../../src/components/replay/inspector/ReplayInspectorSidebar', () => ({
  ReplayInspectorSidebar: (props: { activeTab: string }) => (
    <div data-testid="mock-sidebar">Sidebar tab: {props.activeTab}</div>
  ),
}));

describe('ReplayInspectorModalBody', () => {
  const baseSegments: LapSegmentComparison[] = [
    {
      segmentIndex: 0,
      type: 'straight',
      entryDistM: 10,
      exitDistM: 150,
      lengthM: 140,
      primaryTimeSec: 4.2,
      timeDeltaSec: 0.1,
      primaryTopSpeedKmh: 310,
      baselineTopSpeedKmh: 305,
      topSpeedDeltaKmh: 5,
      primaryExitSpeedKmh: 310,
      baselineExitSpeedKmh: 305,
      exitSpeedDeltaKmh: 5,
    },
  ];

  it('renders header, charts, and sidebar with initial straight detected', () => {
    render(
      <ReplayInspectorModalBody
        onClose={vi.fn()}
        activeReplayName="Monza_Race.Vcr"
        replayName="Monza_Race.Vcr"
        metadata={null}
        trajectory={null}
        currentIndex={0}
        baselineTrajectory={null}
        selectedDriverSlot={0}
        isLoading={false}
        isTrajLoading={false}
        error={null}
        isCompareMode={false}
        handleToggleCompare={vi.fn()}
        baselineReplayName={null}
        baselineLapNumber={null}
        baselineDriverName={null}
        isComparePickerOpen={false}
        handleCloseComparePicker={vi.fn()}
        availableCompareLaps={[]}
        compareLapFilter="all"
        isCompareLapsLoading={false}
        setCompareLapFilter={vi.fn()}
        handleSelectCompareLap={vi.fn()}
        isBaselineLoading={false}
        setCurrentIndex={vi.fn()}
        isPlaying={false}
        setIsPlaying={vi.fn()}
        playbackSpeed={1}
        setPlaybackSpeed={vi.fn()}
        chartZoomRange={null}
        setChartZoomRange={vi.fn()}
        telemetryResolution={1}
        handleChangeResolution={vi.fn()}
        handleSelectDriver={vi.fn()}
        handleSelectLap={vi.fn()}
        maxSpeed={300}
        currentPoint={undefined}
        currentLapSummary={null}
        lapDeltas={null}
        handleSwapBaseline={vi.fn()}
        handleRemoveCompare={vi.fn()}
        handleSelectBaselineLap={vi.fn()}
        formatLapTime={() => '1:30.000'}
        bestSectors={{ s1: null, s2: null, s3: null }}
        lapSegments={baseSegments}
        cornerSegments={[]}
        cornerCount={11}
        isSelfAnalysis={true}
        consistencyStats={{
          lapCount: 12,
          stats: [],
          leastConsistent: null,
        }}
        cornerConsistencyStats={[]}
        isCornerConsistencyLoading={false}
        availableConsistencyLaps={[]}
        excludedConsistencyLaps={new Set()}
        toggleConsistencyLap={vi.fn()}
        selectedCornerNumber={null}
        handleSelectCorner={vi.fn()}
        selectedCornerMarkers={null}
        primaryDists={[]}
        activeTab="map"
        setActiveTab={vi.fn()}
        cornerSubView="compare"
        setCornerSubView={vi.fn()}
        colorBy="speed"
        setColorBy={vi.fn()}
        drivers={[]}
      />
    );

    expect(screen.getByTestId('mock-header')).toHaveTextContent('Header: Monza_Race.Vcr');
    expect(screen.getByTestId('mock-charts')).toBeInTheDocument();
    expect(screen.getByTestId('has-straight')).toBeInTheDocument();
    expect(screen.getByTestId('mock-sidebar')).toHaveTextContent('Sidebar tab: map');
  });

  it('renders without initial straight when no straight starts within 50m', () => {
    render(
      <ReplayInspectorModalBody
        onClose={vi.fn()}
        activeReplayName={null}
        replayName="Fallback.Vcr"
        metadata={null}
        trajectory={null}
        currentIndex={0}
        baselineTrajectory={null}
        selectedDriverSlot={0}
        isLoading={false}
        isTrajLoading={false}
        error={null}
        isCompareMode={false}
        handleToggleCompare={vi.fn()}
        baselineReplayName={null}
        baselineLapNumber={null}
        baselineDriverName={null}
        isComparePickerOpen={false}
        handleCloseComparePicker={vi.fn()}
        availableCompareLaps={[]}
        compareLapFilter="all"
        isCompareLapsLoading={false}
        setCompareLapFilter={vi.fn()}
        handleSelectCompareLap={vi.fn()}
        isBaselineLoading={false}
        setCurrentIndex={vi.fn()}
        isPlaying={false}
        setIsPlaying={vi.fn()}
        playbackSpeed={1}
        setPlaybackSpeed={vi.fn()}
        chartZoomRange={null}
        setChartZoomRange={vi.fn()}
        telemetryResolution={1}
        handleChangeResolution={vi.fn()}
        handleSelectDriver={vi.fn()}
        handleSelectLap={vi.fn()}
        maxSpeed={300}
        currentPoint={undefined}
        currentLapSummary={null}
        lapDeltas={null}
        handleSwapBaseline={vi.fn()}
        handleRemoveCompare={vi.fn()}
        handleSelectBaselineLap={vi.fn()}
        formatLapTime={() => '1:30.000'}
        bestSectors={{ s1: null, s2: null, s3: null }}
        lapSegments={[]}
        cornerSegments={[]}
        cornerCount={0}
        isSelfAnalysis={false}
        consistencyStats={{
          lapCount: 0,
          stats: [],
          leastConsistent: null,
        }}
        cornerConsistencyStats={[]}
        isCornerConsistencyLoading={false}
        availableConsistencyLaps={[]}
        excludedConsistencyLaps={new Set()}
        toggleConsistencyLap={vi.fn()}
        selectedCornerNumber={null}
        handleSelectCorner={vi.fn()}
        selectedCornerMarkers={null}
        primaryDists={[]}
        activeTab="corners"
        setActiveTab={vi.fn()}
        cornerSubView="consistency"
        setCornerSubView={vi.fn()}
        colorBy="default"
        setColorBy={vi.fn()}
        drivers={[]}
      />
    );

    expect(screen.getByTestId('mock-header')).toHaveTextContent('Header: Fallback.Vcr');
    expect(screen.queryByTestId('has-straight')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-sidebar')).toHaveTextContent('Sidebar tab: corners');
  });
});
