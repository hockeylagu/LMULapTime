import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapViewSwitchButton } from '../../../../../src/components/replay/map/display/MapViewSwitchButton.js';

describe('MapViewSwitchButton', () => {
  it('renders "3D" when in 2D view and calls onToggleView when clicked', () => {
    const onToggleView = vi.fn();
    render(<MapViewSwitchButton view="2d" onToggleView={onToggleView} />);

    const button = screen.getByRole('button', { name: 'Switch to 3D view' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('3D');

    fireEvent.click(button);
    expect(onToggleView).toHaveBeenCalledOnce();
  });

  it('renders "2D" when in 3D view and calls onToggleView when clicked', () => {
    const onToggleView = vi.fn();
    render(<MapViewSwitchButton view="3d" onToggleView={onToggleView} />);

    const button = screen.getByRole('button', { name: 'Switch to 2D view' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('2D');

    fireEvent.click(button);
    expect(onToggleView).toHaveBeenCalledOnce();
  });
});
