import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useTrackDetailState } from '../../src/components/track-detail/useTrackDetailState';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter initialEntries={['/track/Monza']}>{children}</MemoryRouter>
);

describe('useTrackDetailState', () => {
  const mockTrackData = {
    trackName: 'Autodromo Nazionale Monza',
    normalizedTrackName: 'Monza',
    sessionsCount: 2,
    sessions: [
      {
        id: 'sess-1',
        matchingReplayFile: {
          name: 'Monza_2026.Vcr',
          path: 'C:/replays/Monza_2026.Vcr',
          sizeBytes: 1000,
          modifiedMs: 12345,
        },
      },
      {
        id: 'sess-2',
      },
    ],
    benchmarks: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches track detail data and exposes filtering actions', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTrackData),
      } as Response)
    );

    const { result, rerender } = renderHook(
      ({ carClass }) => useTrackDetailState('Monza', carClass),
      {
        wrapper: Wrapper,
        initialProps: { carClass: 'Hypercar' },
      }
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.trackName).toBe('Autodromo Nazionale Monza');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/track/Monza',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    // Test setters
    act(() => {
      result.current.setSearchQuery('Ferrari');
      result.current.setFilterType('Race');
      result.current.setSortBy('pos-asc');
      result.current.setHideEmpty(false);
      result.current.setSelectedCarModel('Ferrari 499P');
    });

    expect(result.current.searchQuery).toBe('Ferrari');
    expect(result.current.filterType).toBe('Race');
    expect(result.current.sortBy).toBe('pos-asc');
    expect(result.current.hideEmpty).toBe(false);
    expect(result.current.selectedCarModel).toBe('Ferrari 499P');

    // Changing selectedCarClass resets selectedCarModel to 'All'
    rerender({ carClass: 'LMGT3' });
    expect(result.current.selectedCarModel).toBe('All');

    // Test handleOpenReplay
    act(() => {
      result.current.handleOpenReplay('sess-1');
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/telemetry?replayName=Monza_2026.Vcr&lap=1')
    );

    // Opening session without replay does nothing
    mockNavigate.mockClear();
    act(() => {
      result.current.handleOpenReplay('sess-2');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles fetch failure gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.reject(new Error('Network error'))
    );

    const { result } = renderHook(() => useTrackDetailState('UnknownTrack', 'Hypercar'), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
