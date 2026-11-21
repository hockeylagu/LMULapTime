import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { onSequenceMapsChanged } from '../../../../src/api/cornerApi.js';
import { SequenceMapsCard } from '../../../../src/components/settings/sequences/SequenceMapsCard.js';
import type { SequenceMapSummary, SequenceMapsResponse } from '../../../../shared/types/corners/sequenceMaps.js';

const reply = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const MAPS: SequenceMapSummary[] = [
  { layoutKey: 'spa_gp', carClass: 'GT3', lapCount: 10, sequenceCount: 9, builtAt: 1, ownCheck: { checked: 9, same: 8, startOff: 2 },
    check: { checkedAt: 2, agrees: false, detail: 'T18–T19: start 18 m later' } },
  { layoutKey: 'monza_gp', carClass: 'Hyper', lapCount: 6, sequenceCount: 6, builtAt: 1, ownCheck: { checked: 0, same: 0, startOff: 0 }, check: null },
];

describe('SequenceMapsCard', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists each map with its checks and flags the one that differs', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ maps: MAPS, regenerating: null, failed: null } satisfies SequenceMapsResponse)));
    render(<SequenceMapsCard />);
    const rows = await screen.findAllByTestId('sequence-map-row');
    expect(screen.getByText('1 map flagged')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Differs')).toBeInTheDocument();
    expect(within(rows[0]).getByText('T18–T19: start 18 m later')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/8\/9 alike/)).toHaveTextContent('8/9 alike · 2 starts >10 m');
    expect(within(rows[1]).getByText('6 of 10')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Not yet')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Hypercar')).toBeInTheDocument();
  });

  /** Starts a regeneration of the Spa GT3 map, then lets it end with `failed` (null: it worked). */
  async function regenerate(failed: SequenceMapsResponse['failed']) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let regenerating: string | null = null;
    let ended: SequenceMapsResponse['failed'] = null;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        regenerating = 'spa_gp|GT3';
        return reply({ regenerating }, 202);
      }
      return reply({ maps: MAPS, regenerating, failed: ended } satisfies SequenceMapsResponse);
    });
    vi.stubGlobal('fetch', fetchMock);
    const changed = vi.fn();
    const unsubscribe = onSequenceMapsChanged(changed);
    render(<SequenceMapsCard />);
    const [spa] = await screen.findAllByTestId('sequence-map-row');
    fireEvent.click(within(spa).getByRole('button', { name: /Regenerate the GT3 map/ }));
    await screen.findByText('Regenerating…');
    expect(fetchMock).toHaveBeenCalledWith('/api/corner-sequences/maps/regenerate',
      expect.objectContaining({ method: 'POST', body: '{"layoutKey":"spa_gp","carClass":"GT3"}' }));
    // Every button waits while one map regenerates.
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
    // The list is read again every 2 s while it works.
    regenerating = null;
    ended = failed;
    await act(() => vi.advanceTimersByTimeAsync(2000));
    unsubscribe();
    return changed;
  }

  it('regenerates a map, shows it working, says when it is done and drops the answers built on the old map', async () => {
    const changed = await regenerate(null);
    expect(await screen.findByRole('status')).toHaveTextContent('Map regenerated');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('says why a regeneration failed instead of reporting it done', async () => {
    await regenerate({ map: 'spa_gp|GT3', error: 'a lap is no longer stored' });
    expect(await screen.findByRole('alert')).toHaveTextContent('The map could not be regenerated: a lap is no longer stored');
    expect(screen.queryByText(/Map regenerated/)).not.toBeInTheDocument();
  });

  it('says why a regenerate was refused', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? reply({ error: 'Wait for the replay scan to finish' }, 409) : reply({ maps: MAPS, regenerating: null })));
    render(<SequenceMapsCard />);
    const [spa] = await screen.findAllByTestId('sequence-map-row');
    fireEvent.click(within(spa).getByRole('button', { name: /Regenerate the GT3 map/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait for the replay scan to finish');
  });

  it('says when there are no maps yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ maps: [], regenerating: null })));
    render(<SequenceMapsCard />);
    expect(await screen.findByText(/No maps yet/)).toBeInTheDocument();
  });
});
