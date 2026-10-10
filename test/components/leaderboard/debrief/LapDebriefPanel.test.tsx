import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LapDebriefPanel } from '../../../../src/components/leaderboard/debrief/LapDebriefPanel.js';
import { LapDebriefUnavailableError } from '../../../../src/components/leaderboard/debrief/loadLapDebrief.js';
import type { DebriefCorner } from '../../../../src/utils/sessionDebrief.js';

const loader = { load: vi.fn() };
const renderPanel = () => render(<LapDebriefPanel pairKey="me|rival" againstLabel="Rival" load={loader.load} />);

const corner = (cornerNumber: number, timeLossSec: number): DebriefCorner => ({
  cornerNumber, entryDistM: 100 * cornerNumber, minDistM: 100 * cornerNumber + 40, timeLossSec,
  lapsLosing: null, lapsSampled: null, repeatability: 1, confidence: 1, priority: timeLossSec,
  worstPhase: 'entry', evidence: ['Brake 12 m later'], techniqueLossSec: null, traffic: null, lapsInTraffic: 0,
});

describe('LapDebriefPanel', () => {
  beforeEach(() => {
    loader.load.mockReset();
    window.location.hash = '#/compare?track=Monza';
  });

  it('builds the debrief when asked, and opens a corner in telemetry against the rival', async () => {
    loader.load.mockResolvedValue({
      corners: [corner(5, 0.21), corner(1, 0.08)],
      confidence: 1,
      caveats: ['One lap was recorded at a lower rate.'],
      yours: { driverName: 'Me', lapNum: 3, sessionId: 's-Me', driverOrdinal: 0, lapOrdinal: 2 },
      theirs: { driverName: 'Rival', lapNum: 3, sessionId: 's-Rival', driverOrdinal: 1, lapOrdinal: 2 },
    });
    renderPanel();
    expect(loader.load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Where's the time/ }));
    expect(await screen.findByTestId('debrief-corner-5')).toHaveTextContent('Brake 12 m later');
    expect(screen.getByText('One lap was recorded at a lower rate.')).toBeInTheDocument();

    const openT5 = screen.getByTestId('debrief-corner-5').querySelector('a, button') as HTMLElement;
    fireEvent.click(openT5);
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/telemetry\?/));
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    expect(params.get('corner')).toBe('5');
    expect(params.get('baselineSessionId')).toBe('s-Rival');
    expect(params.get('baselineDriverOrdinal')).toBe('1');
    expect(params.get('baselineLapOrdinal')).toBe('2');
    expect(params.get('track')).toBe('Monza');
  });

  it('builds the debrief straight away when asked to', async () => {
    loader.load.mockResolvedValue({
      corners: [corner(2, 0.1)], confidence: 1, caveats: [],
      yours: { driverName: 'Me', lapNum: 3, sessionId: 's-Me', driverOrdinal: 0, lapOrdinal: 2 },
      theirs: { driverName: 'Rival', lapNum: 3, sessionId: 's-Rival', driverOrdinal: 1, lapOrdinal: 2 },
    });
    render(<LapDebriefPanel pairKey="me|rival" againstLabel="Rival" load={loader.load} autoStart />);
    expect(await screen.findByTestId('debrief-corner-2')).toBeInTheDocument();
    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it('says why when there is no debrief', async () => {
    loader.load.mockRejectedValue(new LapDebriefUnavailableError("Rival's lap has no session telemetry locator."));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Where's the time/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no session telemetry locator');
  });
});
