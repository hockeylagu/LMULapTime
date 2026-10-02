import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsSidebar } from '../../../src/components/settings/SettingsSidebar.js';
import { SETTINGS_SECTIONS } from '../../../src/components/settings/settingsSections.js';
import { AppStatus } from '../../../shared/types/index.js';

describe('SettingsSidebar component', () => {
  const mockStatus: AppStatus = {
    resultsDir: 'C:\\LMU\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\Replays',
    replaysExist: true,
    telemetryDir: 'C:\\LMU\\Telemetry',
    telemetryExist: true,
    playerName: 'MaxVerstappen',
    sessionsCount: 35,
    tracksCount: 6,
    referenceLaptimes: {
      lastUpdated: '2026-05-28T12:00:00Z',
      entriesCount: 187,
    },
    sqliteCache: {
      enabled: true,
      dbPath: 'C:\\LMU\\lmu_cache.db',
      sessionsCount: 35,
      replaysCount: 12,
      lastSyncedAt: '2026-05-28T12:00:00Z',
      dbSizeBytes: 1048576,
    },
  };

  it('renders search input, table of contents, and system overview', () => {
    const onSelectSection = vi.fn();
    const onSearchChange = vi.fn();

    render(
      <SettingsSidebar
        sections={SETTINGS_SECTIONS}
        activeSectionId="cache-settings"
        onSelectSection={onSelectSection}
        searchQuery=""
        onSearchChange={onSearchChange}
        status={mockStatus}
        totalSectionsCount={SETTINGS_SECTIONS.length}
      />
    );

    expect(screen.getByRole('textbox', { name: /search settings/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /settings table of contents/i })).toBeInTheDocument();

    // Check system overview
    expect(screen.getByText('System Overview')).toBeInTheDocument();
    expect(screen.getAllByText('MaxVerstappen').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('187')).toBeInTheDocument();
  });

  it('handles search input change and clear button click', () => {
    const onSearchChange = vi.fn();

    const { rerender } = render(
      <SettingsSidebar
        sections={SETTINGS_SECTIONS}
        activeSectionId="cache-settings"
        onSelectSection={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
        status={mockStatus}
        totalSectionsCount={SETTINGS_SECTIONS.length}
      />
    );

    const input = screen.getByRole('textbox', { name: /search settings/i });
    fireEvent.change(input, { target: { value: 'replay' } });
    expect(onSearchChange).toHaveBeenCalledWith('replay');

    // Rerender with search query active
    rerender(
      <SettingsSidebar
        sections={[SETTINGS_SECTIONS[1], SETTINGS_SECTIONS[2]]}
        activeSectionId="replay-cache"
        onSelectSection={vi.fn()}
        searchQuery="replay"
        onSearchChange={onSearchChange}
        status={mockStatus}
        totalSectionsCount={SETTINGS_SECTIONS.length}
      />
    );

    expect(screen.getByText(/2 of 6 sections match/i)).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    fireEvent.click(clearBtn);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('calls onSelectSection when clicking a section in the table of contents', () => {
    const onSelectSection = vi.fn();

    render(
      <SettingsSidebar
        sections={SETTINGS_SECTIONS}
        activeSectionId="cache-settings"
        onSelectSection={onSelectSection}
        searchQuery=""
        onSearchChange={vi.fn()}
        status={mockStatus}
        totalSectionsCount={SETTINGS_SECTIONS.length}
      />
    );

    const benchmarkBtn = screen.getByRole('button', { name: /Reference Benchmarks/i });
    fireEvent.click(benchmarkBtn);

    expect(onSelectSection).toHaveBeenCalledWith('reference-benchmarks');
  });
});
