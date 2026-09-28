import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const loader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../../../src/components/compare-laps/rivals/loadRivalDebrief.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/components/compare-laps/rivals/loadRivalDebrief.js')>(),
  loadRivalDebrief: loader.load,
}));

import { RivalDebriefPanel } from '../../../../src/components/compare-laps/rivals/RivalDebriefPanel.js';
import { RivalDebriefUnavailableError } from '../../../../src/components/compare-laps/rivals/loadRivalDebrief.js';
import type { DebriefCorner } from '../../../../src/utils/sessionDebrief.js';
import { entry } from '../leaderboard/leaderboardFixtures.js';

const player = entry(10, 'Me', 100, { isPlayer: true });
const rival = entry(9, 'Rival', 99.7);

const corner = (cornerNumber: number, timeLossSec: number): DebriefCorner => ({
  cornerNumber, entryDistM: 100 * cornerNumber, minDistM: 100 * cornerNumber + 40, timeLossSec,
  lapsLosing: null, lapsSampled: null, repeatability: 1, confidence: 1, priority: timeLossSec,
  worstPhase: 'entry', evidence: ['Brake 12 m later'], techniqueLossSec: null, traffic: null, lapsInTraffic: 0,
});

describe('RivalDebriefPanel', () => {
  beforeEach(() => {
    loader.load.mockReset();
    window.location.hash = '#/compare?track=Monza';
  });

  it('builds the debrief when asked, and opens a corner in telemetry against the rival', async () => {
    loader.load.mockResolvedValue({
      corners: [corner(5, 0.21), corner(1, 0.08)],
      confidence: 1,
      caveats: ['One lap was recorded at a lower rate.'],
      yours: { replayName: 'Me.Vcr', driverName: 'Me', lapNum: 3, sessionId: 's-Me' },
      theirs: { replayName: 'Rival.Vcr', driverName: 'Rival', lapNum: 3, sessionId: 's-Rival' },
    });
    render(<RivalDebriefPanel player={player} rival={rival} />);
    expect(loader.load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Where's the time/ }));
    expect(await screen.findByTestId('debrief-corner-5')).toHaveTextContent('Brake 12 m later');
    expect(screen.getByText('One lap was recorded at a lower rate.')).toBeInTheDocument();

    const openT5 = screen.getByTestId('debrief-corner-5').querySelector('button') as HTMLButtonElement;
    fireEvent.click(openT5);
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/telemetry\?/));
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    expect(params.get('corner')).toBe('5');
    expect(params.get('baselineReplay')).toBe('Rival.Vcr');
    expect(params.get('track')).toBe('Monza');
  });

  it('says why when there is no debrief', async () => {
    loader.load.mockRejectedValue(new RivalDebriefUnavailableError("Rival's lap has no replay to compare with."));
    render(<RivalDebriefPanel player={player} rival={rival} />);
    fireEvent.click(screen.getByRole('button', { name: /Where's the time/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no replay to compare with');
  });
});

describe('loadRivalDebrief', () => {
  it('refuses laps without a replay before loading anything', async () => {
    const actual = await vi.importActual<typeof import('../../../../src/components/compare-laps/rivals/loadRivalDebrief.js')>(
      '../../../../src/components/compare-laps/rivals/loadRivalDebrief.js'
    );
    const noReplay = entry(9, 'Rival', 99.7);
    noReplay.bestLap.replayName = null;
    await expect(actual.loadRivalDebrief(player, noReplay)).rejects.toThrow("Rival's lap has no replay");
    const mine = entry(10, 'Me', 100, { isPlayer: true });
    mine.bestLap.replayName = null;
    await expect(actual.loadRivalDebrief(mine, rival)).rejects.toThrow('Your best lap here has no replay');
  });
});
