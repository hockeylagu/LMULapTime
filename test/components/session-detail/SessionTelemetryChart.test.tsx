import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LegendPayload } from 'recharts';
import type { DetailedSession, DriverData } from '../../../server/core/types.js';
import { SessionTelemetryChart } from '../../../src/components/session-detail/chart/SessionTelemetryChart.js';
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
  Legend: ({ formatter }: { formatter: (value: string, entry: LegendPayload) => React.ReactNode }) => <div>{formatter('Sim Driver', { dataKey: 'Sim Driver', value: 'Sim Driver', color: '#fff', type: 'line' })}</div>,
  Line: () => null,
}));

const session = mockDetailedSession as unknown as DetailedSession;
const selectedDriver = session.playerDriver as DriverData;

function renderChart(chartSession = session, handleLegendClick = vi.fn(), hiddenSeries: Record<string, boolean> = {}) {
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
      hiddenSeries={hiddenSeries}
      handleLegendClick={handleLegendClick}
    />
  );
}

describe('SessionTelemetryChart navigation', () => {
  it('exposes legend visibility and activates once from the keyboard', async () => {
    const toggle = vi.fn();
    renderChart(session, toggle, { 'Sim Driver': true });
    const legend = screen.getByRole('button', { name: 'Sim Driver' });
    expect(legend).toHaveAttribute('aria-pressed', 'false');
    legend.focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ dataKey: 'Sim Driver' }));
  });
  it('opens replay telemetry at the selected lap when a replay is available', () => {
    renderChart();

    fireEvent.click(screen.getByRole('button', { name: 'Select lap 2' }));

    expect(window.location.hash).toBe('#/telemetry?replayName=spa_replay.vcr&lap=2&driverName=Sim+Driver');
  });

  it('opens lap comparison with the session context when no replay is available', () => {
    renderChart({ ...session, matchingReplayFile: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'Select lap 2' }));

    expect(window.location.hash).toBe('#/leaderboard?track=Spa&carClass=LMH&sessionId=sess123&lapNum=2');
  });
});
