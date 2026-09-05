import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReplaysView } from '../../src/components/replays/ReplaysView';

describe('ReplaysView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockReplays = [
    {
      name: 'Spa P1 1.vcr',
      path: 'C:\\LMU\\UserData\\Replays\\Spa P1 1.vcr',
      sizeBytes: 15000000,
      mtime: Date.now() - 10000,
      trackName: 'Spa-Francorchamps',
      eventTitle: 'LMGT3 Fixed',
      splitNo: 2,
      durationSec: 300,
      driversCount: 20,
      matchedSessionId: 'sess-spa-123',
    },
    {
      name: 'Monza R1 1.vcr',
      path: 'C:\\LMU\\UserData\\Replays\\Monza R1 1.vcr',
      sizeBytes: 25000000,
      mtime: Date.now() - 20000,
      trackName: 'Autodromo Nazionale Monza',
      eventTitle: 'Hypercar Sprint',
      durationSec: 600,
      driversCount: 25,
      matchedSessionId: undefined,
    },
  ];

  it('renders replay cards with track and event details', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockReplays) })
    );

    render(<ReplaysView onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Spa-Francorchamps/i)).toBeInTheDocument();
      expect(screen.getByText(/Autodromo Nazionale Monza/i)).toBeInTheDocument();
      expect(screen.getByText(/LMGT3 Fixed/i)).toBeInTheDocument();
      expect(screen.getByText(/Hypercar Sprint/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Linked Log/i)).toBeInTheDocument();
    expect(screen.getByText(/Replay Only/i)).toBeInTheDocument();
  });

  it('filters replays by search query', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockReplays) })
    );

    render(<ReplaysView onSelectSession={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Spa-Francorchamps/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search replays by circuit/i);
    fireEvent.change(searchInput, { target: { value: 'Monza' } });

    expect(screen.queryByText(/Spa-Francorchamps/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Autodromo Nazionale Monza/i)).toBeInTheDocument();
  });

  it('navigates to session when linked session button clicked', async () => {
    const handleSelectSession = vi.fn();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockReplays) })
    );

    render(<ReplaysView onSelectSession={handleSelectSession} />);

    await waitFor(() => {
      expect(screen.getByTitle(/Open correlated XML session telemetry/i)).toBeInTheDocument();
    });

    const linkBtn = screen.getByTitle(/Open correlated XML session telemetry/i);
    fireEvent.click(linkBtn);

    expect(handleSelectSession).toHaveBeenCalledWith('sess-spa-123');
  });
});
