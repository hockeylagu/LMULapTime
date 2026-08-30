import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploader } from '../../src/components/FileUploader';

describe('FileUploader component', () => {
  const mockStatus = {
    resultsDir: 'C:\\LMU\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\Replays',
    replaysExist: true,
    playerName: 'Player1',
    sessionsCount: 15,
    tracksCount: 5,
    referenceLaptimes: {
      lastUpdated: '2026-05-28T12:00:00Z',
      entriesCount: 186,
    },
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/scan')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, count: 20, tracksCount: 5 }) });
      }
      if (url.includes('/api/reference-laptimes/refresh')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, entriesCount: 190 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders directory paths, status indicators, and scans directories on submit', async () => {
    const onUpdatePaths = vi.fn();
    render(<FileUploader status={mockStatus} onUpdatePaths={onUpdatePaths} />);

    expect(screen.getByText('Application Settings')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Results')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Replays')).toBeInTheDocument();

    const playerNameInput = screen.getByDisplayValue('Player1');
    fireEvent.change(playerNameInput, { target: { value: 'NewDriver' } });

    const scanBtn = screen.getByRole('button', { name: /rescan & load telemetry/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(onUpdatePaths).toHaveBeenCalled();
    });
  });

  it('handles reference laptimes manual refresh button click', async () => {
    const onUpdatePaths = vi.fn();
    render(<FileUploader status={mockStatus} onUpdatePaths={onUpdatePaths} />);

    expect(screen.getByText('Reference Laptimes Benchmark')).toBeInTheDocument();

    const refreshBtn = screen.getByRole('button', { name: /update reference laptimes/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/Updated 190 benchmark entries from Google Sheets!/i)).toBeInTheDocument();
      expect(onUpdatePaths).toHaveBeenCalled();
    });
  });

  it('displays error notification when scan fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/scan')) {
        return Promise.reject(new Error('Network failure during scan'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<FileUploader status={mockStatus} onUpdatePaths={vi.fn()} />);

    expect(screen.getByText('Application Settings')).toBeInTheDocument();

    const scanBtn = screen.getByRole('button', { name: /rescan & load telemetry/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Network failure during scan/i)).toBeInTheDocument();
    });
  });
});
