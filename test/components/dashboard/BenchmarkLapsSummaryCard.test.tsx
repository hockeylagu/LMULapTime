import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BenchmarkLapsSummaryCard, BestRefLapInfo } from '../../../src/components/dashboard/BenchmarkLapsSummaryCard.js';

describe('BenchmarkLapsSummaryCard', () => {
  const mockRefLaps: BestRefLapInfo[] = [
    {
      sessionId: 's-1',
      percentage: 100.5,
      category: 'Alien',
      track: 'Spa Francorchamps',
      car: 'Porsche 963',
      lapTime: 90.5,
    },
    {
      sessionId: 's-2',
      percentage: 101.8,
      category: 'Competitive',
      track: 'Monza',
      car: 'Ferrari 499P',
      lapTime: 91.7,
    },
    {
      sessionId: 's-3',
      percentage: 103.2,
      category: 'Good',
      track: 'Le Mans',
      car: 'Toyota GR010',
      lapTime: 93,
    },
  ];

  it('leads with the best pace and keeps each category as a colored mark', () => {
    render(
      <BenchmarkLapsSummaryCard
        rankedRefLaps={mockRefLaps}
        visibleRefLaps={mockRefLaps}
        showMoreBenchmarks={false}
        setShowMoreBenchmarks={vi.fn()}
        onSelectSession={vi.fn()}
      />
    );

    // The best percentage carries the pace color; its category label stays neutral.
    expect(screen.getByText('100.5%')).toHaveClass('text-lmu-purple');
    expect(screen.getByText('Alien')).toHaveClass('text-lmu-text-soft');
    expect(screen.getByText('Porsche 963 · 1:30.500')).toBeInTheDocument();
    // The runners-up keep their category as a colored dot
    expect(screen.getByTitle('Competitive').className).toContain('text-lmu-warn');
    expect(screen.getByTitle('Good').className).toContain('text-lmu-gain');
  });

  it('invokes onSelectSession when clicking a benchmark entry', () => {
    const onSelectSession = vi.fn();
    render(
      <BenchmarkLapsSummaryCard
        rankedRefLaps={mockRefLaps}
        visibleRefLaps={mockRefLaps}
        showMoreBenchmarks={false}
        setShowMoreBenchmarks={vi.fn()}
        onSelectSession={onSelectSession}
      />
    );

    fireEvent.click(screen.getByText('Spa Francorchamps'));
    expect(onSelectSession).toHaveBeenCalledWith('s-1');
  });
});
