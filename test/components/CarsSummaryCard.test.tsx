import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CarsSummaryCard } from '../../src/components/dashboard/CarsSummaryCard.js';

describe('CarsSummaryCard', () => {
  const rankedCars = [
    { car: 'BMW M4 LMGT3', laps: 1600, km: 7328.0 },
    { car: 'McLaren 720S LMGT3 Evo', laps: 737, km: 3140.2 },
    { car: 'Lexus RCF LMGT3', laps: 685, km: 3500.0 },
  ];

  it('defaults to showing lap counts', () => {
    render(
      <CarsSummaryCard
        rankedCars={rankedCars}
        visibleCars={rankedCars}
        showMoreCars={false}
        setShowMoreCars={vi.fn()}
        onSelectCar={vi.fn()}
      />
    );

    expect(screen.getByText('1600 laps')).toBeInTheDocument();
    expect(screen.queryByText('7328 km')).not.toBeInTheDocument();
  });

  it('switches to distance when the Km toggle is clicked', () => {
    render(
      <CarsSummaryCard
        rankedCars={rankedCars}
        visibleCars={rankedCars}
        showMoreCars={false}
        setShowMoreCars={vi.fn()}
        onSelectCar={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Km' }));

    expect(screen.getByText('7328 km')).toBeInTheDocument();
    expect(screen.queryByText('1600 laps')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Laps' }));
    expect(screen.getByText('1600 laps')).toBeInTheDocument();
  });

  it('still invokes onSelectCar when a row is clicked regardless of the active unit', () => {
    const onSelectCar = vi.fn();
    render(
      <CarsSummaryCard
        rankedCars={rankedCars}
        visibleCars={rankedCars}
        showMoreCars={false}
        setShowMoreCars={vi.fn()}
        onSelectCar={onSelectCar}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Km' }));
    fireEvent.click(screen.getByText('BMW M4 LMGT3'));

    expect(onSelectCar).toHaveBeenCalledWith('BMW');
  });

  it('reorders rows by distance when the Km toggle is active', () => {
    render(
      <CarsSummaryCard
        rankedCars={rankedCars}
        visibleCars={rankedCars}
        showMoreCars={false}
        setShowMoreCars={vi.fn()}
        onSelectCar={vi.fn()}
      />
    );

    // Laps order: BMW (1600) > McLaren (737) > Lexus (685)
    let rowNames = screen.getAllByTitle(/Filter by .*/).map((el) => el.textContent);
    expect(rowNames[1]).toContain('McLaren 720S LMGT3 Evo');

    fireEvent.click(screen.getByRole('button', { name: 'Km' }));

    // Km order: BMW (7328) > Lexus (3500) > McLaren (3140.2)
    rowNames = screen.getAllByTitle(/Filter by .*/).map((el) => el.textContent);
    expect(rowNames[1]).toContain('Lexus RCF LMGT3');
  });

  it('re-ranks full car dataset by km when switching from laps to km so true top distance cars appear', () => {
    const multiCars = [
      { car: 'BMW M4 LMGT3', laps: 100, km: 500.0 },
      { car: 'Porsche 911 GT3 R', laps: 90, km: 450.0 },
      { car: 'Ferrari 296 GT3', laps: 80, km: 400.0 },
      { car: 'Chevrolet Corvette Z06 LMGT3.R', laps: 70, km: 950.0 },
    ];

    const onSelectCar = vi.fn();
    render(
      <CarsSummaryCard
        rankedCars={multiCars}
        visibleCars={multiCars.slice(0, 3)}
        showMoreCars={false}
        setShowMoreCars={vi.fn()}
        onSelectCar={onSelectCar}
      />
    );

    let rowNames = screen.getAllByTitle(/Filter by .*/).map((el) => el.textContent);
    expect(rowNames[0]).toContain('BMW M4 LMGT3');
    expect(screen.queryByText('Chevrolet Corvette Z06 LMGT3.R')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Km' }));

    rowNames = screen.getAllByTitle(/Filter by .*/).map((el) => el.textContent);
    expect(rowNames[0]).toContain('Chevrolet Corvette Z06 LMGT3.R');
    expect(screen.getByText('950 km')).toBeInTheDocument();
  });
});

