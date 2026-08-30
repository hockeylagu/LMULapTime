import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImprovementChart, SessionProgressionPoint } from '../../src/components/ImprovementChart';

describe('ImprovementChart component', () => {
  const mockProgression: SessionProgressionPoint[] = [
    {
      sessionId: 's1',
      timestamp: 1000,
      dateString: '2026/05/28 14:00',
      sessionType: 'Practice',
      sessionName: 'P1',
      trackVenue: 'Spa',
      carType: 'Ferrari 499P',
      carClass: 'LMH',
      driverName: 'Player',
      bestLapTime: 124.0,
      bestS1: 36.0,
      bestS2: 42.0,
      bestS3: 46.0,
      theoreticalBest: 124.0,
      cleanLapsCount: 5,
      totalLapsCount: 5,
      avgLapTime: 125.0,
    },
    {
      sessionId: 's2',
      timestamp: 2000,
      dateString: '2026/05/29 14:00',
      sessionType: 'Qualifying',
      sessionName: 'Q1',
      trackVenue: 'Spa',
      carType: 'Ferrari 499P',
      carClass: 'LMH',
      driverName: 'Player',
      bestLapTime: 122.0,
      bestS1: 35.0,
      bestS2: 41.5,
      bestS3: 45.5,
      theoreticalBest: 122.0,
      cleanLapsCount: 4,
      totalLapsCount: 4,
      avgLapTime: 123.0,
    },
  ];

  it('renders improvement stats banner and metric switcher', () => {
    const setSelectedTrack = vi.fn();
    const setSelectedCarClass = vi.fn();

    render(
      <ImprovementChart
        progression={mockProgression}
        selectedTrack="Spa"
        setSelectedTrack={setSelectedTrack}
        selectedCarClass="LMH"
        setSelectedCarClass={setSelectedCarClass}
        tracks={['Spa', 'Monza']}
        yourBest={{ timeStr: '2:02.000', paceCat: 'Alien', pacePct: 100.1 }}
      />
    );

    expect(screen.getByText('Progression Timeline — Spa')).toBeInTheDocument();
    expect(screen.getByText('Total Sessions Parsed')).toBeInTheDocument();
    expect(screen.getByText('-2.000s')).toBeInTheDocument();

    const sectorsBtn = screen.getByRole('button', { name: /sectors \(s1\/s2\/s3\)/i });
    fireEvent.click(sectorsBtn);
    expect(sectorsBtn).toHaveClass('bg-lmu-accent');
  });

  it('filters by time range when selected', () => {
    const onTimeRangeChange = vi.fn();

    render(
      <ImprovementChart
        progression={mockProgression}
        selectedTrack="Spa"
        setSelectedTrack={vi.fn()}
        selectedCarClass="LMH"
        setSelectedCarClass={vi.fn()}
        tracks={['Spa']}
        onTimeRangeChange={onTimeRangeChange}
      />
    );

    const comboboxes = screen.getAllByRole('combobox');
    const historySelect = comboboxes[comboboxes.length - 1];
    fireEvent.change(historySelect, { target: { value: 'last-5' } });
    expect(onTimeRangeChange).toHaveBeenCalledWith('last-5');
  });
});
