import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImprovementChart } from '../../src/components/ImprovementChart';

describe('ImprovementChart component', () => {
  const mockProgressionData = [
    {
      sessionId: 'sess1',
      timestamp: Date.now() - 100000,
      dateString: '2026/05/28 14:00',
      sessionType: 'Practice',
      sessionName: 'P1',
      trackVenue: 'Spa',
      displayTrack: 'Spa',
      carType: 'Ferrari 499P',
      carClass: 'LMH',
      driverName: 'Player',
      bestLapTime: 122.0,
      bestS1: 34.0,
      bestS2: 42.0,
      bestS3: 46.0,
      theoreticalBest: 122.0,
      cleanLapsCount: 5,
      totalLapsCount: 5,
      avgLapTime: 123.0,
    },
    {
      sessionId: 'sess2',
      timestamp: Date.now(),
      dateString: '2026/05/29 16:00',
      sessionType: 'Practice',
      sessionName: 'P2',
      trackVenue: 'Spa',
      displayTrack: 'Spa',
      carType: 'Ferrari 499P',
      carClass: 'LMH',
      driverName: 'Player',
      bestLapTime: 121.0,
      bestS1: 33.5,
      bestS2: 42.0,
      bestS3: 45.5,
      theoreticalBest: 121.0,
      cleanLapsCount: 8,
      totalLapsCount: 8,
      avgLapTime: 122.5,
    },
  ];

  it('renders improvement stats banner and metric switcher', () => {
    const setSelectedTrack = vi.fn();
    const setSelectedCarClass = vi.fn();

    render(
      <ImprovementChart
        progression={mockProgressionData}
        tracks={['Spa']}
        selectedTrack="Spa"
        setSelectedTrack={setSelectedTrack}
        selectedCarClass="LMH"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    expect(screen.getByText('Lap & Sector Improvement Over Time')).toBeInTheDocument();
    expect(screen.getByText('Total Sessions Parsed')).toBeInTheDocument();
    expect(screen.getByText(/Your Best/i)).toBeInTheDocument();
    expect(screen.getByText('Top 3 Lap True Pace')).toBeInTheDocument();

    // Switch metrics
    const theoreticalBtn = screen.getByRole('button', { name: /theoretical/i });
    fireEvent.click(theoreticalBtn);

    const sectorsBtn = screen.getByRole('button', { name: /sectors \(s1\/s2\/s3\)/i });
    fireEvent.click(sectorsBtn);

    const consistencyBtn = screen.getByRole('button', { name: /consistency rating/i });
    fireEvent.click(consistencyBtn);

    const lapPaceBtn = screen.getByRole('button', { name: /lap pace/i });
    fireEvent.click(lapPaceBtn);
  });

  it('filters by time range when selected', () => {
    render(
      <ImprovementChart
        progression={mockProgressionData}
        tracks={['Spa']}
        selectedTrack="Spa"
        setSelectedTrack={vi.fn()}
        selectedCarClass="LMH"
        setSelectedCarClass={vi.fn()}
      />
    );

    const comboboxes = screen.getAllByRole('combobox');
    const historySelect = comboboxes[comboboxes.length - 1];
    fireEvent.change(historySelect, { target: { value: 'last-5' } });
    fireEvent.change(historySelect, { target: { value: 'week' } });
    fireEvent.change(historySelect, { target: { value: 'month' } });
    fireEvent.change(historySelect, { target: { value: 'year' } });
  });

  it('renders correctly in embedded mode with empty data fallback', () => {
    render(
      <ImprovementChart
        progression={[]}
        tracks={['Spa']}
        selectedTrack="Spa"
        setSelectedTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
        embedded={true}
      />
    );

    expect(screen.getByText(/No session data found for this track/i)).toBeInTheDocument();
  });

  it('orders out-of-sequence progression points chronologically', () => {
    const reversedData = [...mockProgressionData].reverse();
    render(
      <ImprovementChart
        progression={reversedData}
        tracks={['Spa']}
        selectedTrack="Spa"
        setSelectedTrack={vi.fn()}
        selectedCarClass="LMH"
        setSelectedCarClass={vi.fn()}
      />
    );

    // Verify first session is P1 and delta/improvement is computed from older to newer (122.0 - 121.0 = -1.000s)
    expect(screen.getByText('-1.000s')).toBeInTheDocument();
  });

  it('handles multiple sessions on the same date with identical session names properly', () => {
    const sameDateSessions = [
      {
        ...mockProgressionData[0],
        sessionId: 'sess-r1-a',
        sessionName: 'R1',
        sessionType: 'Race',
        dateString: '2026/09/02 12:00:00',
        bestLapTime: 106.446,
      },
      {
        ...mockProgressionData[1],
        sessionId: 'sess-r1-b',
        sessionName: 'R1',
        sessionType: 'Race',
        dateString: '2026/09/02 13:33:01',
        bestLapTime: 105.123,
      },
    ];

    render(
      <ImprovementChart
        progression={sameDateSessions}
        tracks={['Spa']}
        selectedTrack="Spa"
        setSelectedTrack={vi.fn()}
        selectedCarClass="LMH"
        setSelectedCarClass={vi.fn()}
      />
    );

    expect(screen.getByText(/Progression Timeline/i)).toBeInTheDocument();
    expect(screen.getByText('1:45.123')).toBeInTheDocument();
  });
});
