import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DetailedSession, DriverData } from '../../server/core/types.js';
import { SessionTelemetryChart } from '../../src/components/session-detail/chart/SessionTelemetryChart.js';
import { mockDetailedSession } from './mockSessionDetail.js';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children, onClick }: { children: React.ReactNode; onClick?: (state: { activeLabel: number }) => void }) => (
    <div>
      <button type="button" aria-label="Select lap 2" onClick={() => onClick?.({ activeLabel: 2 })} />
      {children}
    </div>
  ),
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
}));

const session = mockDetailedSession as unknown as DetailedSession;
const selectedDriver = session.playerDriver as DriverData;

function renderChart(chartSession = session) {
  return render(
    <SessionTelemetryChart
      session={chartSession}
      selectedDriver={selectedDriver}
      chartMetric="lapTime"
      setChartMetric={vi.fn()}
      activeChartMetric="lapTime"
      hasTireWearData={true}
      hasFuelData={true}
      hasVirtualEnergyData={true}
      isMultiClass={false}
      fuelStrategy={null}
      hiddenSeries={{}}
      handleLegendClick={vi.fn()}
    />
  );
}

describe('SessionTelemetryChart navigation', () => {
  it('opens replay telemetry at the selected lap when a replay is available', () => {
    renderChart();

    fireEvent.click(screen.getByRole('button', { name: 'Select lap 2' }));

    expect(window.location.hash).toBe('#/telemetry?replayName=spa_replay.vcr&lap=2');
  });

  it('opens lap comparison with the session context when no replay is available', () => {
    renderChart({ ...session, matchingReplayFile: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'Select lap 2' }));

    expect(window.location.hash).toBe('#/compare?track=Spa&carClass=LMH&sessionId=sess123&lapNum=2');
  });
});