import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReplayInspectorModal } from '../../src/components/replay/ReplayInspectorModal';
import { ConsistencyPanel } from '../../src/components/replay/ConsistencyPanel';

vi.mock('recharts', () => {
  return {
    BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Bar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Cell: (props: Record<string, unknown> & { children?: ReactNode }) => <button type="button" {...props}>{props.children}</button>,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});

describe('ReplayInspectorModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockMeta = {
    filename: 'Test_Replay.vcr',
    filePath: 'C:\\LMU\\UserData\\Replays\\Test_Replay.vcr',
    fileSizeBytes: 5000000,
    mtimeMs: Date.now(),
    eventInfo: {
      eventTitle: 'LMGT3 Fixed',
      splitNo: 3,
      session: 'RACE',
    },
    trackName: 'Spa-Francorchamps',
    timeSliceCount: 25000,
    totalEvents: 70000,
    durationSec: 500,
    drivers: [
      { slot: 1, name: 'Samuel Lague', carModel: 'Ferrari 296 GT3', team: 'Vista AF Corsa', carNumber: '21', isPlayer: true },
      { slot: 2, name: 'Rival Racer', carModel: 'BMW M4 GT3', team: 'Team WRT', carNumber: '32', isPlayer: false },
    ],
  };

  const mockTraj = {
    replayName: 'Test_Replay.vcr',
    driverSlot: 1,
    pointsCount: 3,
    bounds: { minX: 100, maxX: 200, minZ: 200, maxZ: 240, spanX: 100, spanZ: 40 },
    points: [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      { x: 150, y: 11, z: 220, rotY: 0.5, speedKmh: 180, throttle: 100, brake: 0, timeSec: 0.5 },
      { x: 200, y: 12, z: 240, rotY: 1.0, speedKmh: 90, throttle: 0, brake: 70, timeSec: 1.0 },
    ],
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReplayInspectorModal isOpen={false} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('fetches and displays metadata and telemetry when open', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
      expect(screen.getByText(/Split 3/i)).toBeInTheDocument();
      expect(screen.getByText(/Spa-Francorchamps/i)).toBeInTheDocument();
    });

    const driverSelect = screen.getByLabelText(/Select Driver/i);
    expect(driverSelect).toHaveValue('1');
    expect(screen.getByRole('option', { name: /Samuel Lague.*You/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Rival Racer/i })).toBeInTheDocument();
  });

  it('shows the Corners tab for self-analysis even without a baseline lap loaded', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByText(/Spa-Francorchamps/i)).toBeInTheDocument();
    });

    const cornersTab = screen.getByRole('button', { name: /Corners/i });
    fireEvent.click(cornersTab);

    // This mock lap's speed trace doesn't have a full braking->apex->accel cycle, so no
    // corners are detected - but the tab/table render at all (without compare mode) is the point.
    expect(screen.getByText(/Straight \(/i)).toBeInTheDocument();
    expect(screen.queryByText(/Whole lap:/i)).not.toBeInTheDocument();
  });

  it('allows switching drivers from the selector and reloads trajectory', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('driverSlot=2')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTraj,
            driverSlot: 2,
            points: [{ x: 50, y: 5, z: 100, rotY: 0, speedKmh: 210, throttle: 95, brake: 0, timeSec: 0.0 }],
          }),
        });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Select Driver/i), { target: { value: '2' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('driverSlot=2'));
    });
  });

  it('calls onClose when close button clicked', async () => {
    const handleClose = vi.fn();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) })
    );

    render(
      <ReplayInspectorModal isOpen={true} onClose={handleClose} replayName="Test_Replay.vcr" />
    );

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('selects the current driver in the header dropdown and reloads telemetry', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('driverSlot=2')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTraj,
            driverSlot: 2,
            points: [{ x: 50, y: 5, z: 100, rotY: 0, speedKmh: 210, throttle: 95, brake: 0, timeSec: 0.0 }],
          }),
        });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
    });

    const driverSelect = screen.getByLabelText(/Select Driver/i);
    expect(driverSelect).toHaveValue('1');
    fireEvent.change(driverSelect, { target: { value: '2' } });

    // Verify it called trajectory fetch with driverSlot=2
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('driverSlot=2'));
    });
  });

  it('toggles compare mode and allows comparing with a baseline lap', async () => {
    const mockTrajWithLaps = {
      ...mockTraj,
      currentLap: 1,
      laps: [
        { lapNumber: 1, lapTimeSec: 100.5, isBest: false, isOutlap: false, s1Sec: 30.2, s2Sec: 40.1, s3Sec: 30.2 },
        { lapNumber: 2, lapTimeSec: 99.8, isBest: true, isOutlap: false, s1Sec: 30.0, s2Sec: 39.8, s3Sec: 30.0 },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/replays') && !url.includes('/trajectory') && !url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([
          { name: 'Other_Spa_Replay.vcr', trackName: 'Spa-Francorchamps', eventTitle: 'LMGT3 Fixed' }
        ]) });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTrajWithLaps) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
    });

    // Find and click the Compare button
    const compareBtn = screen.getByRole('button', { name: /Compare/i });
    fireEvent.click(compareBtn);

    // Available replay-backed lap picker should now be visible
    await waitFor(() => {
      expect(screen.getByText(/Available laps with replay telemetry/i)).toBeInTheDocument();
    });

    // Verify it requested the baseline trajectory
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/trajectory'));
  });

  it('renders playback speed options 0.5x, 1x, and 2x while omitting 5x', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByText('0.5x')).toBeInTheDocument();
    });

    const speedHalf = screen.getByRole('button', { name: '0.5x' });
    const speed1x = screen.getByRole('button', { name: '1x' });
    const speed2x = screen.getByRole('button', { name: '2x' });

    expect(speedHalf).toBeInTheDocument();
    expect(speed1x).toBeInTheDocument();
    expect(speed2x).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '5x' })).not.toBeInTheDocument();

    // Default speed is 1x
    expect(speed1x.className).toContain('bg-lmu-accent');

    // Click 0.5x
    fireEvent.click(speedHalf);
    expect(speedHalf.className).toContain('bg-lmu-accent');
    expect(speed1x.className).not.toContain('bg-lmu-accent');
  });

  it('renders fastest lap badge and lap time using the lmu-gold personal-best color set', async () => {
    const trajWithBestLap = {
      ...mockTraj,
      currentLap: 1,
      laps: [
        { lapNumber: 1, lapTimeSec: 135.5, s1Sec: 40.0, s2Sec: 50.0, s3Sec: 45.5, isBest: true },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(trajWithBestLap) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByText(/Fastest Lap/i)).toBeInTheDocument();
    });

    const fastestBadge = screen.getByText(/Fastest Lap/i);
    expect(fastestBadge.className).toContain('bg-lmu-gold/15');
    expect(fastestBadge.className).toContain('text-lmu-gold');
    expect(fastestBadge.className).toContain('border-lmu-gold/40');
  });

  it('opens a double-clicked consistency chart lap as the baseline comparison', () => {
    const onSelectBaselineLap = vi.fn();
    render(
      <ConsistencyPanel
        stats={{
          lapCount: 3,
          stats: [
            { key: 'lapTimeSec', label: 'Full Lap', count: 3, minSec: 80, maxSec: 82, avgSec: 81, stdDevSec: 0.8, consistencyPct: 1.0 },
            { key: 's1Sec', label: 'Sector 1', count: 3, minSec: 27, maxSec: 29, avgSec: 28, stdDevSec: 0.7, consistencyPct: 2.5 },
            { key: 's2Sec', label: 'Sector 2', count: 3, minSec: 25, maxSec: 27, avgSec: 26, stdDevSec: 0.6, consistencyPct: 2.3 },
            { key: 's3Sec', label: 'Sector 3', count: 3, minSec: 28, maxSec: 30, avgSec: 29, stdDevSec: 0.8, consistencyPct: 2.8 },
          ],
          leastConsistent: { key: 's3Sec', label: 'Sector 3', count: 3, minSec: 28, maxSec: 30, avgSec: 29, stdDevSec: 0.8, consistencyPct: 2.8 },
        }}
        cornerStats={[
          {
            cornerNumber: 1,
            lapsSampled: 3,
            minDistM: 10,
            entrySpeedKmh: { count: 3, consistencyPct: 1, avg: 120, max: 125, min: 110, stdDev: 5, samples: [{ lapNumber: 1, value: 110 }, { lapNumber: 2, value: 120 }, { lapNumber: 3, value: 125 }] },
            apexSpeedKmh: { count: 3, consistencyPct: 1, avg: 100, max: 105, min: 95, stdDev: 4, samples: [{ lapNumber: 1, value: 95 }, { lapNumber: 2, value: 100 }, { lapNumber: 3, value: 105 }] },
            exitSpeedKmh: { count: 3, consistencyPct: 1, avg: 110, max: 112, min: 108, stdDev: 2, samples: [{ lapNumber: 1, value: 108 }, { lapNumber: 2, value: 110 }, { lapNumber: 3, value: 112 }] },
            brakingDistM: { count: 3, consistencyPct: 1, avg: 18, max: 20, min: 16, stdDev: 2, samples: [{ lapNumber: 1, value: 16 }, { lapNumber: 2, value: 18 }, { lapNumber: 3, value: 20 }] },
            throttleOnDistM: { count: 3, consistencyPct: 1, avg: 18, max: 20, min: 16, stdDev: 2, samples: [{ lapNumber: 1, value: 16 }, { lapNumber: 2, value: 18 }, { lapNumber: 3, value: 20 }] },
            time: { count: 3, consistencyPct: 1, avg: 1.5, max: 1.7, min: 1.4, stdDev: 0.12, samples: [{ lapNumber: 1, value: 1.4 }, { lapNumber: 2, value: 1.5 }, { lapNumber: 3, value: 1.7 }] },
          },
        ]}
        availableLaps={[
          { lapNumber: 1, lapTimeSec: 81, isValid: true },
          { lapNumber: 2, lapTimeSec: 80, isValid: true },
          { lapNumber: 3, lapTimeSec: 82, isValid: true },
        ]}
        excludedLaps={new Set()}
        onToggleLapExclusion={vi.fn()}
        formatLapTime={sec => (typeof sec === 'number' ? `${sec.toFixed(3)}s` : '--')}
        currentLapNumber={1}
        onSelectBaselineLap={onSelectBaselineLap}
      />
    );

    fireEvent.click(screen.getByText('Time'));

    const chartBar = screen.getByRole('button', { name: 'Double-click to compare against lap 1' });
    expect(chartBar).toBeInTheDocument();
    fireEvent.doubleClick(chartBar);

    expect(onSelectBaselineLap).toHaveBeenCalledWith(1);
  });

  it('allows swapping primary and baseline lap using the Swap button', async () => {
    const mockTrajWith2Laps = {
      ...mockTraj,
      currentLap: 1,
      laps: [
        { lapNumber: 1, lapTimeSec: 135.5, s1Sec: 40.0, s2Sec: 50.0, s3Sec: 45.5, isBest: false },
        { lapNumber: 2, lapTimeSec: 134.0, s1Sec: 39.5, s2Sec: 49.5, s3Sec: 45.0, isBest: true },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/trajectory')) {
        const lapMatch = url.match(/lap=(\d+)/);
        const requestedLap = lapMatch ? parseInt(lapMatch[1], 10) : 1;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTrajWith2Laps,
            currentLap: requestedLap,
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        replayName="Test_Replay.vcr"
        initialCompareMode={true}
        initialBaselineLapNumber={2}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Swap comparison laps/i })).toBeInTheDocument();
    });

    // Click Swap
    const swapBtn = screen.getByRole('button', { name: /Swap comparison laps/i });
    fireEvent.click(swapBtn);

    // After swap, baseline loading should request the other lap.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('lap=1'));
    });
  });

  it('does not deselect baseline when changing the primary lap', async () => {
    const mockTrajWith3Laps = {
      ...mockTraj,
      currentLap: 1,
      laps: [
        { lapNumber: 1, lapTimeSec: 135.5, s1Sec: 40.0, s2Sec: 50.0, s3Sec: 45.5, isBest: false },
        { lapNumber: 2, lapTimeSec: 134.0, s1Sec: 39.5, s2Sec: 49.5, s3Sec: 45.0, isBest: true },
        { lapNumber: 3, lapTimeSec: 136.0, s1Sec: 40.5, s2Sec: 50.5, s3Sec: 45.0, isBest: false },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/trajectory')) {
        const lapMatch = url.match(/lap=(\d+)/);
        const requestedLap = lapMatch ? parseInt(lapMatch[1], 10) : 1;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTrajWith3Laps,
            currentLap: requestedLap,
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        replayName="Test_Replay.vcr"
        initialCompareMode={true}
        initialBaselineLapNumber={2}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Remove comparison lap/i })).toBeInTheDocument();
    });

    // Change primary lap to Lap 3
    const primarySelect = screen.getByLabelText(/Select Lap/i) as HTMLSelectElement;
    fireEvent.change(primarySelect, { target: { value: '3' } });

    // Baseline should still request Lap 2 and compare mode must remain active.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('lap=2'));
    });
  });

  it('displays distinct baseline replay laps instead of current session laps when another replay is selected', async () => {
    const otherMeta = {
      ...mockMeta,
      filename: 'Other_Spa_Replay.vcr',
      laps: [
        { lapNumber: 8, lapTimeSec: 133.2, s1Sec: 39.0, s2Sec: 49.0, s3Sec: 45.2, isBest: true },
        { lapNumber: 9, lapTimeSec: 134.1, s1Sec: 39.2, s2Sec: 49.4, s3Sec: 45.5, isBest: false },
      ],
    };

    const otherTraj = {
      replayName: 'Other_Spa_Replay.vcr',
      driverSlot: 1,
      currentLap: 8,
      pointsCount: 2,
      bounds: { minX: 100, maxX: 200, minZ: 200, maxZ: 240, spanX: 100, spanZ: 40 },
      points: [
        { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      ],
      laps: otherMeta.laps,
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('Other_Spa_Replay.vcr') && url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(otherMeta) });
      }
      if (url.includes('Other_Spa_Replay.vcr') && url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(otherTraj) });
      }
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/replays') && !url.includes('/trajectory') && !url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { name: 'Other_Spa_Replay.vcr', trackName: 'Spa-Francorchamps', eventTitle: 'LMGT3 Fixed' },
          ]),
        });
      }
      if (url.includes('compare/laps')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            laps: otherMeta.laps.map((lap: { lapNumber: number; lapTimeSec: number; isBest: boolean }) => ({
              id: `other_${lap.lapNumber}`,
              sessionId: 'other-session',
              sessionName: 'Q1',
              sessionType: 'Qualifying',
              dateString: '2026/06/01 12:00',
              driverName: 'Rival Racer',
              carType: 'BMW M4 GT3',
              carClass: 'LMGT3',
              lapNum: lap.lapNumber,
              lapTime: lap.lapTimeSec,
              lapTimeString: `2:${lap.lapTimeSec.toFixed(3)}`,
              isBest: lap.isBest,
              isValid: true,
              matchingReplayFile: 'Other_Spa_Replay.vcr',
            })),
          }),
        });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTraj,
            currentLap: 1,
            laps: [{ lapNumber: 1, lapTimeSec: 135.5, isBest: true }],
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        replayName="Test_Replay.vcr"
        initialCompareMode={true}
      />
    );

    fireEvent.click(screen.getByTitle('Click to change the comparison lap'));

    await waitFor(() => {
      expect(screen.getByText(/Available laps with replay telemetry/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Player' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Drivers' })).toBeInTheDocument();
  });

  it('queries compare laps using the resolved track layout rather than raw mod venue ID', async () => {
    let capturedCompareUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockMeta,
            trackName: 'BahrainWEC_2023',
            displayTrack: 'Bahrain International Circuit (Outer Circuit)',
            trackCourse: 'Bahrain Outer Circuit',
          }),
        });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      if (url.includes('compare/laps')) {
        capturedCompareUrl = url;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ laps: [] }),
        });
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`));
    });

    render(
      <ReplayInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        replayName="Bahrain Outer Circuit R1 11.vcr"
        initialCompareMode={true}
      />
    );

    await waitFor(() => {
      expect(capturedCompareUrl).toMatch(/track=Bahrain\+(Outer|International\+Circuit\+%28Outer)/);
    });

    expect(capturedCompareUrl).not.toContain('track=BahrainWEC_2023');
  });

  it('stores and clears the selected comparison session, driver, and lap in the URL', async () => {
    window.location.hash = '#/compare';
    const comparisonLap = {
      id: 'comparison-lap',
      sessionId: 'comparison-session',
      sessionName: 'Q1',
      sessionType: 'Qualifying',
      dateString: '2026/06/01 12:00',
      driverName: 'Rival Racer',
      carType: 'BMW M4 GT3',
      carClass: 'LMGT3',
      lapNum: 8,
      lapTime: 133.2,
      lapTimeString: '2:13.200',
      isValid: true,
      matchingReplayFile: 'Other_Spa_Replay.vcr',
    };
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('compare/laps')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ laps: [comparisonLap] }) });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} replayName="Test_Replay.vcr" />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compare/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Compare/i }));
    await waitFor(() => {
      expect(screen.getByText('Rival Racer')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Rival Racer'));

    await waitFor(() => {
      const params = new URLSearchParams(window.location.hash.split('?')[1]);
      expect(params.get('compareSessionId')).toBe('comparison-session');
      expect(params.get('compareDriver')).toBe('Rival Racer');
      expect(params.get('compareLapNum')).toBe('8');
    });

    fireEvent.click(screen.getByRole('button', { name: /Remove comparison lap/i }));
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    expect(params.has('compareSessionId')).toBe(false);
    expect(params.has('compareDriver')).toBe(false);
    expect(params.has('compareLapNum')).toBe(false);
  });
});

