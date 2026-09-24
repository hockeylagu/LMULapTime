import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CircuitsSummaryCard } from '../../src/components/dashboard/CircuitsSummaryCard.js';

describe('CircuitsSummaryCard', () => {
  const rankedTracks = [
    { track: 'Fuji Speedway', laps: 609, km: 2653.2 },
    { track: 'Circuit de Spa-Francorchamps', laps: 596, km: 4143.1 },
    { track: 'Algarve International Circuit', laps: 371, km: 1699.2 },
  ];

  beforeEach(() => {
    window.location.hash = '#/dashboard';
  });

  it('defaults to showing lap counts', () => {
    render(
      <CircuitsSummaryCard
        rankedTracks={rankedTracks}
        visibleTracks={rankedTracks}
        showMoreTracks={false}
        setShowMoreTracks={vi.fn()}
      />
    );

    expect(screen.getByText('609 laps')).toBeInTheDocument();
    expect(screen.queryByText('2653 km')).not.toBeInTheDocument();
  });

  it('switches to distance when the Km toggle is clicked', () => {
    render(
      <CircuitsSummaryCard
        rankedTracks={rankedTracks}
        visibleTracks={rankedTracks}
        showMoreTracks={false}
        setShowMoreTracks={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Km' }));

    expect(screen.getByText('2653 km')).toBeInTheDocument();
    expect(screen.queryByText('609 laps')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Laps' }));
    expect(screen.getByText('609 laps')).toBeInTheDocument();
  });

  it('navigates to the track detail page carrying the selected car class', () => {
    render(
      <CircuitsSummaryCard
        rankedTracks={rankedTracks}
        visibleTracks={rankedTracks}
        showMoreTracks={false}
        setShowMoreTracks={vi.fn()}
        selectedCarClass="LMH"
      />
    );

    fireEvent.click(screen.getByText('Fuji Speedway'));

    expect(window.location.hash).toBe('#/track/Fuji%20Speedway?carClass=LMH');
  });

  it('navigates without a carClass param when no filter is selected', () => {
    render(
      <CircuitsSummaryCard
        rankedTracks={rankedTracks}
        visibleTracks={rankedTracks}
        showMoreTracks={false}
        setShowMoreTracks={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Fuji Speedway'));

    expect(window.location.hash).toBe('#/track/Fuji%20Speedway');
  });

  it('reorders rows by distance when the Km toggle is active', () => {
    render(
      <CircuitsSummaryCard
        rankedTracks={rankedTracks}
        visibleTracks={rankedTracks}
        showMoreTracks={false}
        setShowMoreTracks={vi.fn()}
      />
    );

    // Laps order: Fuji Speedway (609) > Circuit de Spa-Francorchamps (596) > Algarve (371)
    let rowNames = screen.getAllByTitle(/View .* Track Details/).map((el) => el.textContent);
    expect(rowNames[0]).toContain('Fuji Speedway');

    fireEvent.click(screen.getByRole('button', { name: 'Km' }));

    // Km order: Circuit de Spa-Francorchamps (4143.1) > Fuji Speedway (2653.2) > Algarve (1699.2)
    rowNames = screen.getAllByTitle(/View .* Track Details/).map((el) => el.textContent);
    expect(rowNames[0]).toContain('Circuit de Spa-Francorchamps');
  });

  it('re-ranks full track dataset by km when switching from laps to km so true top distance tracks appear', () => {
    const multiTracks = [
      { track: 'Brands Hatch', laps: 100, km: 390.0 },
      { track: 'Monza', laps: 90, km: 520.0 },
      { track: 'Fuji', laps: 80, km: 360.0 },
      { track: 'Circuit de la Sarthe', laps: 70, km: 953.8 },
    ];

    render(
      <CircuitsSummaryCard
        rankedTracks={multiTracks}
        visibleTracks={multiTracks.slice(0, 3)}
        showMoreTracks={false}
        setShowMoreTracks={vi.fn()}
      />
    );

    let rowNames = screen.getAllByTitle(/View .* Track Details/).map((el) => el.textContent);
    expect(rowNames[0]).toContain('Brands Hatch');
    expect(screen.queryByText('Circuit de la Sarthe')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Km' }));

    rowNames = screen.getAllByTitle(/View .* Track Details/).map((el) => el.textContent);
    expect(rowNames[0]).toContain('Circuit de la Sarthe');
    expect(screen.getByText('954 km')).toBeInTheDocument();
  });
});


