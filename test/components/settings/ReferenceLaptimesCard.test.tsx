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

  it('renders benchmark stats, affected sessions badge, and expands category shifts', async () => {
    render(
      <ReferenceLaptimesCard
        status={mockStatus}
        isUpdatingLaptimes={false}
        onUpdateReferenceLaptimes={vi.fn()}
        laptimesMessage={null}
        updateDiff={mockDiffWithImpact}
      />
    );

    // Wait for history load
    await screen.findByRole('combobox', { name: /benchmark update history version/i });

    expect(screen.getByText('Reference Lap Time Benchmarks')).toBeInTheDocument();
    expect(screen.getByText('187 Benchmarks Cached')).toBeInTheDocument();
    expect(screen.getByText('3 Sessions Driven')).toBeInTheDocument();
    expect(screen.getByText('1 Category Shift')).toBeInTheDocument();

    // Check affected sessions badge on row
    expect(screen.getByText('3 sessions')).toBeInTheDocument();

    // Check category shift button and click to expand
    const shiftBtn = screen.getByRole('button', { name: /1 shift/i });
    expect(shiftBtn).toBeInTheDocument();

    fireEvent.click(shiftBtn);

    expect(screen.getByText('Pace Category Shifts')).toBeInTheDocument();
    expect(screen.getByText('ProDriver')).toBeInTheDocument();
    expect(screen.getByText('Lap 4')).toBeInTheDocument();
    expect(screen.getByText('(1:59.200)')).toBeInTheDocument();
    expect(screen.getAllByText('Alien').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Competitive').length).toBeGreaterThanOrEqual(2);
  });

  it('allows switching to older diff snapshots and returning to latest', async () => {
    render(
      <ReferenceLaptimesCard
        status={mockStatus}
        isUpdatingLaptimes={false}
        onUpdateReferenceLaptimes={vi.fn()}
        laptimesMessage={null}
        updateDiff={mockDiffWithImpact}
      />
    );

    // Wait for history to load into select dropdown
    const select = await screen.findByRole('combobox', { name: /benchmark update history version/i });
    expect(select).toBeInTheDocument();

    // Select older snapshot (id 9)
    fireEvent.change(select, { target: { value: '9' } });

    await waitFor(() => {
      expect(screen.getByText(/Viewing historical benchmark snapshot from/i)).toBeInTheDocument();
      expect(screen.getByText('Spa-Francorchamps')).toBeInTheDocument();
      expect(screen.getByText('1:57.000')).toBeInTheDocument();
    });

    // Return to latest via banner button
    const returnBtn = screen.getByRole('button', { name: /return to latest/i });
    fireEvent.click(returnBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Viewing historical benchmark snapshot/i)).not.toBeInTheDocument();
      expect(screen.getByText('Circuit of the Americas')).toBeInTheDocument();
      expect(screen.getByText('Bahrain')).toBeInTheDocument();
    });
  });
});
