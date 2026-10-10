import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionGridCard } from '../../../src/components/session-list/SessionGridCard.js';
import type { SessionListItem } from '../../../src/components/session-list/sessionListTypes.js';

const session: SessionListItem = {
  id: 'session-race-1',
  sessionType: 'Race',
  sessionName: 'Race 1',
  timeString: '2026-07-20 15:30',
  trackVenue: 'Autodromo Nazionale Monza',
  trackCourse: 'Grand Prix',
  matchingReplayFile: { name: 'Monza.Vcr', path: 'C:/LMU/Replays/Monza.Vcr' },
  playerDriver: {
    name: 'Player Driver', carType: 'Porsche 963', carClass: 'Hypercar', lapsCount: 15, bestLapTime: 95.123,
    bestLapTimeString: '1:35.123', position: 1, gridPosition: 3, positionGain: 2, bestLapNum: 4, driverOrdinal: 0, bestLapOrdinal: 3,
  },
} as SessionListItem;

/** jsdom cannot open a new tab: swallow the browser default after React has seen the click. */
function modifierClick(el: HTMLElement, init: { ctrlKey?: boolean; metaKey?: boolean }): void {
  el.addEventListener('click', e => e.preventDefault(), { once: true });
  fireEvent.click(el, init);
}

function setup() {
  const onSelectSession = vi.fn();
  const onOpenReplay = vi.fn();
  render(<SessionGridCard session={session} onSelectSession={onSelectSession} onOpenReplay={onOpenReplay} />);
  return { onSelectSession, onOpenReplay, overlay: screen.getByRole('link', { name: /Open session:/ }) };
}

describe('SessionGridCard links', () => {
  it('selects the session once on a plain click of the overlay link', () => {
    const { onSelectSession, overlay } = setup();
    expect(overlay).toHaveAttribute('href', '/session/session-race-1');
    expect(fireEvent.click(overlay)).toBe(false);
    expect(onSelectSession).toHaveBeenCalledTimes(1);
    expect(onSelectSession).toHaveBeenCalledWith('session-race-1');
  });

  it('leaves ctrl and meta clicks of the overlay link to the browser', () => {
    const { onSelectSession, overlay } = setup();
    modifierClick(overlay, { ctrlKey: true });
    modifierClick(overlay, { metaKey: true });
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it('links the replay indicator to the best lap and opens it once without selecting the card', () => {
    const { onSelectSession, onOpenReplay } = setup();
    const replayLink = screen.getByRole('link', { name: /Open replay telemetry/ });
    expect(replayLink).toHaveAttribute('href', expect.stringContaining('sessionId=session-race-1'));
    expect(replayLink).toHaveAttribute('href', expect.stringContaining('driverOrdinal=0'));
    expect(replayLink).toHaveAttribute('href', expect.stringContaining('lapOrdinal=3'));
    expect(replayLink).not.toHaveAttribute('href', expect.stringContaining('replayName='));
    fireEvent.click(replayLink);
    expect(onOpenReplay).toHaveBeenCalledTimes(1);
    expect(onOpenReplay).toHaveBeenCalledWith('session-race-1');
    expect(onSelectSession).not.toHaveBeenCalled();
  });
});
