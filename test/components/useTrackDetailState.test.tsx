import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { useTrackDetailState } from '../../src/components/track-detail/useTrackDetailState';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let updateQuery: (params: URLSearchParams) => void = () => {};

const NavigationBridge: React.FC = () => {
  const [, setSearchParams] = useSearchParams();
  updateQuery = (params) => setSearchParams(params);
  return null;
};

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter initialEntries={['/track/Monza']}>
    <NavigationBridge />
    {children}
  </MemoryRouter>
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
    act(() => result.current.setSearchQuery('Ferrari'));
    await waitFor(() => expect(result.current.searchQuery).toBe('Ferrari'));
    act(() => result.current.setFilterType('Race'));
    await waitFor(() => expect(result.current.filterType).toBe('Race'));
    act(() => result.current.setSortBy('pos-asc'));
    await waitFor(() => expect(result.current.sortBy).toBe('pos-asc'));
    act(() => result.current.setHideEmpty(false));
    await waitFor(() => expect(result.current.hideEmpty).toBe(false));
    act(() => result.current.setSelectedCarModel('Ferrari 499P'));
    await waitFor(() => expect(result.current.selectedCarModel).toBe('Ferrari 499P'));

    // Changing selectedCarClass resets selectedCarModel to 'All'
    rerender({ carClass: 'LMGT3' });
    expect(result.current.selectedCarModel).toBe('All');

    // Test handleOpenReplay
    act(() => {
      result.current.handleOpenReplay('sess-1');
    });
    const replayUrl = new URL(mockNavigate.mock.calls[0][0], 'http://localhost');
    expect(replayUrl.pathname).toBe('/telemetry');
    expect(replayUrl.searchParams.get('replayName')).toBe('Monza_2026.Vcr');
    expect(replayUrl.searchParams.get('lap')).toBe('1');
    expect(replayUrl.searchParams.get('q')).toBe('Ferrari');

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

  it('synchronizes filter state when the route query changes externally', async () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTrackData),
      } as Response)
    );

    const { result } = renderHook(() => useTrackDetailState('Monza', 'Hypercar'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => updateQuery(new URLSearchParams('type=Race&q=Ferrari&sort=pos-asc&hideEmpty=false&hasReplay=true&model=Ferrari%20499P')));

    await waitFor(() => {
      expect(result.current.filterType).toBe('Race');
      expect(result.current.searchQuery).toBe('Ferrari');
      expect(result.current.sortBy).toBe('pos-asc');
      expect(result.current.hideEmpty).toBe(false);
      expect(result.current.hasReplay).toBe(true);
      expect(result.current.selectedCarModel).toBe('Ferrari 499P');
    });
  });

  it('preserves initial car model from URL on initial deep link mount', async () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTrackData),
      } as Response)
    );

    const DeepLinkWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <MemoryRouter initialEntries={['/track/Monza?model=Ferrari%20499P']}>
        {children}
      </MemoryRouter>
    );

    const { result, rerender } = renderHook(
      ({ carClass }) => useTrackDetailState('Monza', carClass),
      {
        wrapper: DeepLinkWrapper,
        initialProps: { carClass: 'Hypercar' },
      }
    );

    expect(result.current.selectedCarModel).toBe('Ferrari 499P');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedCarModel).toBe('Ferrari 499P');

    // Changing car class resets selectedCarModel to 'All'
    rerender({ carClass: 'LMGT3' });
    expect(result.current.selectedCarModel).toBe('All');
  });
});

