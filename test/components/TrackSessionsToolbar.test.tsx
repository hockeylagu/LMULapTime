import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackSessionsToolbar } from '../../src/components/track-detail/TrackSessionsToolbar';

describe('TrackSessionsToolbar', () => {
  it('renders all controls and handles interactions', () => {
    const setFilterType = vi.fn();
    const setSearchQuery = vi.fn();
    const setHideEmpty = vi.fn();
    const setHasReplay = vi.fn();
    const setSortBy = vi.fn();

    render(
      <TrackSessionsToolbar
        filterType="All"
        setFilterType={setFilterType}
        searchQuery=""
        setSearchQuery={setSearchQuery}
        hideEmpty={true}
        setHideEmpty={setHideEmpty}
        emptyCount={3}
        hasReplay={false}
        setHasReplay={setHasReplay}
        replayCount={2}
        sortBy="date-desc"
        setSortBy={setSortBy}
      />
    );

    // Search input
    const searchInput = screen.getByPlaceholderText('Search car, file, driver...');
    expect(searchInput).toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: 'Porsche' } });
    expect(setSearchQuery).toHaveBeenCalledWith('Porsche');

    // Hide empty toggle button
    const toggle = screen.getByRole('button', { name: /Hide Empty Sessions/ });
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(setHideEmpty).toHaveBeenCalledWith(false);

    const replayToggle = screen.getByRole('button', { name: /filter sessions with replay/i });
    fireEvent.click(replayToggle);
    expect(setHasReplay).toHaveBeenCalledWith(true);

    // Filter pills (Race button)
    const racePill = screen.getByRole('button', { name: 'Race' });
    fireEvent.click(racePill);
    expect(setFilterType).toHaveBeenCalledWith('Race');

    // Sort dropdown
    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'lap-asc' } });
    expect(setSortBy).toHaveBeenCalledWith('lap-asc');
  });
});
