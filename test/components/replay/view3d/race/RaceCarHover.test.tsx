import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RaceCarHover } from '../../../../../src/components/replay/view3d/race/RaceCarHover.js';
import type { RaceClock } from '../../../../../src/components/replay/race/raceClock.js';
import type { RaceStandingsIndex } from '../../../../../src/components/replay/race/raceStandings.js';

vi.mock('../../../../../src/components/replay/race/RaceCarTooltip.js', () => ({
  RaceCarTooltip: ({ slot }: { slot: number }) => <div data-testid="tooltip">car {slot}</div>,
}));

afterEach(cleanup);

/** A host of 1000 by 600 pixels, a scene picking `slot`, and a clock whose ticks the test sends. */
function setup(active = true) {
  const host = createRef<HTMLDivElement>(), listeners = new Set<() => void>();
  let slot: number | null = 7;
  const pick = vi.fn(() => slot);
  const clock = { subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } } as unknown as RaceClock;
  const view = render(
    <div>
      <div ref={host} data-testid="host" />
      <RaceCarHover host={host} scene={{ current: { pick } }} clock={clock} index={{} as RaceStandingsIndex} active={active} />
    </div>,
  );
  const element = screen.getByTestId('host');
  Object.defineProperty(element, 'clientWidth', { value: 1000 });
  Object.defineProperty(element, 'clientHeight', { value: 600 });
  return {
    view, pick, element, tooltip: () => screen.queryByTestId('tooltip'),
    setSlot: (next: number | null) => { slot = next; },
    tick: () => act(() => listeners.forEach(listener => listener())),
  };
}

describe('RaceCarHover', () => {
  it('shows the tooltip of the car under the pointer beside it, and looks again as the cars move', () => {
    const { pick, element, tooltip, setSlot, tick } = setup();
    expect(tooltip()).toBeNull();
    fireEvent.pointerMove(element, { clientX: 40, clientY: 30 });
    expect(pick).toHaveBeenLastCalledWith(40, 30);
    expect(tooltip()).toHaveTextContent('car 7');
    expect(tooltip()!.parentElement).toHaveStyle({ left: '54px', top: '44px' });
    setSlot(3); tick();
    expect(tooltip()).toHaveTextContent('car 3');
    setSlot(null); tick();
    expect(tooltip()).toBeNull();
  });

  it('goes the other side of the pointer near the right and bottom edges', () => {
    const { element, tooltip } = setup();
    fireEvent.pointerMove(element, { clientX: 900, clientY: 550 });
    expect(tooltip()!.parentElement).toHaveStyle({ right: '114px', bottom: '64px' });
  });

  it('shows none while a button is down (the pointer orbits), after the pointer leaves, or while the view is hidden', () => {
    const { pick, element, tooltip, tick, view } = setup();
    fireEvent.pointerMove(element, { clientX: 40, clientY: 30, buttons: 1 });
    tick();
    expect(pick).not.toHaveBeenCalled();
    expect(tooltip()).toBeNull();
    fireEvent.pointerMove(element, { clientX: 40, clientY: 30 });
    expect(tooltip()).not.toBeNull();
    fireEvent.pointerLeave(element);
    expect(tooltip()).toBeNull();
    fireEvent.pointerMove(element, { clientX: 40, clientY: 30 });
    view.unmount();
    const hidden = setup(false);
    fireEvent.pointerMove(hidden.element, { clientX: 40, clientY: 30 });
    expect(hidden.pick).not.toHaveBeenCalled();
  });
});
