import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserMonitorSetting } from '../../../src/components/settings/BrowserMonitorSetting.js';

const display = '\\\\.\\DISPLAY2';
const settings = { supported: true, monitor: '', monitors: [{ id: display, width: 2560, height: 1440, primary: false }] };
const reply = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) });

describe('browser monitor preference', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads, saves a display, and returns to browser default', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => reply(settings))
      .mockImplementationOnce(() => reply({ ...settings, monitor: display }))
      .mockImplementationOnce(() => reply(settings));
    vi.stubGlobal('fetch', fetchMock);
    render(<BrowserMonitorSetting />);
    const control = screen.getByRole('combobox', { name: 'Browser monitor for tray double-click' });
    await waitFor(() => expect(control).toBeEnabled());
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('option', { name: 'Display 2 · 2560 × 1440' }));
    await waitFor(() => expect(control).toHaveTextContent('Display 2'));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/desktop/browser', expect.objectContaining({ method: 'POST', body: JSON.stringify({ monitor: display }) }));
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('option', { name: 'Browser default' }));
    await waitFor(() => expect(control).toHaveTextContent('Browser default'));
  });

  it('keeps the saved value and shows the API message when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => reply(settings))
      .mockImplementationOnce(() => reply({ error: 'Monitor disconnected' }, false)));
    render(<BrowserMonitorSetting />);
    const control = screen.getByRole('combobox');
    await waitFor(() => expect(control).toBeEnabled());
    fireEvent.click(control);
    fireEvent.click(screen.getByRole('option', { name: 'Display 2 · 2560 × 1440' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Monitor disconnected');
    expect(control).toHaveTextContent('Browser default');
  });

  it('explains a disconnected saved monitor', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ ...settings, monitor: '\\\\.\\DISPLAY9' })));
    render(<BrowserMonitorSetting />);
    expect(await screen.findByText(/The saved monitor is disconnected/)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Display 9 · Disconnected');
  });

  it('hides the preference on unsupported platforms', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply({ supported: false, monitor: '', monitors: [] })));
    const { container } = render(<BrowserMonitorSetting />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
