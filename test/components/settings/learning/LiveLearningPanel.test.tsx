import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveLearningPanel } from '../../../../src/components/settings/learning/LiveLearningPanel.js';
import { learningReadinessFixture } from './fixture.js';

afterEach(() => vi.unstubAllGlobals());

describe('learning evidence status', () => {
  it('distinguishes available corrections from the server disable switch', async () => {
    const report = learningReadinessFixture();
    report.automaticLearning = { enabled: true, active: 2, validating: 1 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => report })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...report, automaticLearning: { ...report.automaticLearning, enabled: false } }) }));
    render(<LiveLearningPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check evidence' }));
    await waitFor(() => expect(screen.getByText(/2 validated corrections available · 1 awaiting fresh sessions/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByText('Automatic corrections are disabled by server configuration.')).toBeInTheDocument());
  });
  it('waits for a manual request and shows resource-isolated readiness and readable exclusions', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => learningReadinessFixture() }));
    vi.stubGlobal('fetch', fetch);
    render(<LiveLearningPanel />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check evidence' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('100 usable measurements'));
    const fuel = screen.getByRole('row', { name: /Fuel 60 40/ });
    expect(within(fuel).getByText(/Need more evidence/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Virtual energy 0 0 No eligible evidence/ })).toBeInTheDocument();
    expect(screen.getByText('Lap is not clean and representative')).toBeInTheDocument();
    expect(screen.getByText('No forecast was recorded at lap start')).toBeInTheDocument();
    expect(screen.getByText(/0 validated corrections available/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/live/learning', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) as unknown }));
    fireEvent.click(screen.getByText('Minimum evidence and offline checks'));
    expect(screen.getByText(/Too few earlier sessions/)).toBeVisible();
  });

  it('shows deferred work and does not poll or retain a previous result when refreshing during driving', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => learningReadinessFixture() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'deferred', historicalCorrectionsEnabled: false, message: 'Leave the session to check evidence.' }) });
    vi.stubGlobal('fetch', fetch); render(<LiveLearningPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check evidence' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('100 usable measurements'));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Leave the session to check evidence.'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces API errors with a retry and cancels the current request on unmount', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'Evidence reader is busy.' }) })
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
    vi.stubGlobal('fetch', fetch); const view = render(<LiveLearningPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check evidence' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Evidence reader is busy.');
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Checking evidence…' })).toBeDisabled());
    const signal = (fetch.mock.calls[1][1] as RequestInit).signal;
    view.unmount(); expect(signal?.aborted).toBe(true);
  });

  it('explains empty evidence without implying that a model is ready', async () => {
    const fixture = learningReadinessFixture();
    fixture.dataset = { currentExamples: 0, eligible: 0, excluded: 0, exclusions: {} };
    fixture.processing = { current: 0, pending: 0 };
    fixture.captures = { indexed: 0, verified: 0, unavailable: 0 };
    fixture.resources = fixture.resources.map(resource => ({ ...resource, trainingExamples: 0, heldOutExamples: 0,
      passingCohorts: 0, rejectedCohorts: 0, insufficientCohorts: 0, gates: {} }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fixture })));
    render(<LiveLearningPanel />); fireEvent.click(screen.getByRole('button', { name: 'Check evidence' }));
    expect(await screen.findByText(/New clean laps with recorded lap-start forecasts are needed/)).toBeInTheDocument();
    expect(screen.getAllByText('No eligible evidence')).toHaveLength(2);
  });
});
