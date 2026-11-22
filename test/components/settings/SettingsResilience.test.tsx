import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ReferenceChangesList } from '../../../src/components/settings/ReferenceChangesList.js';
import { describeBenchmarkUpdate } from '../../../src/components/settings/ReferenceLaptimesCard.js';
import { ReplayCacheCard } from '../../../src/components/settings/ReplayCacheCard.js';
import { useReplayCache } from '../../../src/components/settings/replays/useReplayCache.js';
import type { BenchmarkDiffSummary, ReferenceBenchmarkDiff } from '../../../shared/types/index.js';

const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('Plurals and dates in the benchmark card', () => {
  const diff = (extra: Partial<ReferenceBenchmarkDiff>): ReferenceBenchmarkDiff => ({
    id: 1, timestamp: 'garbage', totalEntries: 1,
    totalAffectedSessions: 1, totalCategoryShifts: 1, added: [], removed: [], ...extra,
    updated: [{ key: 'k', trackName: 'Spa', carClass: 'Hyper', patch: '1.4', type: 'updated', oldAlienSec: 120, newAlienSec: 119 }],
  } as unknown as ReferenceBenchmarkDiff);

  it('says "1 lap changed pace category" and "1 of your session", then the plural forms', () => {
    const { unmount } = render(<ReferenceChangesList updateDiff={diff({})} />);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /1 of your session on these layouts/.test(el.textContent ?? '')
      && /1 lap changed pace category/.test(el.textContent ?? ''))).toBeInTheDocument();
    unmount();
    render(<ReferenceChangesList updateDiff={diff({ totalAffectedSessions: 2, totalCategoryShifts: 1200 })} />);
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /2 of your sessions on these layouts/.test(el.textContent ?? '')
      && /1,200 laps changed pace category/.test(el.textContent ?? ''))).toBeInTheDocument();
  });

  it('shows a dash for a broken timestamp and "Unknown date" in the history picker', () => {
    render(<ReferenceChangesList updateDiff={diff({})} />);
    expect(document.body.textContent).not.toMatch(/Invalid Date/);
    const summary: BenchmarkDiffSummary = { id: 4, timestamp: '', hasChanges: true, addedCount: 1, updatedCount: 0, removedCount: 0, totalEntries: 5, totalAffectedSessions: 0, totalCategoryShifts: 1 };
    expect(describeBenchmarkUpdate(summary)).toBe('Unknown date — 1 added, 1 pace shift');
  });
});

describe('Cached replays at scale', { timeout: 20000 }, () => {
  const pageSize = 5;
  const Harness: React.FC = () => <ReplayCacheCard replay={useReplayCache(null)} replayScanStatus={null} rowsPerPage={pageSize} />;
  const rows = (count: number) => Array.from({ length: count }, (_, i) => ({
    filename: `Track ${String(i).padStart(4, '0')} R1 1.Vcr`, fileSizeBytes: 2 * 1024 ** 4, compressedSizeBytes: 1024 ** 3,
    replayDateMs: Date.UTC(2026, 0, 1) + i * 1000, driversCount: 20, durationSec: 600, trajectoriesCached: 20, replayVersion: 'v7', isOnDisk: i % 2 === 0,
  }));
  const bodyRows = () => screen.getAllByRole('row').length - 1;
  afterEach(() => vi.restoreAllMocks());

  function mockReplays(list: unknown[]) {
    global.fetch = vi.fn().mockImplementation(() => json(list));
  }

  it('draws one page of 2,000 rows and grows by one page, with separators on the totals', async () => {
    mockReplays(rows(2000));
    render(<Harness />);
    await screen.findByRole('region', { name: 'Cached replays' });
    expect(bodyRows()).toBe(pageSize);
    expect(screen.getByText('Showing 5 of 2,000')).toBeInTheDocument();
    expect(screen.getAllByText('2,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2\.00 TB/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }));
    expect(bodyRows()).toBe(2 * pageSize);
    expect(screen.getByText('Showing 10 of 2,000')).toBeInTheDocument();
  });

  it('starts over at one page when the filter changes, and has no button once everything is drawn', async () => {
    mockReplays(rows(12));
    render(<Harness />);
    await screen.findByRole('region', { name: 'Cached replays' });
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }));
    expect(bodyRows()).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(bodyRows()).toBe(12);
    expect(screen.queryByRole('button', { name: /show .* more/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter replays by name'), { target: { value: 'track 0' } });
    expect(bodyRows()).toBeLessThanOrEqual(pageSize);
  });

  it('says "1 replay" in the summary and shows a dash for a missing date, never 1970', async () => {
    mockReplays([{ ...rows(1)[0], replayDateMs: 0, driversCount: undefined, isOnDisk: true }]);
    render(<Harness />);
    await screen.findByRole('region', { name: 'Cached replays' });
    expect(screen.getByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith('1 replay · 1 on disk · 0 kept after LMU deleted them'))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/1970|Invalid Date|NaN|undefined/);
  });

  it('shows no row of zeros for an empty library', async () => {
    mockReplays([]);
    render(<Harness />);
    expect(await screen.findByText(/No replays cached yet/)).toBeInTheDocument();
    expect(screen.queryByText(/0 replays/)).not.toBeInTheDocument();
  });
});

describe('Replay cache requests', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const replayRow = (name: string) => ({ filename: name, fileSizeBytes: 1, compressedSizeBytes: 1, replayDateMs: Date.UTC(2026, 0, 1), driversCount: 1, durationSec: 60, trajectoriesCached: 1, replayVersion: 'v7', isOnDisk: true });

  it('drops a slow earlier answer when a newer request has already been answered', async () => {
    const answers: Array<(value: unknown) => void> = [];
    let cacheCalls = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      cacheCalls += 1;
      if (cacheCalls === 1) return new Promise((resolve) => { answers.push(resolve); });
      return json([replayRow('New Track R1 1.Vcr')]);
    });
    const { result } = renderHook(() => useReplayCache(null));
    await waitFor(() => expect(cacheCalls).toBe(1));
    act(() => { result.current.reload(); });
    await waitFor(() => expect(result.current.replays?.map((r) => r.filename)).toEqual(['New Track R1 1.Vcr']));

    await act(async () => {
      answers[0]({ ok: true, json: () => Promise.resolve([replayRow('Stale A R1 1.Vcr'), replayRow('Stale B R1 1.Vcr')]) });
    });
    expect(result.current.replays?.map((r) => r.filename)).toEqual(['New Track R1 1.Vcr']);
    expect(result.current.isLoading).toBe(false);
  });
});
