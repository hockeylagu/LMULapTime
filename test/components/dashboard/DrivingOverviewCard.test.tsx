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

    expect(screen.getByText('Avg benchmark pace')).toBeInTheDocument();
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

    expect(screen.getByText('Avg benchmark pace')).toBeInTheDocument();
    const label = screen.getByText('Avg benchmark pace');
    const row = label.parentElement;
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

    expect(screen.queryByText('Avg benchmark pace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show all driving stats/i }));
    expect(setShowMore).toHaveBeenCalledWith(true);
  });

  it('leads with the totals and a distance fun fact', () => {
    render(
      <DrivingOverviewCard
        sessionsCount={929}
        totalLaps={4425}
        totalDistanceKm={25384}
        totalDrivingSeconds={149 * 3600 + 360}
        maxTopSpeed={332}
        maxTopSpeedTrack="Circuit de la Sarthe"
      />
    );

    expect(screen.getByText('4,425')).toBeInTheDocument();
    expect(screen.getByText('25,384')).toBeInTheDocument();
    expect(screen.getByText('149h')).toBeInTheDocument();
    const facts = screen.getByTestId('overview-fun-facts');
    expect(facts).toHaveTextContent('Around the Earth63%');
    expect(facts).toHaveTextContent('Top speed · Circuit de la Sarthe332.0 km/h');
  });
});
