import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AISettingsCard } from '../../../src/components/settings/AISettingsCard.js';

describe('AISettingsCard component', () => {
  const confirmSpy = vi.fn();
  beforeEach(() => {
    confirmSpy.mockReset();
    vi.stubGlobal('confirm', confirmSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and displays initial settings when configured with session key', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/ai/settings') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: true, model: 'gemini-3.7-flash', keySource: 'session' }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    render(<AISettingsCard />);
    await waitFor(() => {
      expect(screen.getByText('Ready, key set this session')).toBeInTheDocument();
    });

    expect(screen.getByText(/AI Lap Reports/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Session Key/i })).not.toBeDisabled();
  });

  it('displays error message when settings loading fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<AISettingsCard />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('saves an API key successfully and resets input', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/ai/settings' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: true, model: 'gemini-3.7-flash', keySource: 'session' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ configured: false, model: 'gemini-3.7-flash', keySource: null }),
      });
    });

    render(<AISettingsCard />);
    await waitFor(() => {
      expect(screen.getByText('Optional · not set up')).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Gemini API key/i);
    fireEvent.change(input, { target: { value: 'AIzaSyTestKey123' } });

    // Model select
    const select = screen.getByLabelText(/Gemini model/i);
    fireEvent.change(select, { target: { value: 'gemini-3.8-flash' } });

    const saveBtn = screen.getByRole('button', { name: /Save Key/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Gemini key is active for this server session.')).toBeInTheDocument();
    });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('handles API key save failure with error message from server', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/ai/settings' && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Invalid API key provided' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ configured: false, model: 'gemini-3.7-flash', keySource: null }),
      });
    });

    render(<AISettingsCard />);
    await waitFor(() => {
      expect(screen.getByText('Optional · not set up')).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Gemini API key/i);
    fireEvent.change(input, { target: { value: 'BadKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Key/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid API key provided')).toBeInTheDocument();
    });
  });

  it('prevents removing environment key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configured: true, model: 'gemini-3.7-flash', keySource: 'environment' }),
    });

    render(<AISettingsCard />);
    await waitFor(() => {
      expect(screen.getByText('Ready, key from the environment')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /Remove Session Key/i });
    expect(removeBtn).toBeDisabled();
  });

  it('removes session key when confirmed', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/ai/settings' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: false, model: 'gemini-3.7-flash', keySource: null }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ configured: true, model: 'gemini-3.7-flash', keySource: 'session' }),
      });
    });

    render(<AISettingsCard />);
    await waitFor(() => {
      expect(screen.getByText('Ready, key set this session')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /Remove Session Key/i });
    fireEvent.click(removeBtn);

    expect(screen.getByText(/turn AI reports off/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));

    await waitFor(() => {
      expect(screen.getByText('Gemini key removed from the server session.')).toBeInTheDocument();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('cancels key removal from the inline confirm without calling the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ configured: true, model: 'gemini-3.7-flash', keySource: 'session' }),
    });
    global.fetch = fetchMock;

    render(<AISettingsCard />);
    await waitFor(() => {
      expect(screen.getByText('Ready, key set this session')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /Remove Session Key/i });
    fireEvent.click(removeBtn);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('button', { name: 'Remove key' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // Only the initial loadSettings
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
