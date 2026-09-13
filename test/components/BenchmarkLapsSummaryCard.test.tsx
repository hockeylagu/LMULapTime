import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BenchmarkLapsSummaryCard, BestRefLapInfo } from '../../src/components/dashboard/BenchmarkLapsSummaryCard';

describe('BenchmarkLapsSummaryCard', () => {
  const mockRefLaps: BestRefLapInfo[] = [
    {
      sessionId: 's-1',
      percentage: 100.5,
      category: 'Alien',
      lapTimeString: '1:30.500',
      track: 'Spa Francorchamps',
      car: 'Porsche 963',
    },
    {
      sessionId: 's-2',
      percentage: 101.8,
      category: 'Competitive',
      lapTimeString: '1:31.700',
      track: 'Monza',
      car: 'Ferrari 499P',
    },
    {
      sessionId: 's-3',
      percentage: 103.2,
      category: 'Good',
      lapTimeString: '1:33.000',
      track: 'Le Mans',
      car: 'Toyota GR010',
    },
  ];

  it('renders benchmark percentages with category-specific colors', () => {
    render(
      <BenchmarkLapsSummaryCard
        rankedRefLaps={mockRefLaps}
        visibleRefLaps={mockRefLaps}
        showMoreBenchmarks={false}
        setShowMoreBenchmarks={vi.fn()}
        onSelectSession={vi.fn()}
      />
    );

    const alienPercent = screen.getByText('100.5%');
    const competitivePercent = screen.getByText('101.8%');
    const goodPercent = screen.getByText('103.2%');

    // Alien should be purple
    expect(alienPercent.className).toContain('text-purple-400');
    // Competitive should be amber/yellow
    expect(competitivePercent.className).toContain('text-amber-400');
    // Good should be emerald/green
    expect(goodPercent.className).toContain('text-emerald-400');
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
