import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReferenceLaptimesCard } from '../../../src/components/settings/ReferenceLaptimesCard.js';
import type { AppStatus, ReferenceBenchmarkDiff, BenchmarkDiffSummary } from '../../../shared/types/index.js';

describe('ReferenceLaptimesCard component', () => {
  const mockStatus: AppStatus = {
    resultsDir: 'C:\\LMU\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\Replays',
    replaysExist: true,
    sessionsCount: 5,
    tracksCount: 2,
    referenceLaptimes: {
      lastUpdated: '2026-10-01T10:00:00Z',
      entriesCount: 187,
    },
  };

  const mockDiffWithImpact: ReferenceBenchmarkDiff = {
    id: 10,
    timestamp: '2026-10-01T10:00:00Z',
    hasChanges: true,
    addedCount: 1,
    updatedCount: 1,
    removedCount: 0,
    totalEntries: 187,
    totalAffectedSessions: 3,
    totalCategoryShifts: 1,
    added: [
      {
        key: 'cota_gt3',
        trackName: 'Circuit of the Americas',
        carClass: 'LMGT3',
        patch: '1.4+',
        type: 'added',
        newAlienSec: 125.0,
        newAlienTimeString: '2:05.000',
        impact: {
          affectedSessionsCount: 0,
          affectedLapsCount: 0,
          categoryShiftsCount: 0,
          categoryShifts: [],
        },
      },
    ],
    updated: [
      {
        key: 'bahrain_gt3',
        trackName: 'Bahrain',
        carClass: 'LMGT3',
        patch: '1.4+',
        oldPatch: '1.3',
        newPatch: '1.4+',
        type: 'updated',
        oldAlienSec: 120.0,
        newAlienSec: 118.5,
        oldAlienTimeString: '2:00.000',
        newAlienTimeString: '1:58.500',
        diffSec: -1.5,
        impact: {
          affectedSessionsCount: 3,
          affectedLapsCount: 8,
          categoryShiftsCount: 1,
          categoryShifts: [
            {
              driverName: 'ProDriver',
              lapNumber: 4,
              lapTimeSec: 119.2,
              lapTimeString: '1:59.200',
              sessionId: 'session-bahrain-1',
              sessionName: 'FP1 Bahrain',
              oldCategory: 'Alien',
              newCategory: 'Competitive',
            },
          ],
        },
      },
    ],
    removed: [],
  };

  const mockOlderDiff: ReferenceBenchmarkDiff = {
    id: 9,
    timestamp: '2026-09-15T08:00:00Z',
    hasChanges: true,
    addedCount: 0,
    updatedCount: 1,
    removedCount: 0,
    totalEntries: 186,
    totalAffectedSessions: 1,
    totalCategoryShifts: 0,
    added: [],
    updated: [
      {
        key: 'spa_hyper',
        trackName: 'Spa-Francorchamps',
        carClass: 'LMH',
        patch: '1.3',
        type: 'updated',
        oldAlienSec: 118.0,
        newAlienSec: 117.0,
        oldAlienTimeString: '1:58.000',
        newAlienTimeString: '1:57.000',
        diffSec: -1.0,
        impact: {
          affectedSessionsCount: 1,
          affectedLapsCount: 4,
          categoryShiftsCount: 0,
          categoryShifts: [],
        },
      },
    ],
    removed: [],
  };

  const mockHistory: BenchmarkDiffSummary[] = [
    {
      id: 10,
      timestamp: '2026-10-01T10:00:00Z',
      hasChanges: true,
      addedCount: 1,
      updatedCount: 1,
      removedCount: 0,
      totalEntries: 187,
      totalAffectedSessions: 3,
      totalCategoryShifts: 1,
    },
    {
      id: 9,
      timestamp: '2026-09-15T08:00:00Z',
      hasChanges: true,
      addedCount: 0,
      updatedCount: 1,
      removedCount: 0,
      totalEntries: 186,
      totalAffectedSessions: 1,
      totalCategoryShifts: 0,
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/reference-laptimes/diffs/9')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOlderDiff) });
      }
      if (url.includes('/api/reference-laptimes/diffs')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHistory) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  const renderCard = (updateDiff: ReferenceBenchmarkDiff | null = mockDiffWithImpact) =>
    render(
      <ReferenceLaptimesCard
        status={mockStatus}
        isUpdatingLaptimes={false}
        onUpdateReferenceLaptimes={vi.fn()}
        laptimesMessage={null}
        updateDiff={updateDiff}
      />
    );

  const openHistory = async () => {
    const toggle = await screen.findByRole('button', { name: /update history/i });
    fireEvent.click(toggle);
    return screen.findByRole('combobox', { name: /show update/i });
  };

  it('explains the purpose, the pace categories and the status in one line', async () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Reference Benchmarks' })).toBeInTheDocument();
    expect(screen.getByText(/community target lap times/i)).toBeInTheDocument();
    for (const name of ['Alien', 'Competitive', 'Good', 'Midpack', 'Tail-ender', 'Offline']) {
      expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText('187')).toBeInTheDocument();
    expect(screen.getByText('+1 new')).toBeInTheDocument();
    expect(screen.getByText('1 updated')).toBeInTheDocument();
    expect(screen.queryByText(/no changes/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update from the sheet/i })).toBeInTheDocument();
    expect(screen.getByText(/downloads the sheet/i)).toBeInTheDocument();
  });

  it('says "no changes" once when the latest update changed nothing', async () => {
    renderCard({ ...mockDiffWithImpact, hasChanges: false, addedCount: 0, updatedCount: 0, added: [], updated: [], totalAffectedSessions: 0, totalCategoryShifts: 0 });
    expect(screen.getAllByText(/no changes/i)).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: /update history/i }));
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'All 187 targets matched the sheet.')).toBeInTheDocument();
  });

  it('keeps history collapsed until asked, then shows sessions and lap category changes', async () => {
    renderCard();
    const toggle = await screen.findByRole('button', { name: /update history/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('benchmark-diff-section')).not.toBeInTheDocument();

    await openHistory();
    expect(screen.getByText('What changed')).toBeInTheDocument();
    expect(screen.getByText('3 sessions')).toBeInTheDocument();

    const shiftBtn = screen.getByRole('button', { name: /1 lap changed category/i });
    fireEvent.click(shiftBtn);
    expect(screen.getByText('Laps that changed category')).toBeInTheDocument();
    expect(screen.getByText('ProDriver')).toBeInTheDocument();
    expect(screen.getByText('Lap 4')).toBeInTheDocument();
    expect(screen.getByText('(1:59.200)')).toBeInTheDocument();
  });

  it('allows switching to an older update and returning to the latest', async () => {
    renderCard();
    const select = await openHistory();

    fireEvent.change(select, { target: { value: '9' } });

    await waitFor(() => {
      expect(screen.getByText('Spa-Francorchamps')).toBeInTheDocument();
      expect(screen.getByText('1:57.000')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /back to latest update/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /back to latest update/i })).not.toBeInTheDocument();
      expect(screen.getByText('Circuit of the Americas')).toBeInTheDocument();
      expect(screen.getByText('Bahrain')).toBeInTheDocument();
    });
  });
});
