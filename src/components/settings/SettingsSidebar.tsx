import React from 'react';
import { Search, X, User, HardDrive, Database } from 'lucide-react';
import { AppStatus } from '../../../shared/types/index.js';
import { SettingsSectionDef } from './settingsSections.js';

export interface SettingsSidebarProps {
  sections: SettingsSectionDef[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  status: AppStatus | null;
  totalSectionsCount: number;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  sections,
  activeSectionId,
  onSelectSection,
  searchQuery,
  onSearchChange,
  status,
  totalSectionsCount,
}) => {
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="bg-lmu-card border border-lmu-border rounded-2xl p-4 space-y-5">
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
            className="w-full bg-lmu-bg border border-lmu-border rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent focus:ring-1 focus:ring-lmu-accent transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 p-1 rounded-md text-lmu-muted hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isSearching && (
          <div className="flex items-center justify-between text-[11px] text-lmu-muted px-1">
            <span>
              {sections.length} of {totalSectionsCount} sections match
            </span>
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="text-lmu-accent-text hover:underline text-[11px]"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Table of Contents Navigation */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-2 text-[11px] font-bold uppercase tracking-wider text-lmu-muted">
          <span>Table of Contents</span>
          <span className="font-mono text-[10px] text-lmu-muted/70">{sections.length} sections</span>
        </div>

        <nav aria-label="Settings Table of Contents" className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSectionId === section.id;
            const badge = section.getBadge ? section.getBadge(status) : undefined;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left group ${
                  isActive
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30 shadow-sm'
                    : 'text-lmu-muted hover:text-white hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-sky-400' : 'text-lmu-muted group-hover:text-white'
                  }`}
                />
                <span className="truncate flex-1">{section.title}</span>
                {badge && (
                  <span
                    className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border truncate max-w-[85px] ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                        : 'bg-lmu-bg text-lmu-muted border-lmu-border'
                    }`}
                    title={badge}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* System Overview Footer */}
      <div className="pt-3 border-t border-lmu-border/50 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-lmu-muted px-1">
          System Overview
        </div>
        <div className="bg-lmu-bg rounded-xl border border-lmu-border p-2.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-lmu-muted flex items-center gap-1.5">
              <User className="w-3 h-3 text-lmu-accent-text" /> Driver
            </span>
            <span className="font-mono text-white font-medium truncate max-w-[120px]">
              {status?.playerName || '—'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-lmu-muted flex items-center gap-1.5">
              <Database className="w-3 h-3 text-lmu-gold" /> Sessions
            </span>
            <span className="font-mono text-white font-semibold">
              {status?.sqliteCache?.sessionsCount ?? status?.sessionsCount ?? 0}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-lmu-muted flex items-center gap-1.5">
              <HardDrive className="w-3 h-3 text-lmu-cyan" /> Benchmarks
            </span>
            <span className="font-mono text-white font-semibold">
              {status?.referenceLaptimes?.entriesCount ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
