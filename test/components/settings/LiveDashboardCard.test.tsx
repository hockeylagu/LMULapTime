import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveDashboardCard } from '../../../src/components/settings/LiveDashboardCard.js';
import { requestBody } from '../../fixtures/requestUrl.js';

const reply = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

describe('LiveDashboardCard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the setting and saves the toggle', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      reply(init?.method === 'POST' ? JSON.parse(requestBody(init.body)) : { autoOpen: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LiveDashboardCard />);
    const toggle = await screen.findByRole('checkbox', { name: 'Switch the open app to the live dashboard when LMU starts' });
    await waitFor(() => expect(toggle).toBeChecked());
    expect(screen.getByRole('link', { name: 'Open demo' })).toHaveAttribute('href', '#/live?demo=1');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/live/settings', expect.objectContaining({ method: 'POST', body: '{"autoOpen":false}' }));
  });

  it('loads and saves the shared pedal trace duration', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => reply({ autoOpen: true, reserveSeconds: 45, pedalTraceSeconds: 30,
      ...(init?.method === 'POST' ? JSON.parse(requestBody(init.body)) as Record<string, unknown> : {}) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LiveDashboardCard />);
    const duration = await screen.findByRole('combobox', { name: 'Pedal trace history' });
    fireEvent.click(duration);
    expect(screen.getByRole('option', { name: '25 seconds' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: '60 seconds' }));
    await waitFor(() => expect(duration).toHaveTextContent('60 seconds'));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/live/settings', expect.objectContaining({ method: 'POST', body: '{"pedalTraceSeconds":60}' }));
  });

  it('loads and saves the diagnostics setting, off by default', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => reply({ autoOpen: true, reserveSeconds: 45, pedalTraceSeconds: 30, diagnostics: false,
      ...(init?.method === 'POST' ? JSON.parse(requestBody(init.body)) as Record<string, unknown> : {}) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LiveDashboardCard />);
    const toggle = await screen.findByRole('checkbox', { name: 'Write a diagnostic file with each recording' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/live/settings', expect.objectContaining({ method: 'POST', body: '{"diagnostics":true}' }));
  });

  it('shows the server message when the setting cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => reply({ error: 'Live service is down' }, false)));
    render(<LiveDashboardCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Live service is down');
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Open demo' })).toHaveAttribute('href', '#/live?demo=1');
  });
});
