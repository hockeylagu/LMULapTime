import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Settings } from '../../../src/components/settings/index.js';
import { OverviewCard } from '../../../src/components/settings/OverviewCard.js';
import { FeedbackMessage } from '../../../src/components/settings/SettingsPanel.js';
import type { AppStatus, ScanStatus } from '../../../shared/types/index.js';
import type { ReplayCacheState } from '../../../src/components/settings/replays/useReplayCache.js';
import type { AiSettingsState } from '../../../src/components/settings/hooks/useAiSettings.js';

const status: AppStatus = {
  resultsDir: 'C:\\LMU\\Results',
  resultsExist: true,
  replaysDir: 'C:\\LMU\\Replays',
  replaysExist: true,
  telemetryDir: 'C:\\LMU\\Telemetry',
  telemetryExist: true,
  playerName: 'Player1',
  sessionsCount: 15,
  tracksCount: 5,
};

const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const apiFailure = (code: number, body: unknown) => Promise.resolve({ ok: false, status: code, json: () => Promise.resolve(body) });

interface ScanCall { body: Record<string, unknown> }

/** Settings with every card's request answered; `/api/scan` is handled by `onScan`. */
function mockServer(onScan: (call: ScanCall) => Promise<unknown>) {
  const scans: ScanCall[] = [];
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/scan') {
      const call = { body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> };
      scans.push(call);
      return onScan(call);
    }
    if (url.includes('/api/replays/upgrade')) return json({ pendingReplays: 0, pendingDrivers: 0, status: { running: false, enabled: true } });
    if (url.includes('/api/replays/cache') || url.includes('/api/ai/reports') || url.includes('/diffs')) return json([]);
    if (url.includes('/api/ai/settings')) return json({ configured: false, model: 'gemini-3.7-flash', keySource: null });
    return json({});
  });
  return scans;
}

const settled = () =>
  waitFor(() => expect(within(screen.getByRole('group', { name: 'Settings status' })).getByText('No replays cached yet')).toBeInTheDocument());
const resultsInput = () => screen.getByLabelText('Results logs') as HTMLInputElement;
const rescan = () => screen.getByRole('button', { name: /save changes|scan in progress|saving/i });
const renameDriver = (value = 'Edited Driver') => fireEvent.change(screen.getByLabelText('Driver name'), { target: { value } });

describe('Settings folder paths as people paste them', () => {
  beforeEach(() => {
    window.location.hash = '#/settings';
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('sends trimmed, unquoted, backslashed paths and shows the saved form back in the fields', async () => {
    const scans = mockServer(() => json({ success: true, playerName: 'Zoë' }));
    const onUpdatePaths = vi.fn();
    render(<Settings status={status} onUpdatePaths={onUpdatePaths} />);
    await settled();

    fireEvent.change(resultsInput(), { target: { value: '  "D:/Users/José Núñez/OneDrive - Équipe/LMU/Results/"  ' } });
    fireEvent.change(screen.getByLabelText('Driver name'), { target: { value: '   Zoë   ' } });
    fireEvent.click(rescan());

    await waitFor(() => expect(scans).toHaveLength(1));
    expect(scans[0].body).toMatchObject({
      resultsDir: 'D:\\Users\\José Núñez\\OneDrive - Équipe\\LMU\\Results',
      replaysDir: 'C:\\LMU\\Replays',
      playerName: 'Zoë',
    });
    await waitFor(() => expect(resultsInput().value).toBe('D:\\Users\\José Núñez\\OneDrive - Équipe\\LMU\\Results'));
    expect(onUpdatePaths).toHaveBeenCalledWith('D:\\Users\\José Núñez\\OneDrive - Équipe\\LMU\\Results', 'C:\\LMU\\Replays', 'C:\\LMU\\Telemetry');
  });

  it('shows a malformed path under its field, keeps what was typed, focuses it and sends nothing', async () => {
    const scans = mockServer(() => json({ success: true }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();

    fireEvent.change(resultsInput(), { target: { value: 'C:\\LMU\\Re*sults' } });
    fireEvent.click(rescan());

    const message = await screen.findByText(/characters Windows does not allow/i);
    expect(message.closest('p')).toHaveAttribute('id', 'results-dir-error');
    expect(resultsInput()).toHaveAttribute('aria-invalid', 'true');
    expect(resultsInput()).toHaveAttribute('aria-describedby', 'results-dir-error');
    expect(resultsInput().value).toBe('C:\\LMU\\Re*sults');
    expect(document.activeElement).toBe(resultsInput());
    expect(scans).toHaveLength(0);

    // Typing again clears that field's error.
    fireEvent.change(resultsInput(), { target: { value: 'C:\\LMU\\Results' } });
    expect(screen.queryByText(/characters Windows does not allow/i)).not.toBeInTheDocument();
  });

  it('puts the server\'s folder error under the field it names and keeps the typed value', async () => {
    mockServer(() => apiFailure(400, { error: 'The replays folder was not found: D:\\Nope', field: 'replaysDir' }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();

    const replays = screen.getByLabelText('Replays') as HTMLInputElement;
    fireEvent.change(replays, { target: { value: 'D:\\Nope\\' } });
    fireEvent.click(rescan());

    expect(await screen.findByText('The replays folder was not found: D:\\Nope')).toBeInTheDocument();
    expect(replays.value).toBe('D:\\Nope\\');
    expect(replays).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps long paths in the field with the full value available', async () => {
    mockServer(() => json({ success: true }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();
    const longPath = `C:\\${'Very Long Folder Name\\'.repeat(20)}Results`;
    fireEvent.change(resultsInput(), { target: { value: longPath } });
    expect(resultsInput()).toHaveAttribute('title', longPath);
    expect(resultsInput().className).toContain('min-w-0');
  });
});

describe('Settings save concurrency', () => {
  beforeEach(() => {
    window.location.hash = '#/settings';
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('sends one scan for a double click and disables the button until the answer arrives', async () => {
    let finish: (value: unknown) => void = () => {};
    const scans = mockServer(() => new Promise((resolve) => { finish = resolve; }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();
    renameDriver();

    const form = rescan().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(scans).toHaveLength(1);
    expect(rescan()).toBeDisabled();

    finish({ ok: true, json: () => Promise.resolve({ success: true, playerName: 'Player1' }) });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Scanning sessions/));
    expect(scans).toHaveLength(1);
  });

  it('cannot start a rescan or a cache clear while the server is already scanning', async () => {
    const scans = mockServer(() => json({ success: true }));
    const running = {
      running: true, processed: 1, total: 4,
      sessionScan: { running: false },
    } as unknown as ScanStatus;
    render(<Settings status={status} onUpdatePaths={vi.fn()} replayScanStatus={running} />);
    renameDriver();

    expect(rescan()).toBeDisabled();
    expect(rescan()).toHaveTextContent('Scan in progress');
    fireEvent.submit(rescan().closest('form') as HTMLFormElement);
    expect(scans).toHaveLength(0);
    expect(screen.getByRole('button', { name: /clear parsed sessions/i })).toBeDisabled();
  });
});

describe('Settings save and discard', () => {
  beforeEach(() => {
    window.location.hash = '#/settings';
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('shows no save button until a field differs from the saved value, and Discard restores them', async () => {
    mockServer(() => json({ success: true }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /discard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rescan/i })).not.toBeInTheDocument();

    fireEvent.change(resultsInput(), { target: { value: 'D:\\Other' } });
    renameDriver();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    expect(resultsInput().value).toBe('C:\\LMU\\Results');
    expect((screen.getByLabelText('Driver name') as HTMLInputElement).value).toBe('Player1');
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('submits with Enter from a field', async () => {
    const scans = mockServer(() => json({ success: true }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();
    renameDriver();
    fireEvent.submit(screen.getByLabelText('Driver name').closest('form') as HTMLFormElement);
    await waitFor(() => expect(scans).toHaveLength(1));
    expect(scans[0].body.playerName).toBe('Edited Driver');
  });
});

describe('Settings driver name', () => {
  beforeEach(() => {
    window.location.hash = '#/settings';
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('caps the length, strips line breaks, and says what an empty name does', async () => {
    const scans = mockServer(() => json({ success: true }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();
    const name = screen.getByLabelText('Driver name');
    expect(name).toHaveAttribute('maxlength', '64');

    fireEvent.change(name, { target: { value: '  D\u2019Arcy \u{1F3CE}\n' } });
    fireEvent.click(rescan());
    await waitFor(() => expect(scans).toHaveLength(1));
    expect(scans[0].body.playerName).toBe('D\u2019Arcy \u{1F3CE}');

    fireEvent.change(name, { target: { value: '   ' } });
    expect(screen.getByText(/Empty: the name from LMU's settings is used/)).toBeInTheDocument();
  });

  it('wraps a very long driver name in the result message instead of widening the card', async () => {
    mockServer(() => json({ success: true, playerName: 'W'.repeat(80) }));
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    await settled();
    renameDriver('W'.repeat(80));
    fireEvent.click(rescan());
    const message = await screen.findByText(/Scanning sessions, replays and telemetry/);
    expect(message).toHaveClass('break-words');
    expect(message.closest('[role="status"]')).toHaveClass('min-w-0');
  });
});

describe('Overview card', () => {
  const replay = { counts: { total: 1234, archived: 1 } } as unknown as ReplayCacheState;
  const ai = { settings: null, loadError: null } as unknown as AiSettingsState;
  const cacheStatus = (telemetryFilesCount?: number, sessions = 3): AppStatus => ({
    ...status,
    sessionsCount: sessions,
    sqliteCache: { enabled: true, dbPath: 'x.db', sessionsCount: sessions, lastSyncedAt: null, dbSizeBytes: 1024, telemetryFilesCount },
  });
  const renderCard = (appStatus: AppStatus | null, extra: Partial<React.ComponentProps<typeof OverviewCard>> = {}) =>
    render(<OverviewCard status={appStatus} replay={replay} ai={ai} isClearingCache={false} onClearCache={vi.fn()} cacheMessage={null} {...extra} />);
  const strip = () => screen.getByRole('group', { name: 'Settings status' });

  it('shows the telemetry files total with thousands separators, in the same readout style as the others', () => {
    renderCard(cacheStatus(12345));
    const value = within(strip()).getByText('12,345');
    expect(within(strip()).getByText('Telemetry files')).toHaveClass('uppercase');
    expect(value).toHaveClass('font-mono');
    expect(within(strip()).getByText('Telemetry files').nextElementSibling).toBe(value);
    expect(within(strip()).getByText('1,234')).toBeInTheDocument();
  });

  it('shows a dash when the telemetry count is unknown and says so in words when there are none', () => {
    const { unmount } = renderCard(cacheStatus(undefined));
    const label = within(strip()).getByText('Telemetry files');
    expect(label.nextElementSibling).toHaveTextContent('—');
    unmount();

    renderCard(cacheStatus(0, 0));
    expect(within(strip()).getByText('No telemetry cached yet')).toBeInTheDocument();
    expect(within(strip()).getByText('No sessions parsed yet')).toBeInTheDocument();
    expect(screen.getByText(/nothing to clear/i)).toBeInTheDocument();
  });

  it('returns focus to the clear button after Cancel and after Escape', () => {
    renderCard(cacheStatus(2));
    const trigger = () => screen.getByRole('button', { name: /clear parsed sessions/i });

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(trigger());

    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole('group', { name: /confirm clearing/i }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: /confirm clearing/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it('moves focus to the section heading when the confirmed action leaves the button disabled', () => {
    const onClear = vi.fn();
    const { rerender } = renderCard(cacheStatus(2), { onClearCache: onClear });
    fireEvent.click(screen.getByRole('button', { name: /clear parsed sessions/i }));
    onClear.mockImplementation(() => {
      rerender(<OverviewCard status={cacheStatus(2)} replay={replay} ai={ai} isClearingCache={true} onClearCache={onClear} cacheMessage={null} />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /clearing/i })).toBeDisabled();
    expect(document.activeElement).toBe(document.getElementById('overview-heading'));
  });
});

describe('Action feedback live regions', () => {
  it('announces a failure as an alert and a success as a status, each once', () => {
    const { rerender } = render(<FeedbackMessage feedback={{ tone: 'error', text: 'Scan failed' }} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<FeedbackMessage feedback={{ tone: 'ok', text: 'Saved' }} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
