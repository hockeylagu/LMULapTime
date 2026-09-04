import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App';

describe('App component', () => {
  const mockStatus = {
    resultsDir: 'C:\\LMU\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\Replays',
    replaysExist: true,
    playerName: 'Player',
    sessionsCount: 2,
    tracksCount: 1,
    referenceLaptimes: { lastUpdated: '2026-05-28', entriesCount: 10 },
  };

  const mockSessions = [
    {
      id: 'sess1',
      filename: 'sess1.xml',
      trackVenue: 'Spa',
      trackCourse: 'GP',
      timeString: '2026/05/28 14:00',
      sessionType: 'Practice',
      sessionName: 'P1',
      driversCount: 1,
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 499P',
        carClass: 'LMH',
        bestLapTime: 122.0,
        bestLapTimeString: '2:02.000',
        bestS1: 34.0,
        bestS2: 42.0,
        bestS3: 46.0,
        theoreticalBest: 122.0,
        theoreticalBestString: '2:02.000',
        bestLapPaceCategory: 'Alien',
        bestLapPacePercentage: 100.1,
        lapsCount: 5,
        laps: [],
      },
    },
  ];

  const mockTracks = {
    Spa: {
      trackVenue: 'Spa',
      sessionsCount: 1,
      totalLaps: 5,
      bestLapTime: 122.0,
      bestLapDriver: 'Player',
      bestLapCar: 'Ferrari 499P',
      bestS1: 34.0,
      bestS2: 42.0,
      bestS3: 46.0,
      theoreticalBest: 122.0,
      carsUsed: ['Ferrari 499P'],
    },
  };

  beforeEach(() => {
    window.location.hash = '#dashboard';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/status')) {
        return Promise.resolve({ json: () => Promise.resolve(mockStatus) });
      }
      if (url.includes('/api/sessions')) {
        return Promise.resolve({ json: () => Promise.resolve(mockSessions) });
      }
      if (url.includes('/api/progression')) {
        return Promise.resolve({ json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/tracks')) {
        return Promise.resolve({ json: () => Promise.resolve(mockTracks) });
      }
      if (url.includes('/api/track/')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              trackName: 'Spa',
              normalizedTrackName: 'Spa',
              sessionsCount: 1,
              sessions: mockSessions,
              benchmarks: [],
            }),
        });
      }
      if (url.includes('/api/session/')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              ...mockSessions[0],
              filePath: 'C:\\test.xml',
              drivers: [mockSessions[0].playerDriver],
            }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });
  });

  it('renders loading state initially and switches to Dashboard view', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Driving Overview')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: /LMU Lap Time Analyzer/i })).toBeInTheDocument();
    });
  });

  it('navigates to Tracks and Settings via Navbar tabs', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Driving Overview')).toBeInTheDocument();
    });

    const tracksTab = screen.getByRole('button', { name: /tracks/i });
    fireEvent.click(tracksTab);

    await waitFor(() => {
      expect(screen.getByText(/Track Records & Benchmarks/i)).toBeInTheDocument();
    });

    const settingsTab = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsTab);

    await waitFor(() => {
      expect(screen.getByText('Application Settings')).toBeInTheDocument();
    });

    const dashboardTab = screen.getByRole('button', { name: /dashboard/i });
    fireEvent.click(dashboardTab);

    await waitFor(() => {
      expect(screen.getByText('Driving Overview')).toBeInTheDocument();
    });
  });

  it('navigates to session detail when hash is set to session/:id and handles back navigation', async () => {
    window.location.hash = '#session/sess1';
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Back to Sessions/i)).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: /Back to Sessions/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Driving Overview')).toBeInTheDocument();
    });
  });

  it('navigates to track detail when hash is set to track/:trackName', async () => {
    window.location.hash = '#track/Spa';
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Spa' })).toBeInTheDocument();
      expect(screen.getByText(/Back to Tracks/i)).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: /Back to Tracks/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText(/Track Records & Benchmarks/i)).toBeInTheDocument();
    });
  });

  it('handles track and filter interactions on Dashboard view', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Driving Overview')).toBeInTheDocument();
    });

    // Select track filter
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.change(comboboxes[0], { target: { value: 'Spa' } });

    // Select car class filter
    const hypercarBtn = screen.getByRole('button', { name: /Hypercar/i });
    fireEvent.click(hypercarBtn);

    // Search query
    const searchInput = screen.getByPlaceholderText(/search track, car, file/i);
    fireEvent.change(searchInput, { target: { value: 'Ferrari' } });

    // Select session card
    const sessionCard = screen.getByText('2026/05/28 14:00').closest('div.glass-panel');
    if (sessionCard) {
      fireEvent.click(sessionCard);
      await waitFor(() => {
        expect(screen.getByText(/Back to Sessions/i)).toBeInTheDocument();
      });
    }
  });

  it('refreshes telemetry data when clicking Refresh in Navbar', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Driving Overview')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByTitle(/Refresh LMU Directory Scan/i);
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions?refresh=true');
      expect(screen.getByText('Driving Overview')).toBeInTheDocument();
    });
  });
});
