import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReplayInspectorModal } from '../../../../src/components/replay/inspector/ReplayInspectorContent.js';
import { ConsistencyPanel } from '../../../../src/components/replay/analysis/ConsistencyPanel.js';
import { chooseValue, openSelect, selectedValue } from '../../../helpers/selectControl.js';

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
      { slot: 1, name: 'Samuel Lague', carType: 'Ferrari 296 GT3', team: 'Vista AF Corsa', carNumber: '21', isPlayer: true, sessionDriverOrdinal: 0, sessionLapOrdinals: { '1': 0, '2': 1, '3': 2 } },
      { slot: 2, name: 'Rival Racer', carType: 'BMW M4 GT3', team: 'Team WRT', carNumber: '32', isPlayer: false, sessionDriverOrdinal: 1, sessionLapOrdinals: { '1': 0, '2': 1, '3': 2 } },
    ],
  };

  const mockTraj = {
    replayName: 'Test_Replay.vcr',
    sessionId: 'session-1',
    driverOrdinal: 0,
    lapOrdinal: 0,
    driverSlot: 1,
    pointsCount: 3,
    stationSource: 'track',
    geometryRevision: 'synthetic-canonical-track-v1',
    bounds: { minX: 100, maxX: 200, minZ: 200, maxZ: 240, spanX: 100, spanZ: 40 },
    points: [
      { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, timeSec: 0.0 },
      { x: 150, y: 11, z: 220, rotY: 0.5, speedKmh: 180, throttle: 100, brake: 0, timeSec: 0.5 },
      { x: 200, y: 12, z: 240, rotY: 1.0, speedKmh: 90, throttle: 0, brake: 70, timeSec: 1.0 },
    ],
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReplayInspectorModal isOpen={false} onClose={vi.fn()} sessionId="session-1" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('plays with Space from the chart, pauses on manual seek and leaves native controls alone', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => Promise.resolve({ ok: true,
      json: () => Promise.resolve(url.includes('/metadata') ? mockMeta : url.includes('/telemetry?') ? mockTraj : { laps: [] }),
    }));
    render(<ReplayInspectorModal isOpen onClose={vi.fn()} sessionId="session-1" />);
    const chart = await screen.findByLabelText('Telemetry charts');
    fireEvent.keyDown(chart, { key: ' ' });
    expect(screen.getByLabelText('Pause')).toHaveRole('button');
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(screen.getByLabelText('Play')).toHaveRole('button');
    fireEvent.keyDown(screen.getByLabelText('Select Driver'), { key: ' ' });
    expect(screen.getByLabelText('Play')).toHaveRole('button');
  });

  it('fetches and displays metadata and telemetry when open', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
      expect(screen.getByText(/Split 3/i)).toBeInTheDocument();
      expect(screen.getByText(/Spa-Francorchamps/i)).toBeInTheDocument();
    });

    const driverSelect = screen.getByLabelText(/Select Driver/i);
    expect(selectedValue(driverSelect)).toBe('1');
    openSelect(driverSelect);
    expect(screen.getByRole('option', { name: /Samuel Lague.*You/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Rival Racer/i })).toBeInTheDocument();
    fireEvent.keyDown(driverSelect, { key: 'Escape' });
    expect(screen.queryByText('Test_Replay.vcr')).not.toBeInTheDocument();
    const duration = screen.getByText('8m 20s');
    expect(duration).not.toBeVisible();
    const info = screen.getByText('Info').closest('summary');
    expect(info).not.toBeNull();
    fireEvent.click(info!);
    expect(duration).toBeVisible();
    expect(screen.getByText('8m 20s')).toBeVisible();
    fireEvent.keyDown(info!, { key: 'Escape' });
    expect(duration).not.toBeVisible();
    expect(info).toHaveFocus();
    const playbackSpeed = screen.getByRole('combobox', { name: 'Playback speed' });
    chooseValue(playbackSpeed, '2');
    expect(selectedValue(playbackSpeed)).toBe('2');
  });

  it('shows the Corners tab for self-analysis even without a baseline lap loaded', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
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
      if (url.includes('driverOrdinal=1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTraj,
            driverSlot: 2,
            points: [{ x: 50, y: 5, z: 100, rotY: 0, speedKmh: 210, throttle: 95, brake: 0, timeSec: 0.0 }],
          }),
        });
      }
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
    });

    chooseValue(screen.getByLabelText(/Select Driver/i), '2');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('driverOrdinal=1'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });
  });

  it('returns through the single Back control', async () => {
    const handleClose = vi.fn();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={handleClose} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('selects the current driver in the header dropdown and reloads telemetry', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('driverOrdinal=1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTraj,
            driverSlot: 2,
            points: [{ x: 50, y: 5, z: 100, rotY: 0, speedKmh: 210, throttle: 95, brake: 0, timeSec: 0.0 }],
          }),
        });
      }
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
    });

    const driverSelect = screen.getByLabelText(/Select Driver/i);
    expect(selectedValue(driverSelect)).toBe('1');
    chooseValue(driverSelect, '2');

    // Verify it called trajectory fetch with driverOrdinal=1
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('driverOrdinal=1'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });
  });

  it('toggles compare mode and allows comparing with a baseline lap', async () => {
    const mockTrajWithLaps = {
      ...mockTraj,
      currentLap: 1,
      laps: [
        { lapNumber: 1, lapTimeSec: 100.5, isBest: false, isOutLap: false, s1Sec: 30.2, s2Sec: 40.1, s3Sec: 30.2 },
        { lapNumber: 2, lapTimeSec: 99.8, isBest: true, isOutLap: false, s1Sec: 30.0, s2Sec: 39.8, s3Sec: 30.0 },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/replays') && !url.includes('/telemetry?') && !url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([
          { name: 'Other_Spa_Replay.vcr', trackName: 'Spa-Francorchamps', eventTitle: 'LMGT3 Fixed' }
        ]) });
      }
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTrajWithLaps) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
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
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/compare/laps'), expect.anything());
  });

  it('renders playback speed options 0.5x, 1x, and 2x while omitting 5x', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
    );

    const speedSelect = await screen.findByRole('combobox', { name: 'Playback speed' });
    openSelect(speedSelect);
    expect(screen.getByRole('option', { name: '0.5×' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1×' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2×' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '5×' })).not.toBeInTheDocument();
    expect(selectedValue(speedSelect)).toBe('1');
    chooseValue(speedSelect, '0.5');
    expect(selectedValue(speedSelect)).toBe('0.5');

    // Flush any trailing async state updates (e.g. corner consistency data) that
    // resolve after this test's own assertions so they settle inside act().
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  it('shows session-best time in blue without a fastest-lap badge', async () => {
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
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(trajWithBestLap) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Session best · Replay GPS lap time')).toHaveClass('text-lmu-session-best');
    });

    expect(screen.queryByText(/Fastest Lap/i)).not.toBeInTheDocument();
  });

  it.each([
    ['matching session locator', 'session-1', 0, true, 'Personal best · Replay GPS lap time', 'text-lmu-personal-best'],
    ['different session', 'other-session', 0, true, 'Session best · Replay GPS lap time', 'text-lmu-session-best'],
    ['different lap locator', 'session-1', 1, false, 'Replay GPS lap time', 'text-white'],
  ])('colors the lap time for %s', async (_label, sessionId, lapOrdinal, isBest, title, color) => {
    const traj = { ...mockTraj, layoutKey: 'spa_gp', currentLap: 1,
      laps: [{ lapNumber: 1, lapTimeSec: 135.5, s1Sec: 40, s2Sec: 50, s3Sec: 45.5, isBest }],
    };
    const requests: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      requests.push(url);
      const data = url.includes('/metadata') ? mockMeta
        : url.includes('/telemetry?') ? traj
        : url.includes('/leaderboard') ? { entries: [{ isPlayer: true, bestLap: { sessionId, driverOrdinal: 0, lapOrdinal } }] } : null;
      return data ? Promise.resolve({ ok: true, json: () => Promise.resolve(data) }) : Promise.reject(new Error('Unknown URL'));
    });
    render(<ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />);
    await waitFor(() => {
      expect(requests.some(url => url.includes('/leaderboard') && url.includes('layout=spa_gp') && url.includes('carClass=GT3'))).toBe(true);
      expect(screen.getByTitle(title)).toHaveClass(color);
    });
    expect(screen.queryByText(/Fastest Lap/i)).not.toBeInTheDocument();
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
        formatLapTime={(sec?: number | null) => (typeof sec === 'number' ? `${sec.toFixed(3)}s` : '--')}
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
      if (url.includes('/telemetry?')) {
        const lapMatch = url.match(/lapOrdinal=(\d+)/);
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
        sessionId="session-1"
        initialCompareMode={true}
        initialBaselineLapOrdinal={2}
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
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('lapOrdinal=0'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });
  });
});
