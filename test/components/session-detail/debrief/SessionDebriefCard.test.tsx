import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionDebriefCard } from '../../../../src/components/session-detail/debrief/SessionDebriefCard.js';
import { clearSessionDebriefCache } from '../../../../src/components/session-detail/debrief/useSessionDebrief.js';
import { me, mockDebriefServer, realisticLap, referenceLap, session } from './debriefFixtures.js';

describe('SessionDebriefCard', () => {
  beforeEach(() => {
    clearSessionDebriefCache();
    window.location.hash = '#/session/R1';
  });

  it('lists the corner to work on and opens it in telemetry against the reference', async () => {
    mockDebriefServer();

    render(<SessionDebriefCard session={session} selectedDriver={me} />);

    expect(screen.getByText(/Comparing your best lap with other Peugeot 9x8 laps/)).toBeInTheDocument();
    const row = await screen.findByTestId('debrief-corner-1');
    expect(row).toHaveTextContent('T1');
    expect(row).toHaveTextContent('+0.400s');
    expect(row).toHaveTextContent('lost on 2 of 3 laps');
    expect(screen.getByText('Davide Catani')).toBeInTheDocument();
    expect(screen.getByText(/comparison confidence \(80%\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open T1 in telemetry' }));

    await waitFor(() => expect(window.location.hash).toContain('/telemetry?'));
    expect(window.location.hash).toContain('corner=1');
    expect(window.location.hash).toContain('compareDriver=Davide+Catani');
  });

  it('ranks against a realistic target, shows the fastest lap for technique, and names the traffic', async () => {
    mockDebriefServer([referenceLap, realisticLap], {
      available: true,
      laps: [{ lapNumber: 20, spells: [{
        carName: 'Rui Paiva', carClass: 'GT3', kind: 'multiclass', direction: 'ahead',
        startSec: 10, endSec: 14, startStationM: 40, endStationM: 90, closestGapSec: 0.4,
      }] }],
    });

    render(<SessionDebriefCard session={session} selectedDriver={me} />);

    const row = await screen.findByTestId('debrief-corner-1');
    expect(row).toHaveTextContent('+0.240s');
    expect(row).toHaveTextContent('+0.400s vs fastest');
    expect(row).toHaveTextContent('Behind Rui Paiva (GT3)');
    expect(screen.getByText(/realistic target/)).toHaveTextContent('Near Rival');
    expect(screen.getByText(/Technique from the fastest/)).toHaveTextContent('Davide Catani');
    expect(screen.getByText(/ranks lower/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open T1 against the fastest lap' }));

    await waitFor(() => expect(window.location.hash).toContain('compareDriver=Davide+Catani'));
  });

  it('explains when there is nothing to compare with yet', async () => {
    mockDebriefServer([]);

    render(<SessionDebriefCard session={session} selectedDriver={me} />);

    expect(await screen.findByText(/No other Peugeot 9x8 lap with replay data on this layout/)).toBeInTheDocument();
  });

  it('shows why the debrief failed to load', async () => {
    global.fetch = (() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Session store is busy' }) })) as unknown as typeof fetch;

    render(<SessionDebriefCard session={session} selectedDriver={me} />);

    expect(await screen.findByText('Session store is busy')).toBeInTheDocument();
  });
});
