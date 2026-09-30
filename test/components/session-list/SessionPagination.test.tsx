import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useSearchParams } from 'react-router';
import { SessionList, SessionListItem, pageWindow } from '../../../src/components/session-list/index.js';
import { updateSearchParams } from '../../../src/utils/urlParams.js';

const makeSessions = (count: number): SessionListItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `s-${i + 1}`,
    trackVenue: `Track ${i + 1}`,
    timeString: '2026/09/01 12:00',
    sessionType: 'Practice',
    sessionName: 'P1',
    playerDriver: { carType: 'Porsche 963', bestLapTime: 100, bestLapTimeString: '1:40.000', lapsCount: 5 },
  }));

/** A filter control beside the list, so a test can change the URL the way the toolbars do. */
const FilterButton: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  return <button type="button" onClick={() => updateSearchParams(searchParams, setSearchParams, { type: 'Race' })}>Filter</button>;
};

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it('keeps the ends and the neighbours, with gaps between', () => {
    expect(pageWindow(1, 13)).toEqual([1, 2, null, 13]);
    expect(pageWindow(7, 13)).toEqual([1, null, 6, 7, 8, null, 13]);
  });

  it('shows a single hidden page instead of an ellipsis', () => {
    expect(pageWindow(4, 13)).toEqual([1, 2, 3, 4, 5, null, 13]);
  });
});

describe('SessionList pagination', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('shows 25 sessions per page and moves between pages', () => {
    render(<SessionList sessions={makeSessions(60)} onSelectSession={vi.fn()} viewMode="table" onViewModeChange={vi.fn()} hideHeader />);

    expect(screen.getAllByRole('row')).toHaveLength(26); // header + 25
    const pager = screen.getByRole('navigation', { name: 'Session pages' });
    expect(pager).toHaveTextContent('1–25 of 60 sessions');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Track 26')).toBeInTheDocument();
    expect(screen.queryByText('Track 1')).not.toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(within(pager).getByRole('button', { name: 'Page 3' }));
    expect(pager).toHaveTextContent('51–60 of 60 sessions');
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('hides the page buttons when everything fits on one page', () => {
    render(<SessionList sessions={makeSessions(10)} onSelectSession={vi.fn()} viewMode="table" onViewModeChange={vi.fn()} hideHeader />);
    expect(screen.getByRole('navigation', { name: 'Session pages' })).toHaveTextContent('1–10 of 10 sessions');
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('opens on the page in the URL and goes back to page 1 when a filter changes', () => {
    window.location.hash = '#/?page=2';
    render(
      <>
        <FilterButton />
        <SessionList sessions={makeSessions(60)} onSelectSession={vi.fn()} viewMode="table" onViewModeChange={vi.fn()} hideHeader />
      </>
    );

    expect(screen.getByText('Track 26')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByText('Track 1')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Session pages' })).toHaveTextContent('1–25 of 60 sessions');
  });
});
