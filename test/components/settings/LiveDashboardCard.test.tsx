import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveDashboardCard } from '../../../src/components/settings/LiveDashboardCard.js';

const reply = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

describe('LiveDashboardCard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the setting and saves the toggle', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      reply(init?.method === 'POST' ? JSON.parse(String(init.body)) : { autoOpen: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LiveDashboardCard />);
    const toggle = await screen.findByRole('checkbox', { name: 'Switch the open app to the live dashboard when LMU starts' });
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/live/settings', expect.objectContaining({ method: 'POST', body: '{"autoOpen":false}' }));
  });

  it('shows the server message when the setting cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => reply({ error: 'Live service is down' }, false)));
    render(<LiveDashboardCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Live service is down');
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
