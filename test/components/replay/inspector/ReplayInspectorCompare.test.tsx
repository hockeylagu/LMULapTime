import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReplayInspectorModal } from '../../../../src/components/replay/inspector/ReplayInspectorContent.js';

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Cell: (props: Record<string, unknown> & { children?: ReactNode }) => <button type="button" {...props}>{props.children}</button>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('ReplayInspectorModal - Comparison & Source Modes', () => {
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
      if (url.includes('/telemetry?')) {
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
        sessionId="session-1"
        initialCompareMode={true}
        initialBaselineLapOrdinal={2}
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
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('lapOrdinal=2'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
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
      sessionId: 'Other_Spa_Replay.vcr',
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
      if (url.includes('Other_Spa_Replay.vcr') && url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(otherTraj) });
      }
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMeta) });
      }
      if (url.includes('/replays') && !url.includes('/telemetry?') && !url.includes('/metadata')) {
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
              timeString: '2026/06/01 12:00',
              driverName: 'Rival Racer',
              carType: 'BMW M4 GT3',
              carClass: 'GT3',
              lapNumber: lap.lapNumber,
              lapTime: lap.lapTimeSec,
              isBest: lap.isBest,
              isValid: true,
              matchingReplayFile: 'Other_Spa_Replay.vcr',
            })),
          }),
        });
      }
      if (url.includes('/telemetry?')) {
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
        sessionId="session-1"
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
      if (url.includes('/telemetry?')) {
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
        sessionId="Bahrain Outer Circuit R1 11.vcr"
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
      driverOrdinal: 1,
      lapOrdinal: 7,
      sessionName: 'Q1',
      sessionType: 'Qualifying',
      timeString: '2026/06/01 12:00',
      driverName: 'Rival Racer',
      carType: 'BMW M4 GT3',
      carClass: 'GT3',
      lapNumber: 8,
      lapTime: 133.2,
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
      if (url.includes('/telemetry?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTraj) });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
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
      expect(params.get('baselineSessionId')).toBe('comparison-session');
      expect(params.get('compareDriver')).toBe('Rival Racer');
      expect(params.get('baselineDriverOrdinal')).toBe('1');
      expect(params.get('baselineLapOrdinal')).toBe('7');
    });

    fireEvent.click(screen.getByRole('button', { name: /Remove comparison lap/i }));
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    expect(params.has('baselineSessionId')).toBe(false);
    expect(params.has('compareDriver')).toBe(false);
    expect(params.has('baselineLapOrdinal')).toBe(false);
  });

  it('selects the exact chosen lap number when comparing against another driver whose lap count differs from player', async () => {
    const rivalLap12 = {
      id: 'rival-lap-12',
      sessionId: 'session-1',
      driverOrdinal: 1,
      lapOrdinal: 11,
      sessionName: 'R1',
      sessionType: 'Race',
      timeString: '2026/08/08 20:16:41',
      driverName: 'Pithivier Patate',
      carType: 'Ferrari 296 LMGT3 Evo',
      carClass: 'GT3',
      lapNumber: 12,
      lapTime: 72.484,
      isValid: true,
      matchingReplayFile: 'Test_Replay.vcr',
    };

    const requestedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      requestedUrls.push(url);
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockMeta,
            laps: [
              { lapNumber: 1, lapTimeSec: 74.5, isBest: false },
              { lapNumber: 11, lapTimeSec: 73.209, isBest: true },
            ],
          }),
        });
      }
      if (url.includes('compare/laps')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ laps: [rivalLap12] }) });
      }
      if (url.includes('/telemetry?')) {
        const lapMatch = url.match(/lapOrdinal=(\d+)/);
        const lapOrdinal = lapMatch ? parseInt(lapMatch[1], 10) : 0;
        const lap = lapOrdinal + 1;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTraj,
            currentLap: lap,
            driverName: url.includes('driverOrdinal=1') ? 'Pithivier Patate' : 'Test Driver',
            laps: [
              { lapNumber: lap, lapTimeSec: lap === 12 ? 72.484 : 73.209, isBest: true },
            ],
          }),
        });
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Compare/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Compare/i }));
    await waitFor(() => {
      expect(screen.getByText('Pithivier Patate')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pithivier Patate'));

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('driverOrdinal=1') && u.includes('lapOrdinal=11'))).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByTitle('Click to change the comparison lap')).toHaveTextContent(/L12/);
      expect(screen.getByTitle('Click to change the comparison lap')).toHaveTextContent(/1:12.484/);
    });
  });

  it('allows switching data source between DuckDB and VCR in the toolbar', async () => {
    const requestedUrls: string[] = [];
    const metaWithDuck = {
      ...mockMeta,
      duckdbFilename: 'Test_Duck.duckdb',
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      requestedUrls.push(url);
      if (url.includes('/metadata')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(metaWithDuck) });
      }
      if (url.includes('/telemetry?')) {
        const isVcr = url.includes('source=vcr');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...mockTraj,
            source: isVcr ? 'vcr' : 'duckdb',
            duckdbFilename: 'Test_Duck.duckdb',
          }),
        });
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`));
    });

    render(
      <ReplayInspectorModal isOpen={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Rate|Hz/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Rate|Hz/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /100Hz DuckDB/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Native VCR/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Native VCR/i }));

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('source=vcr'))).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /Rate|Hz/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /100Hz DuckDB/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /100Hz DuckDB/i }));

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('source=duckdb'))).toBe(true);
    });
  });
});
