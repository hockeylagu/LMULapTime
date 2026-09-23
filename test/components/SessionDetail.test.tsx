import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionDetail } from '../../src/components/session-detail/index.js';
import { mockDetailedSession } from './mockSessionDetail.js';

describe('SessionDetail component - overview, telemetry & settings', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailedSession),
    });
  });

  it('renders session telemetry, lap table, and driver stats', async () => {
    const onBack = vi.fn();
    render(<SessionDetail sessionId="sess123" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getAllByText('Spa').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Sim Driver/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Lap Timing & Telemetry \(3 Laps\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('2:02.000').length).toBeGreaterThan(0);
      expect(screen.getByText('Top 3 Lap Avg')).toBeInTheDocument();
      expect(screen.getByText('Δ Prev')).toBeInTheDocument();
    });

    // Metric buttons on telemetry chart
    const sectorsBtn = screen.getByRole('button', { name: /sectors \(s1\/s2\/s3\)/i });
    fireEvent.click(sectorsBtn);

    const topSpeedBtn = screen.getAllByRole('button', { name: /^top speed$/i })[0];
    fireEvent.click(topSpeedBtn);

    const lapPaceBtn = screen.getByRole('button', { name: /^lap pace$/i });
    fireEvent.click(lapPaceBtn);

    const backBtn = screen.getByRole('button', { name: /back to sessions/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it('sorts lap timing columns while keeping the direction icon on the active column', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry \(3 Laps\)/i)).toBeInTheDocument();
    });

    const getLapTitles = () => screen
      .getAllByTitle(/Click to open telemetry for Lap/)
      .map((row) => row.getAttribute('title'));
    const lapHeader = screen.getByTitle('Sort by Lap');
    const lapTimeHeader = screen.getByTitle('Sort by Lap Time');

    expect(getLapTitles()).toEqual([
      'Click to open telemetry for Lap 1',
      'Click to open telemetry for Lap 2',
      'Click to open telemetry for Lap 3',
    ]);
    expect(lapHeader.querySelector('svg')).not.toBeNull();
    expect(lapTimeHeader.querySelector('svg')).toBeNull();

    fireEvent.click(lapTimeHeader);

    expect(getLapTitles()).toEqual([
      'Click to open telemetry for Lap 2',
      'Click to open telemetry for Lap 1',
      'Click to open telemetry for Lap 3',
    ]);
    expect(lapHeader.querySelector('svg')).toBeNull();
    expect(lapTimeHeader.querySelector('svg')).not.toBeNull();
  });

  it('allows switching drivers and exporting CSV', async () => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText(/Sim Driver/).length).toBeGreaterThan(0);
    });

    // Switch driver
    const driverSelect = screen.getByRole('combobox');
    fireEvent.change(driverSelect, { target: { value: 'AI Driver 2' } });

    await waitFor(() => {
      expect(screen.getAllByText(/Porsche 963/i).length).toBeGreaterThan(0);
    });

    // Click Export CSV
    const exportBtn = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(exportBtn);
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('copies replay file path when clicking Copy Path', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy Replay/i })).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Copy Replay/i });
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('C:\\LMU\\UserData\\Replays\\spa_replay.vcr');
  });

  it('navigates to track detail when clicking track heading, carrying the session car class', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Spa/i })).toBeInTheDocument();
    });

    const trackHeading = screen.getByRole('heading', { level: 2, name: /Spa/i });
    fireEvent.click(trackHeading);
    expect(window.location.hash).toBe('#/track/Spa?carClass=LMH');
  });

  it('opens the full comparison studio when clicking compare buttons', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry \(3 Laps\)/i)).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /^Compare$/i });
    expect(compareButtons.length).toBeGreaterThan(0);

    // Click compare on first lap
    fireEvent.click(compareButtons[0]);

    // Verify hash changed to full comparison studio with session & lap parameters
    expect(window.location.hash).toContain('compare');
    expect(window.location.hash).toContain('sessionId=sess123');
    expect(window.location.hash).toContain('lapNum=1');

    // Click Compare Laps in the header
    const openStudioBtn = screen.getByRole('button', { name: /Compare Laps/i });
    fireEvent.click(openStudioBtn);
    expect(window.location.hash).toContain('compare');
    expect(window.location.hash).toContain('sessionId=sess123');
  });

  it('switches to Tire Wear chart metric and displays tire wear in table', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry/i)).toBeInTheDocument();
    });

    // Check that Tire Wear column is rendered in the table
    expect(screen.getByRole('columnheader', { name: /Tire Wear/i })).toBeInTheDocument();
    expect(screen.getByText('97.8%')).toBeInTheDocument();
    expect(screen.getByText('94.4%')).toBeInTheDocument();

    // Click Tire Wear metric toggle
    const tireWearToggle = screen.getByRole('button', { name: /Tire Wear/i });
    fireEvent.click(tireWearToggle);

    expect(screen.getByText(/Tire Wear & Degradation Telemetry/i)).toBeInTheDocument();
  });

  it('renders session rules and server configuration button with modal dialog', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Rules & Config:/i)).toBeInTheDocument();
    });

    // Check button highlights (mode and duration) on the button row
    expect(screen.getByText(/Race Weekend/i)).toBeInTheDocument();
    expect(screen.getByText(/60 min/i)).toBeInTheDocument();

    // Click button to open modal dialog with full configuration
    const toggleBtn = screen.getByRole('button', { name: /Rules & Config/i });
    fireEvent.click(toggleBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByText(/Race Weekend/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/50%/i)).toBeInTheDocument();
    expect(screen.getByText(/Warm Tires/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Setup/i)).toBeInTheDocument();
  });

  it('switches to Fuel & Energy chart metric and displays stint strategy banner on top of chart', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /Fuel & VE/i })).toBeInTheDocument();
    });

    // Before clicking Fuel & Energy toggle, the fuel estimate is not rendered
    expect(screen.queryByText(/Avg Fuel Usage/i)).not.toBeInTheDocument();

    // Click Fuel & Energy toggle
    const fuelToggle = screen.getByRole('button', { name: /Fuel & Energy/i });
    fireEvent.click(fuelToggle);

    expect(screen.getByText(/Fuel Consumption & Virtual Energy Telemetry/i)).toBeInTheDocument();

    // Check stint strategy summary on top of the chart
    expect(screen.getByText(/Avg Fuel Usage/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2.5%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/~40/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg Virtual Energy/i)).toBeInTheDocument();
    expect(screen.getAllByText(/3.8%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/~26/i)).toBeInTheDocument();

    // Check Setup Fuel Ratio Optimizer banner
    expect(screen.getByText(/Recommended Setup Fuel Ratio:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0.66/i).length).toBeGreaterThan(0);
  });

  it('renders elapsed session finish times and pit stop duration tooltips in lap table', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry/i)).toBeInTheDocument();
    });

    // Check elapsed finish tooltip on lap cell
    expect(screen.getByTitle('Session Time: 2:03.0')).toBeInTheDocument();

    // Check pit stop badge tooltip
    expect(screen.getByTitle('Estimated pit loss: +13.0s')).toBeInTheDocument();
  });

  it('disables chart buttons and hides table columns when tire wear and fuel data are missing', async () => {
    const driverWithoutData = {
      ...mockDetailedSession.drivers[0],
      avgFuelPerLap: null,
      estFuelStintLaps: null,
      avgVePerLap: null,
      estVeStintLaps: null,
      laps: [
        {
          lapNum: 1,
          position: 1,
          lapTime: 122.0,
          lapTimeString: '2:02.000',
          s1: 34.0,
          s2: 42.0,
          s3: 46.0,
          topSpeed: 322.0,
          fCompound: 'Hard',
          rCompound: 'Hard',
          tireWear: undefined,
          fuel: null,
          fuelUsed: null,
          virtualEnergy: null,
          virtualEnergyUsed: null,
          isPitStop: false,
          isValid: true,
        },
      ],
    };

    const sessionWithoutData = {
      ...mockDetailedSession,
      playerDriver: driverWithoutData,
      drivers: [driverWithoutData],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/sess123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sessionWithoutData),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry/i)).toBeInTheDocument();
    });

    // Stint strategy card should NOT be rendered
    expect(screen.queryByText(/Avg Fuel Usage/i)).not.toBeInTheDocument();

    // Chart buttons for Tire Wear and Fuel should be disabled
    const tireWearBtn = screen.getByRole('button', { name: /Tire Wear/i });
    const fuelBtn = screen.getByRole('button', { name: /^Fuel/i });
    expect(tireWearBtn).toBeDisabled();
    expect(fuelBtn).toBeDisabled();

    // Columns should NOT be rendered in table
    expect(screen.queryByRole('columnheader', { name: /Tire Wear/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Fuel/i })).not.toBeInTheDocument();
  });

  it('switches between Sector Times, Top Speed, and Lap Pace chart views', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/sess123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDetailedSession),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry/i)).toBeInTheDocument();
    });

    // Switch to Sectors
    const sectorsBtn = screen.getByRole('button', { name: /Sectors/i });
    fireEvent.click(sectorsBtn);
    expect(sectorsBtn).toHaveClass('bg-lmu-accent');

    // Switch to Top Speed
    const topSpeedBtn = screen.getAllByRole('button', { name: /^top speed$/i })[0];
    fireEvent.click(topSpeedBtn);
    expect(topSpeedBtn).toHaveClass('bg-lmu-accent');

    // Switch to Positions
    const positionsBtn = screen.getByRole('button', { name: /Positions/i });
    fireEvent.click(positionsBtn);
    expect(positionsBtn).toHaveClass('bg-lmu-accent');
    expect(screen.getByText(/Driver Position Progression/i)).toBeInTheDocument();

    // Switch back to Lap Pace
    const lapPaceBtn = screen.getByRole('button', { name: /Lap Pace/i });
    fireEvent.click(lapPaceBtn);
    expect(lapPaceBtn).toHaveClass('bg-lmu-accent');
  });

});
