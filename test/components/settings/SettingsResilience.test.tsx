import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AISettingsCard } from '../../../src/components/settings/AISettingsCard.js';
import { AiReportsHistoryCard } from '../../../src/components/settings/AiReportsHistoryCard.js';
import { ReferenceChangesList } from '../../../src/components/settings/ReferenceChangesList.js';
import { describeBenchmarkUpdate } from '../../../src/components/settings/ReferenceLaptimesCard.js';
import { ReplayCacheCard } from '../../../src/components/settings/ReplayCacheCard.js';
import { useReplayCache } from '../../../src/components/settings/replays/useReplayCache.js';
import { aiKeyErrorMessage, cleanApiKey } from '../../../src/components/settings/aiKey.js';
import { ApiError } from '../../../src/api/apiClient.js';
import type { BenchmarkDiffSummary, ReferenceBenchmarkDiff } from '../../../shared/types/index.js';

const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const apiFailure = (code: number, body: unknown) => Promise.resolve({ ok: false, status: code, json: () => Promise.resolve(body) });
const idle = { enabled: true, running: false, processed: 0, total: 0, driversDone: 0, driversTotal: 0, currentFile: null, currentStage: null, filePercent: null, startedAt: null, finishedAt: null, result: null, error: null };

const KEY = 'AIzaSyD-secret-key-0123456789';

describe('Gemini key handling', () => {
  const posts: Array<Record<string, unknown>> = [];
  let settingsAnswer: () => Promise<unknown>;

  beforeEach(() => {
    posts.length = 0;
    settingsAnswer = () => json({ configured: true, model: 'gemini-3.7-flash', keySource: 'session' });
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url !== '/api/ai/settings') return json({});
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return settingsAnswer();
      }
      return json({ configured: false, model: 'gemini-3.7-flash', keySource: null });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const keyInput = () => screen.getByLabelText('Gemini API key') as HTMLInputElement;
  const save = () => screen.getByRole('button', { name: /save key/i });
  async function renderLoaded() {
    render(<AISettingsCard />);
    await screen.findByText('Optional · not set up');
  }

  it('trims whitespace, line breaks and quotes from a pasted key before sending it', async () => {
    await renderLoaded();
    fireEvent.change(keyInput(), { target: { value: `  "${KEY}"\n` } });
    fireEvent.click(save());
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].apiKey).toBe(KEY);
  });

  it('leaves no trace of the key in the page after saving', async () => {
    await renderLoaded();
    fireEvent.change(keyInput(), { target: { value: KEY } });
    fireEvent.click(save());
    expect(await screen.findByText('Gemini key is active for this server session.')).toBeInTheDocument();
    expect(keyInput().value).toBe('');
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('does not enable Save for a key that is only whitespace or quotes', async () => {
    await renderLoaded();
    fireEvent.change(keyInput(), { target: { value: ' "" \n' } });
    expect(save()).toBeDisabled();
  });

  it('says a rate limit in plain words and never repeats the key from the server message', async () => {
    settingsAnswer = () => apiFailure(429, { error: `Quota exceeded for key ${KEY}` });
    await renderLoaded();
    fireEvent.change(keyInput(), { target: { value: KEY } });
    fireEvent.click(save());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many requests right now. Wait a minute, then try again.');
    expect(document.body.innerHTML).not.toContain(`Quota exceeded for key ${KEY}`);
  });

  it('removes the key from any other server error and keeps what was typed so it can be fixed', async () => {
    settingsAnswer = () => apiFailure(500, { error: `Invalid key ${KEY} rejected` });
    await renderLoaded();
    fireEvent.change(keyInput(), { target: { value: KEY } });
    fireEvent.click(save());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid key [key hidden] rejected');
    expect(alert.textContent).not.toContain(KEY);
  });

  it('sends one request for a double click and disables Save and Remove while it runs', async () => {
    let finish: (value: unknown) => void = () => {};
    settingsAnswer = () => new Promise((resolve) => { finish = resolve; });
    await renderLoaded();
    fireEvent.change(keyInput(), { target: { value: KEY } });
    fireEvent.click(save());
    fireEvent.click(save());
    expect(posts).toHaveLength(1);
    expect(save()).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove session key/i })).toBeDisabled();
    finish({ ok: true, json: () => Promise.resolve({ configured: true, model: 'gemini-3.7-flash', keySource: 'session' }) });
    await screen.findByText('Ready, key set this session');
  });

  it('returns focus to the Remove button on cancel, and removes only once when confirmed', async () => {
    settingsAnswer = () => json({ configured: false, model: 'gemini-3.7-flash', keySource: null });
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return settingsAnswer();
      }
      return json({ configured: true, model: 'gemini-3.7-flash', keySource: 'session' });
    });
    render(<AISettingsCard />);
    await screen.findByText('Ready, key set this session');
    const trigger = screen.getByRole('button', { name: /remove session key/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /remove session key/i }));

    fireEvent.click(screen.getByRole('button', { name: /remove session key/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    await screen.findByText('Gemini key removed from the server session.');
    expect(posts).toEqual([{ apiKey: '' }]);
  });

  it('offers Retry when the key state cannot be read, and recovers', async () => {
    let healthy = false;
    global.fetch = vi.fn().mockImplementation(() =>
      healthy ? json({ configured: false, model: 'gemini-3.7-flash', keySource: null }) : apiFailure(503, { error: 'Server is starting' })
    );
    render(<AISettingsCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server is starting');
    healthy = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Optional · not set up')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cleans keys and redacts them in messages (unit)', () => {
    expect(cleanApiKey(' “abc def” ')).toBe('abcdef');
    expect(aiKeyErrorMessage(new ApiError('x', 429), KEY, 'f')).toMatch(/Too many requests/);
    expect(aiKeyErrorMessage(new Error(`bad ${KEY}`), KEY, 'f')).toBe('bad [key hidden]');
    expect(aiKeyErrorMessage('odd', KEY, 'Unable to save the key.')).toBe('Unable to save the key.');
  });
});

describe('AI report history', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers Retry on a failed load and explains an empty history in one line', async () => {
    let healthy = false;
    global.fetch = vi.fn().mockImplementation(() => healthy ? json([]) : apiFailure(500, { error: 'Report store offline' }));
    render(<AiReportsHistoryCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Report store offline');
    healthy = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/No AI reports generated yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('never prints Invalid Date or 1970 and gets token plurals right', async () => {
    const base = { model: 'gemini-3.7-flash', lapNumber: 3, replayName: 'Spa R1' };
    global.fetch = vi.fn().mockImplementation(() => json([
      { ...base, cacheKey: 'a', generatedAt: 'not a date', tokensUsed: { total: 1 } },
      { ...base, cacheKey: 'b', generatedAt: 0, tokensUsed: { total: 1500 } },
      { ...base, cacheKey: 'c', generatedAt: 1000, tokensUsed: {} },
    ]));
    render(<AiReportsHistoryCard />);
    expect(await screen.findByText('1 token')).toBeInTheDocument();
    expect(screen.getByText('1,500 tokens')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Invalid Date|1970|NaN|undefined/);
  });
});

describe('Plurals and dates in the benchmark card', () => {
  const diff = (extra: Partial<ReferenceBenchmarkDiff>): ReferenceBenchmarkDiff => ({
    id: 1, timestamp: 'garbage', hasChanges: true, addedCount: 0, updatedCount: 1, removedCount: 0, totalEntries: 1,
    totalAffectedSessions: 1, totalCategoryShifts: 1, added: [], updated: [], removed: [], ...extra,
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
    global.fetch = vi.fn().mockImplementation((url: string) =>
      url.includes('/api/replays/upgrade')
        ? json({ status: idle, currentVersion: 'v7', pendingReplays: 0, pendingDrivers: 0 })
        : json(list));
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
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /^1 replay · 1 on disk · 0 kept after LMU deleted them/.test(el.textContent ?? ''))).toBeInTheDocument();
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
  const Harness: React.FC = () => <ReplayCacheCard replay={useReplayCache(null)} replayScanStatus={null} />;
  const replayRow = (name: string) => ({ filename: name, fileSizeBytes: 1, compressedSizeBytes: 1, replayDateMs: Date.UTC(2026, 0, 1), driversCount: 1, durationSec: 60, trajectoriesCached: 1, replayVersion: 'v7', isOnDisk: true });

  it('drops a slow earlier answer when a newer request has already been answered', async () => {
    const answers: Array<(value: unknown) => void> = [];
    let cacheCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/replays/upgrade')) return json({ status: idle, currentVersion: 'v7', pendingReplays: 0, pendingDrivers: 0 });
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

  it('removes a stuck upgrade bar and stops polling when the server stops answering', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let upgradeCalls = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/replays/upgrade')) {
        upgradeCalls += 1;
        if (upgradeCalls === 1) {
          return json({ status: { ...idle, running: true, processed: 1, total: 4, driversDone: 5, driversTotal: 20, currentFile: 'a.Vcr' }, currentVersion: 'v7', pendingReplays: 1, pendingDrivers: 1 });
        }
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return json([]);
    });
    render(<Harness />);
    expect(await screen.findByTestId('replay-upgrade-running')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    await waitFor(() => expect(screen.queryByTestId('replay-upgrade-running')).not.toBeInTheDocument());
    expect(screen.getByText(/Replay upgrade status unavailable: Failed to fetch/)).toBeInTheDocument();

    const callsAfterFailure = upgradeCalls;
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(upgradeCalls).toBe(callsAfterFailure);
  });
});
