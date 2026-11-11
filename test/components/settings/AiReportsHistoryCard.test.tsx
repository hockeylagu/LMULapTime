import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AiReportsHistorySection } from '../../../src/components/settings/AiReportsHistoryCard.js';

describe('AiReportsHistoryCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders report history entries with summary, model and tokens used', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          cacheKey: 'key-1',
          sessionId: 'spa-session', driverOrdinal: 0, lapOrdinal: 4,
          lapNumber: 5,
          model: 'gemini-3.8-flash',
          overallSummary: 'Brake later into Eau Rouge.',
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
          generatedAt: Date.now(),
        },
      ]),
    });

    render(<AiReportsHistorySection defaultOpen />);

    await waitFor(() => {
      expect(screen.getByText(/spa-session · Lap 5/)).toBeInTheDocument();
    });
    expect(screen.getByText('Brake later into Eau Rouge.')).toBeInTheDocument();
    expect(screen.getByText('gemini-3.8-flash')).toBeInTheDocument();
    expect(screen.getByText('150 tokens')).toBeInTheDocument();
    expect(screen.getByText('1 cached')).toBeInTheDocument();
  });

  it('reloads the list when the refresh button is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    global.fetch = fetchMock;

    render(<AiReportsHistorySection defaultOpen />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/refresh ai report history/i));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('toggles collapse and expand when the header button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          cacheKey: 'key-1',
          sessionId: 'spa-session',
          lapNumber: 5,
          model: 'gemini-3.8-flash',
          overallSummary: 'Brake later into Eau Rouge.',
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
          generatedAt: Date.now(),
        },
      ]),
    });

    render(<AiReportsHistorySection />);
    const toggle = screen.getByRole('button', { name: /^report history$/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Brake later into Eau Rouge.')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Brake later into Eau Rouge.')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Brake later into Eau Rouge.')).not.toBeInTheDocument();
  });
});
