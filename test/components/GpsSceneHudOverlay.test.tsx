import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsSceneHudOverlay } from '../../src/components/replay/map/GpsSceneHudOverlay.js';

describe('GpsSceneHudOverlay', () => {
  it('renders garage indicator in the bottom-right corner when car is stationary', () => {
    render(<GpsSceneHudOverlay isStationary={true} />);

    const badge = screen.getByTestId('gps-scene-hud-overlay');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('Car Parked in Pit / Garage');
    expect(badge.className).toContain('bottom-2.5');
    expect(badge.className).toContain('right-2.5');
    expect(badge.className).not.toContain('top-2');
    expect(badge.className).not.toContain('left-2');
  });

  it('does not render garage indicator when car is moving', () => {
    render(<GpsSceneHudOverlay isStationary={false} />);

    expect(screen.queryByTestId('gps-scene-hud-overlay')).not.toBeInTheDocument();
  });
});
