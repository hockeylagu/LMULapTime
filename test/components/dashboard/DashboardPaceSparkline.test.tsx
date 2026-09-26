import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPaceSparkline } from '../../../src/components/dashboard/DashboardPaceSparkline.js';
import type { RecentPacePoint } from '../../../src/components/dashboard/useDashboardTrends.js';

describe('DashboardPaceSparkline component', () => {
  it('renders fallback message when fewer than 2 pace points exist', () => {
    const { container } = render(
      <DashboardPaceSparkline points={[]} paceDelta={null} paceTrendDirection="none" />
    );
    expect(container).toHaveTextContent(/Complete more timed sessions to track pace progression/i);

    const singlePoint: RecentPacePoint[] = [
      {
        id: 'sess-1',
        trackName: 'Spa',
        carName: 'BMW M4',
        timeString: '2026/09/20 14:00',
        bestLapTimeString: '2:18.500',
        pacePercentage: 103.5,
      },
    ];
    const { container: containerSingle } = render(
      <DashboardPaceSparkline points={singlePoint} paceDelta={null} paceTrendDirection="none" />
    );
    expect(containerSingle).toHaveTextContent(/Complete more timed sessions to track pace progression/i);
  });

  it('renders pace trajectory and data points with aspect-square circular markers', () => {
    const points: RecentPacePoint[] = [
      {
        id: 'sess-1',
        trackName: 'Spa',
        carName: 'BMW M4',
        timeString: '2026/09/20 14:00',
        bestLapTimeString: '2:18.500',
        pacePercentage: 103.5,
      },
      {
        id: 'sess-2',
        trackName: 'Monza',
        carName: 'BMW M4',
        timeString: '2026/09/22 14:00',
        bestLapTimeString: '1:48.200',
        pacePercentage: 102.8,
      },
      {
        id: 'sess-3',
        trackName: 'Le Mans',
        carName: 'Corvette Z06',
        timeString: '2026/09/23 22:30',
        bestLapTimeString: '4:00.470',
        pacePercentage: 102.4,
      },
    ];

    const { container } = render(
      <DashboardPaceSparkline
        points={points}
        paceDelta={1.1}
        paceTrendDirection="improving"
      />
    );

    // Title and badge
    expect(screen.getByText('Pace Trajectory')).toBeInTheDocument();
    expect(screen.getByText('+1.1% Gain ↗')).toBeInTheDocument();

    // Range axis labels
    expect(screen.getByText('103.5% (Past)')).toBeInTheDocument();
    expect(screen.getByText('102.4% (Latest)')).toBeInTheDocument();

    // SVG path exists
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.querySelector('path[d]')).toBeInTheDocument();

    // Markers must use aspect-square rounded-full to ensure they are never squished ovals
    const dots = container.querySelectorAll('.aspect-square.rounded-full');
    expect(dots).toHaveLength(3);

    // The latest dot should have the highlighted size and border styling
    const latestDot = dots[2];
    expect(latestDot).toHaveClass('w-2.5');
    expect(latestDot).toHaveClass('h-2.5');
    expect(latestDot).toHaveAttribute('title', 'Le Mans · 4:00.470 (102.4%)');
  });

  it('renders declining and steady badges correctly based on trend direction', () => {
    const points: RecentPacePoint[] = [
      { id: '1', trackName: 'Spa', carName: 'BMW', timeString: '2026/09/20', bestLapTimeString: '2:00', pacePercentage: 102.0 },
      { id: '2', trackName: 'Spa', carName: 'BMW', timeString: '2026/09/21', bestLapTimeString: '2:02', pacePercentage: 103.5 },
    ];

    const { rerender } = render(
      <DashboardPaceSparkline points={points} paceDelta={-1.5} paceTrendDirection="declining" />
    );
    expect(screen.getByText('-1.5% Delta ↘')).toBeInTheDocument();

    rerender(
      <DashboardPaceSparkline points={points} paceDelta={0.05} paceTrendDirection="steady" />
    );
    expect(screen.getByText('Steady Pace →')).toBeInTheDocument();
  });
});
