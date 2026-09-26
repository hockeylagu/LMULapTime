import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LapSelectorDropdown, LapConsistencyOption } from '../../../src/components/replay/analysis/LapSelectorDropdown.js';

describe('LapSelectorDropdown component', () => {
  const availableLaps: LapConsistencyOption[] = [
    { lapNumber: 1, lapTimeSec: 100.5, isValid: true },
    { lapNumber: 2, lapTimeSec: 99.8, isValid: true },
    { lapNumber: 3, lapTimeSec: 102.1, isValid: false },
  ];

  const formatLapTime = (sec?: number | null) => (sec ? `${sec.toFixed(1)}s` : '--');

  it('renders closed dropdown button with included count', () => {
    render(
      <LapSelectorDropdown
        availableLaps={availableLaps}
        excludedLaps={new Set([3])}
        onToggleLapExclusion={vi.fn()}
        formatLapTime={formatLapTime}
      />
    );

    expect(screen.getByText('2/3 laps included')).toBeInTheDocument();
  });

  it('opens menu on click and displays lap options with status badges', () => {
    const onToggleLapExclusion = vi.fn();
    render(
      <LapSelectorDropdown
        availableLaps={availableLaps}
        excludedLaps={new Set([3])}
        onToggleLapExclusion={onToggleLapExclusion}
        formatLapTime={formatLapTime}
      />
    );

    const toggleBtn = screen.getByRole('button');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Lap 1')).toBeInTheDocument();
    expect(screen.getByText('Lap 2')).toBeInTheDocument();
    expect(screen.getByText('Lap 3')).toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText('100.5s')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked(); // Lap 1
    expect(checkboxes[1]).toBeChecked(); // Lap 2
    expect(checkboxes[2]).not.toBeChecked(); // Lap 3 excluded

    fireEvent.click(checkboxes[0]);
    expect(onToggleLapExclusion).toHaveBeenCalledWith(1);
  });

  it('closes dropdown when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <LapSelectorDropdown
          availableLaps={availableLaps}
          excludedLaps={new Set()}
          onToggleLapExclusion={vi.fn()}
          formatLapTime={formatLapTime}
        />
      </div>
    );

    const toggleBtn = screen.getByRole('button');
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Lap 1')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(screen.queryByText('Lap 1')).not.toBeInTheDocument();
  });
});
