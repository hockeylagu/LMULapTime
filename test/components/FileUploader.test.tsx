import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploader } from '../../src/components/FileUploader';

describe('FileUploader component', () => {
  const mockStatus = {
    resultsDir: 'C:\\LMU\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\Replays',
    replaysExist: true,
    playerName: 'SimDriver',
    sessionsCount: 12,
    tracksCount: 5,
    referenceLaptimes: {
      lastUpdated: '2026-05-28T12:00:00.000Z',
      entriesCount: 30,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders paths, detected status, and player name', () => {
    render(<FileUploader status={mockStatus} onUpdatePaths={vi.fn()} />);

    expect(screen.getByText('Application Settings')).toBeInTheDocument();
    expect(screen.getByText('30 Benchmarks Cached')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SimDriver')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Results')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Replays')).toBeInTheDocument();
  });

  it('submits path scan form and calls onUpdatePaths', async () => {
    const onUpdatePaths = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, sessionsCount: 15, playerName: 'SimDriver' }),
    });

    render(<FileUploader status={mockStatus} onUpdatePaths={onUpdatePaths} />);

    const scanBtn = screen.getByRole('button', { name: /rescan & load telemetry/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Scanned 15 sessions successfully!/i)).toBeInTheDocument();
    });
    expect(onUpdatePaths).toHaveBeenCalledWith('C:\\LMU\\Results', 'C:\\LMU\\Replays');
  });

  it('triggers reference laptimes update from Google Sheets', async () => {
    const onUpdatePaths = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, entriesCount: 45 }),
    });

    render(<FileUploader status={mockStatus} onUpdatePaths={onUpdatePaths} />);

    const updateBtn = screen.getByRole('button', { name: /update reference laptimes/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Updated 45 benchmark entries/i)).toBeInTheDocument();
    });
    expect(onUpdatePaths).toHaveBeenCalled();
  });
});
