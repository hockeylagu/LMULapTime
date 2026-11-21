import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionStrategyCard } from '../../../src/components/session-detail/debrief/SessionStrategyCard.js';
import { fetchSessionStrategy } from '../../../src/api/sessionStrategyApi.js';
import { useRequest } from '../../../src/api/useRequest.js';
import type { SessionStrategy } from '../../../shared/types/index.js';
import type { LiveRaceStrategies } from '../../../shared/types/liveStrategy.js';

const LE_MANS: SessionStrategy = {
  kind: 've', laps: 16, start: { fuel: 84, ve: 100 }, flag: { fuel: 2.9, ve: 2.9, laps: 0.4 },
  perLap: { fuel: 6.65, ve: 8.11, laps: 6 }, fuelRatio: { set: 0.84, needed: 0.83 },
  tyres: { compound: 'Medium', corner: 'FL', wearPerLap: 0.0114, treadAtFlag: 0.834 },
  stops: [{ lap: 2, fuelAdded: 12.9, veAdded: 14.5, levelAfter: 92.6, tyres: ['FL', 'FR'] }, { lap: 13, fuelAdded: 9, veAdded: 13.4, levelAfter: 33.1, tyres: [] }],
  pace: { clean: 212.633, first: 212.738, last: 212, laps: 6 },
};
const PLAN: LiveRaceStrategies = { kind: 've', unit: '%', raceMinutes: 60, laps: 16, nextBest: null,
  chosen: { name: 'NO TYRE CHANGE', stops: 1, pitLap: 11, loadStart: 100, loadToFinish: 45, tyresStart: 'NEW MEDIUM',
    tyresStop: 'NO CHANGE', treadAtFlag: 0.69, gapSeconds: 0 } };
const answer = (strategy: SessionStrategy | null, plan: LiveRaceStrategies | null = null) =>
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ strategy, plan }), { status: 200 }))));

/** The card as the debrief shows it: the strategy read once for the session. */
function Card({ sessionId }: { sessionId: string }) {
  return <SessionStrategyCard state={useRequest(sessionId, fetchSessionStrategy)} />;
}

describe('strategy debrief', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows a compact VE recap and reads strategy once across opening and closing', async () => {
    answer(LE_MANS);
    render(<Card sessionId="le-mans" />);
    const open = await screen.findByRole('button', { name: 'View full strategy' });
    expect(screen.getByTestId('session-strategy')).toHaveTextContent('Pit stops2laps 2, 13');
    expect(screen.getByTestId('session-strategy')).toHaveTextContent('VE at finish2.9 %est. 0.4 laps');
    expect(screen.queryByText('8.11 %')).toBeNull();
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Race strategy' });
    const close = within(dialog).getByRole('button', { name: 'Close strategy' });
    expect(close).toHaveFocus();
    expect(within(dialog).getByText('8.11 %')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Left at the flag2.9 %0.4 laps of use · started on 100 %');
    expect(dialog).toHaveTextContent('Fuel ratio0.840.83 covers every clean lap');
    expect(dialog).toHaveTextContent('Tyre wear1.14 % / lapfront left, the most worn · Medium');
    expect(dialog).toHaveTextContent('Tread at the flag83 %');
    expect(dialog).toHaveTextContent('last 3 −0.738 s vs first 3');
    expect(dialog).toHaveTextContent('Lap 2 · +14.5 % VE · +12.9 L fuel · tyres FL FR');
    expect(dialog).toHaveTextContent('Lap 13 · +13.4 % VE · +9.0 L fuel · no tyres');
    expect(within(dialog).queryByTestId('strategy-plan-vs-actual')).toBeNull();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(within(dialog).getByRole('region', { name: 'Strategy details' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(open).toHaveFocus();
    fireEvent.click(open);
    fireEvent.click(screen.getByRole('button', { name: 'Close strategy' }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('puts the pre-race plan and actuals above the pit stops and race metrics', async () => {
    answer(LE_MANS, PLAN);
    render(<Card sessionId="le-mans" />);
    fireEvent.click(await screen.findByRole('button', { name: 'View full strategy' }));
    const dialog = screen.getByRole('dialog', { name: 'Race strategy' });
    expect(within(dialog).getAllByRole('heading').map(heading => heading.textContent)).toEqual([
      'Race strategy', 'Plan vs. actual · no tyre change', 'Pit stops', 'VE, fuel, tyres and pace',
    ]);
    const table = within(dialog).getByTestId('strategy-plan-vs-actual');
    expect(table).toHaveTextContent('Stops1 · lap 112 · laps 2, 13');
    expect(table).toHaveTextContent('VE at the start100 %100 %');
    expect(table).toHaveTextContent('Leaving the last stop45 %33 %');
    expect(table).toHaveTextContent('Tyres at the stopno changeFL FR, no change');
    expect(table).toHaveTextContent('Racing laps~1616');
    expect(table).toHaveTextContent('Tread at the flag69 %83 %');
  });

  it('shows a fuel sprint and omits the strategy trigger when telemetry is unavailable', async () => {
    answer({ ...LE_MANS, kind: 'fuel', laps: 12, start: { fuel: 31, ve: null }, flag: { fuel: 3, ve: null, laps: 1.3 },
      perLap: { fuel: 2.32, ve: null, laps: 6 }, fuelRatio: { set: null, needed: null }, stops: [] });
    render(<Card sessionId="algarve" />);
    const open = await screen.findByRole('button', { name: 'View full strategy' });
    expect(screen.getByTestId('session-strategy')).toHaveTextContent('Pit stops0noneFuel at finish3.0 Lest. 1.3 laps');
    fireEvent.click(open);
    expect(screen.getByText('2.32 L')).toBeInTheDocument();
    expect(screen.getByText('No pit stops · 12 laps on one load')).toBeInTheDocument();
    expect(screen.queryByText('Fuel ratio')).toBeNull();
  });
});
