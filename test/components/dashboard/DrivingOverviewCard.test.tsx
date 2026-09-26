import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrivingOverviewCard } from '../../../src/components/dashboard/DrivingOverviewCard.js';

describe('DrivingOverviewCard', () => {
  it('shows the average benchmark pace instead of average speed when expanded', () => {
    render(
      <DrivingOverviewCard
        sessionsCount={10}
        totalLaps={100}
        totalDistanceKm={500}
        totalDrivingSeconds={3600}
        averageBenchmarkPacePercentage={102.4}
        averageBenchmarkPaceCategory="Competitive"
        showMore
        setShowMore={vi.fn()}
      />
    );

    expect(screen.getByText('Avg Benchmark Pace')).toBeInTheDocument();
    expect(screen.getByText(/102\.4%/)).toBeInTheDocument();
    expect(screen.queryByText('Average Speed')).not.toBeInTheDocument();
  });

  it('shows N/A when no benchmark pace data is available', () => {
    render(
      <DrivingOverviewCard
        sessionsCount={0}
        totalLaps={0}
        totalDistanceKm={0}
        totalDrivingSeconds={0}
        averageBenchmarkPacePercentage={null}
        averageBenchmarkPaceCategory={null}
        showMore
        setShowMore={vi.fn()}
      />
    );

    expect(screen.getByText('Avg Benchmark Pace')).toBeInTheDocument();
    const label = screen.getByText('Avg Benchmark Pace');
    const row = label.closest('div.group');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('N/A');
  });

  it('hides expanded stats until "Show All Driving Stats" is clicked', () => {
    const setShowMore = vi.fn();
    render(
      <DrivingOverviewCard
        sessionsCount={5}
        totalLaps={50}
        totalDistanceKm={250}
        totalDrivingSeconds={1800}
        averageBenchmarkPacePercentage={101}
        averageBenchmarkPaceCategory="Competitive"
        showMore={false}
        setShowMore={setShowMore}
      />
    );

    expect(screen.queryByText('Avg Benchmark Pace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show all driving stats/i }));
    expect(setShowMore).toHaveBeenCalledWith(true);
  });
});
