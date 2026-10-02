import React from 'react';
import { Search, X } from 'lucide-react';
import { SettingsSectionDef } from './settingsSections.js';

export interface SettingsSidebarProps {
  sections: SettingsSectionDef[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalSectionsCount: number;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  sections,
  activeSectionId,
  onSelectSection,
  searchQuery,
  onSearchChange,
  totalSectionsCount,
}) => {
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="border-r border-lmu-border/70 pr-5 space-y-5">
      {/* Search Input */}
      <div className="space-y-2">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-lmu-muted absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search settings..."
            aria-label="Search settings"
            className="w-full bg-lmu-card border border-lmu-border rounded-lg pl-9 pr-8 py-2 text-xs text-lmu-text placeholder-lmu-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 p-1 rounded-md text-lmu-muted hover:text-lmu-text hover:bg-lmu-card-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <p aria-live="polite" className="text-[11px] text-lmu-muted px-1 min-h-4">
          {isSearching ? `${sections.length} of ${totalSectionsCount} sections match` : ''}
        </p>
      </div>

      {/* Table of Contents Navigation */}
      <div>
        <nav aria-label="Settings Table of Contents" className="space-y-0.5">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSectionId === section.id;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                aria-current={isActive ? 'location' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text ${
                  isActive
                    ? 'bg-lmu-card text-lmu-text border-l-2 border-lmu-accent'
                    : 'text-lmu-muted hover:text-lmu-text hover:bg-lmu-card/60 border-l-2 border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-lmu-accent-text' : 'text-lmu-muted group-hover:text-lmu-text'
                  }`}
                />
                <span className="truncate flex-1">{section.title}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
