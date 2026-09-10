import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AiReportsHistoryCard } from '../../src/components/settings/AiReportsHistoryCard';

describe('AiReportsHistoryCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty state when no AI reports have been generated', async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });

    render(<AiReportsHistoryCard />);

    await waitFor(() => {
      expect(screen.getByText(/no ai reports generated yet/i)).toBeInTheDocument();
    });
    expect(screen.getByText('0 Cached')).toBeInTheDocument();
  });

  it('renders report history entries with summary, model and tokens used', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve([
        {
          cacheKey: 'key-1',
          replayName: 'Spa_R1.Vcr',
          lapNumber: 5,
          model: 'gemini-3.7-flash',
          overallSummary: 'Brake later into Eau Rouge.',
          tokensUsed: { prompt: 100, completion: 50, total: 150 },
          generatedAt: Date.now(),
        },
      ]),
    });

    render(<AiReportsHistoryCard />);

    await waitFor(() => {
      expect(screen.getByText(/Spa_R1\.Vcr · Lap 5/)).toBeInTheDocument();
    });
    expect(screen.getByText('Brake later into Eau Rouge.')).toBeInTheDocument();
    expect(screen.getByText('gemini-3.7-flash')).toBeInTheDocument();
    expect(screen.getByText('150 tokens')).toBeInTheDocument();
    expect(screen.getByText('1 Cached')).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    render(<AiReportsHistoryCard />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load ai report history/i)).toBeInTheDocument();
    });
  });

  it('reloads the list when the refresh button is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    global.fetch = fetchMock;

    render(<AiReportsHistoryCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/refresh ai report history/i));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
