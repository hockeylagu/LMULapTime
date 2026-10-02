import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsSidebar } from '../../../src/components/settings/SettingsSidebar.js';
import { SETTINGS_SECTIONS, matchesSettingsSection } from '../../../src/components/settings/settingsSections.js';

describe('SettingsSidebar component', () => {
  it('renders search input and table of contents without a system overview', () => {
    const onSelectSection = vi.fn();
    const onSearchChange = vi.fn();

    render(
      <SettingsSidebar
        sections={SETTINGS_SECTIONS}
        activeSectionId="overview"
        onSelectSection={onSelectSection}
        searchQuery=""
        onSearchChange={onSearchChange}
        totalSectionsCount={SETTINGS_SECTIONS.length}
      />
    );

    expect(screen.getByRole('textbox', { name: /search settings/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /settings table of contents/i })).toBeInTheDocument();

    expect(screen.queryByText('System Overview')).not.toBeInTheDocument();
  });

  it('handles search input change and clear button click', () => {
    const onSearchChange = vi.fn();

    const { rerender } = render(
      <SettingsSidebar
        sections={SETTINGS_SECTIONS}
        activeSectionId="overview"
        onSelectSection={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
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
        activeSectionId="overview"
        onSelectSection={onSelectSection}
        searchQuery=""
        onSearchChange={vi.fn()}
        totalSectionsCount={SETTINGS_SECTIONS.length}
      />
    );

    const benchmarkBtn = screen.getByRole('button', { name: /Reference Benchmarks/i });
    fireEvent.click(benchmarkBtn);

    expect(onSelectSection).toHaveBeenCalledWith('reference-benchmarks');
  });
});

describe('settings search for the replay upgrade', () => {
  it.each(['upgrade', 'version', 'outdated', 'archived', 'decode'])('finds Cached Replays by "%s"', (word) => {
    const section = SETTINGS_SECTIONS.find((candidate) => candidate.id === 'replay-cache');
    expect(section && matchesSettingsSection(section, word)).toBe(true);
  });
});
