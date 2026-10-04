import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapControlsOverlay } from '../../../../src/components/replay/map/MapControlsOverlay.js';

describe('MapControlsOverlay', () => {
  const defaultProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onReset: vi.fn(),
  };

  it('renders zoom in, zoom out, and reset buttons', () => {
    render(<MapControlsOverlay {...defaultProps} />);

    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('renders center car button as icon-only with title for hover and no text label', () => {
    const onCenterCar = vi.fn();
    render(<MapControlsOverlay {...defaultProps} onCenterCar={onCenterCar} />);

    const centerButton = screen.getByRole('button', { name: /center car/i });
    expect(centerButton).toBeInTheDocument();
    expect(centerButton).toHaveAttribute('title', 'Center car · C');
    expect(centerButton.querySelector('svg')).toBeInTheDocument();

    // No visible text label inside the button (icon-only to avoid taking too much space)
    expect(centerButton.textContent?.trim()).toBe('');

    fireEvent.click(centerButton);
    expect(onCenterCar).toHaveBeenCalledTimes(1);
  });

  it('does not render center car button when onCenterCar is omitted', () => {
    render(<MapControlsOverlay {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /center car/i })).not.toBeInTheDocument();
  });

  it('renders follow car button with appropriate title and active state', () => {
    const onToggleFollowCar = vi.fn();
    const { rerender } = render(
      <MapControlsOverlay
        {...defaultProps}
        followCar={false}
        onToggleFollowCar={onToggleFollowCar}
      />
    );

    const followButton = screen.getByRole('button', { name: /follow car/i });
    expect(followButton).toHaveAttribute('title', 'Follow car · F');
    expect(followButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(followButton);
    expect(onToggleFollowCar).toHaveBeenCalledTimes(1);

    rerender(
      <MapControlsOverlay
        {...defaultProps}
        followCar={true}
        onToggleFollowCar={onToggleFollowCar}
      />
    );

    expect(screen.getByRole('button', { name: /follow car/i })).toHaveAttribute(
      'title',
      'Follow car · F (active)'
    );
    expect(screen.getByRole('button', { name: /follow car/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('supports vertical orientation layout styling', () => {
    const { container } = render(
      <MapControlsOverlay {...defaultProps} orientation="vertical" />
    );

    const overlay = container.querySelector('[data-testid="map-controls-overlay"]');
    expect(overlay).toHaveClass('flex-col');
  });
});
