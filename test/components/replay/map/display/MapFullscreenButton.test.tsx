import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapFullscreenButton } from '../../../../../src/components/replay/map/display/MapFullscreenButton.js';
import { ReplayShortcutHelp } from '../../../../../src/components/replay/ReplayShortcutHelp.js';

function renderInMap() {
  render(<div data-replay-surface="map" data-testid="map"><MapFullscreenButton /></div>);
  return screen.getByTestId('map');
}

describe('MapFullscreenButton', () => {
  it('isolates ancestors, traps focus and restores scrolling and the trigger', () => {
    render(<div><button data-testid="background">Background</button><div data-replay-surface="map" data-testid="map">
      <MapFullscreenButton /><button>Last map control</button>
    </div></div>);
    const trigger = screen.getByRole('button', { name: 'Full screen map' });
    const background = screen.getByTestId('background');
    background.inert = true;
    trigger.focus();
    const overflow = document.body.style.overflow;
    fireEvent.click(trigger);
    const map = screen.getByRole('dialog');
    expect(map).toHaveAttribute('aria-modal', 'true');
    expect(map).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    background.focus();
    expect(map).toHaveFocus();
    const last = screen.getByRole('button', { name: 'Last map control' });
    last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(background.inert).toBe(true);
    expect(document.body.style.overflow).toBe(overflow);
    expect(map).not.toHaveAttribute('aria-modal');
  });

  it('dismisses shortcut help before fullscreen and restores map focus', () => {
    render(<div data-replay-surface="map" tabIndex={0} data-testid="map">
      <MapFullscreenButton /><ReplayShortcutHelp />
    </div>);
    const trigger = screen.getByRole('button', { name: 'Full screen map' });
    trigger.focus(); fireEvent.click(trigger);
    const help = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    help.focus(); fireEvent.click(help);
    expect(screen.getByRole('button', { name: 'Close shortcuts' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Close shortcuts' })).not.toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-map-expanded');
    expect(help).toHaveFocus();
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(screen.getByTestId('map')).not.toHaveAttribute('data-map-expanded');
    expect(trigger).toHaveFocus();
  });

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
