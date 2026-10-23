import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionStrategyCard } from '../../../src/components/session-detail/debrief/SessionStrategyCard.js';
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

describe('strategy debrief', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows what the race used: stops, use per lap, left at the flag, ratio, wear and pace', async () => {
    answer(LE_MANS);
    render(<SessionStrategyCard sessionId="le-mans" />);
    const card = await screen.findByText('8.11 %');
    expect(card).toBeInTheDocument();
    const section = screen.getByTestId('session-strategy');
    expect(section).toHaveTextContent('Stops2lap 2, 13');
    expect(section).toHaveTextContent('Left at the flag2.9 %0.4 laps of use · started on 100 %');
    expect(section).toHaveTextContent('Fuel ratio0.840.83 covers every clean lap');
    expect(section).toHaveTextContent('Tyre wear1.14 % / lapfront left, the most worn · Medium');
    expect(section).toHaveTextContent('Tread at the flag83 %');
    expect(section).toHaveTextContent('last 3 −0.738 s vs first 3');
    expect(section).toHaveTextContent('Lap 2 · +14.5 % VE · +12.9 L fuel · tyres FL FR');
    expect(section).toHaveTextContent('Lap 13 · +13.4 % VE · +9.0 L fuel · no tyres');
    expect(screen.queryByTestId('strategy-plan-vs-actual')).toBeNull();
  });

  it('puts the plan shown before the start beside what the race did', async () => {
    answer(LE_MANS, PLAN);
    render(<SessionStrategyCard sessionId="le-mans" />);
    const table = await screen.findByTestId('strategy-plan-vs-actual');
    expect(table).toHaveTextContent('Plan vs actual · no tyre change');
    expect(table).toHaveTextContent('Stops1 · lap 112 · lap 2');
    expect(table).toHaveTextContent('VE at the start100 %100 %');
    expect(table).toHaveTextContent('Leaving the last stop45 %33 %');
    expect(table).toHaveTextContent('Tyres at the stopno changeFL FR, no change');
    expect(table).toHaveTextContent('Racing laps~1616');
    expect(table).toHaveTextContent('Tread at the flag69 %83 %');
  });

  it('shows a fuel sprint without the VE or the ratio, and says so without a recording', async () => {
    answer({ ...LE_MANS, kind: 'fuel', laps: 12, start: { fuel: 31, ve: null }, flag: { fuel: 3, ve: null, laps: 1.3 },
      perLap: { fuel: 2.32, ve: null, laps: 6 }, fuelRatio: { set: null, needed: null }, stops: [] });
    render(<SessionStrategyCard sessionId="algarve" />);
    expect(await screen.findByText('2.32 L')).toBeInTheDocument();
    expect(screen.getByTestId('session-strategy')).toHaveTextContent('StopsNone12 laps on one load');
    expect(screen.queryByText('Fuel ratio')).toBeNull();
    cleanup();
    answer(null);
    render(<SessionStrategyCard sessionId="none" />);
    expect(await screen.findByText(/No telemetry recording is linked to this race/)).toBeInTheDocument();
  });
});
