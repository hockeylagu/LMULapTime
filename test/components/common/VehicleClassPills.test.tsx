import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VehicleClassPills } from '../../../src/components/common/VehicleClassPills.js';

describe('VehicleClassPills', () => {
  it('renders VehicleClassPills without duplicating text next to badges and uses canonical class', () => {
    const onSelect = vi.fn();
    render(<VehicleClassPills selectedClass="GT3" onSelectClass={onSelect} />);

    // ALL button is present
    const allBtn = screen.getByRole('button', { name: 'All' });
    expect(allBtn).toBeInTheDocument();
    expect(allBtn).toHaveTextContent('ALL');

    // The LMGT3 class reads GT3, by aria-label and visible text
    const gt3Btn = screen.getByRole('button', { name: 'GT3' });
    expect(gt3Btn).toBeInTheDocument();
    expect(gt3Btn).toHaveTextContent('GT3');
    // Ensure there is no duplicated 'GT3' text node alongside GT3
    expect(gt3Btn.textContent).toBe('GT3');

    // Hypercar button has HY visible text without duplicated 'Hypercar' text
    const hyBtn = screen.getByRole('button', { name: 'Hypercar' });
    expect(hyBtn).toHaveTextContent('HY');
    expect(hyBtn.textContent).toBe('HY');

    fireEvent.click(hyBtn);
    expect(onSelect).toHaveBeenCalledWith('Hyper');
  });
});
