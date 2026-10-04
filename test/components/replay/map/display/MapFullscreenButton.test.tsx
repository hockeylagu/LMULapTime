import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapFullscreenButton } from '../../../../../src/components/replay/map/display/MapFullscreenButton.js';

function renderInMap() {
  render(<div data-replay-surface="map" data-testid="map"><MapFullscreenButton /></div>);
  return screen.getByTestId('map');
}

describe('MapFullscreenButton', () => {
  it('expands the map over the window and restores it from the button', () => {
    const map = renderInMap();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen map' }));
    expect(map).toHaveAttribute('data-map-expanded');
    const exit = screen.getByRole('button', { name: 'Exit full screen (Esc)' });
    expect(exit).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(exit);
    expect(map).not.toHaveAttribute('data-map-expanded');
  });

  it('restores the map on Escape', () => {
    const map = renderInMap();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen map' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(map).not.toHaveAttribute('data-map-expanded');
    expect(screen.getByRole('button', { name: 'Full screen map' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('supports controlled mode with isExpanded and onToggleExpanded', () => {
    let expanded = false;
    const onToggle = (next: boolean) => { expanded = next; };
    const { rerender } = render(
      <div data-replay-surface="map" data-testid="map">
        <MapFullscreenButton isExpanded={expanded} onToggleExpanded={onToggle} />
      </div>
    );
    const map = screen.getByTestId('map');
    fireEvent.click(screen.getByRole('button', { name: 'Full screen map' }));
    expect(expanded).toBe(true);

    rerender(
      <div data-replay-surface="map" data-testid="map">
        <MapFullscreenButton isExpanded={true} onToggleExpanded={onToggle} />
      </div>
    );
    expect(map).toHaveAttribute('data-map-expanded');
    expect(screen.getByRole('button', { name: 'Exit full screen (Esc)' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(expanded).toBe(false);
  });
});
