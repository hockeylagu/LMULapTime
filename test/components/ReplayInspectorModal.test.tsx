import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReplayInspectorModal } from '../../src/components/replay/ReplayInspectorModal';

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

    // Switch to driver roster tab
    const rosterTab = screen.getByRole('button', { name: /Driver Roster/i });
    fireEvent.click(rosterTab);

    expect(screen.getByText('Samuel Lague')).toBeInTheDocument();
    expect(screen.getByText('Ferrari 296 GT3')).toBeInTheDocument();
    expect(screen.getByText('Vista AF Corsa')).toBeInTheDocument();
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

    // Select driver via Driver Roster tab
    const rosterTab = screen.getByRole('button', { name: /Driver Roster/i });
    fireEvent.click(rosterTab);

    const rivalCell = screen.getByText('Rival Racer');
    fireEvent.click(rivalCell);

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

  it('displays exactly one Current badge matching the selected driver and allows row selection', async () => {
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

    // Go to Driver Roster tab
    const rosterTab = screen.getByRole('button', { name: /Driver Roster/i });
    fireEvent.click(rosterTab);

    // Verify exactly ONE Current badge is rendered initially (for slot 1 - Samuel Lague)
    const currentBadges = screen.getAllByText('Current');
    expect(currentBadges).toHaveLength(1);
    expect(screen.getByText('YOU')).toBeInTheDocument();

    // Click on Rival Racer row to select them
    const rivalCell = screen.getByText('Rival Racer');
    fireEvent.click(rivalCell);

    // Verify it called trajectory fetch with driverSlot=2
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('driverSlot=2'));
    });
  });

  it('filters drivers in roster tab via search input', async () => {
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
    });

    const rosterTab = screen.getByRole('button', { name: /Driver Roster/i });
    fireEvent.click(rosterTab);

    const searchInput = screen.getByPlaceholderText(/Search driver/i);
    fireEvent.change(searchInput, { target: { value: 'Rival' } });

    expect(screen.getByText('Rival Racer')).toBeInTheDocument();
    expect(screen.queryByText('Samuel Lague')).not.toBeInTheDocument();
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

    // Baseline selector should now be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/Select Baseline Lap/i)).toBeInTheDocument();
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
});

