import React, { useState, useEffect, useMemo } from 'react';
import { Settings as SettingsIcon, Search } from 'lucide-react';
import { AppStatus, ReplayScanStatus, ScanStatus } from '../../../shared/types/index.js';
import { CacheSettingsCard } from './CacheSettingsCard.js';
import { ReferenceLaptimesCard } from './ReferenceLaptimesCard.js';
import { FolderPathsCard } from './FolderPathsCard.js';
import { AISettingsCard } from './AISettingsCard.js';
import { ReplayCacheCard } from './ReplayCacheCard.js';
import { ReplayUpgradeCard } from './ReplayUpgradeCard.js';
import { AiReportsHistoryCard } from './AiReportsHistoryCard.js';
import { SettingsSidebar } from './SettingsSidebar.js';
import { SETTINGS_SECTIONS, matchesSettingsSection } from './settingsSections.js';
import { useSettingsActions } from './useSettingsActions.js';

export interface SettingsProps {
  status: AppStatus | null;
  onUpdatePaths: (resultsDir?: string, replaysDir?: string, telemetryDir?: string) => void;
  replayScanStatus?: ScanStatus | ReplayScanStatus | null;
  onReplayScanTriggered?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ status, onUpdatePaths, replayScanStatus, onReplayScanTriggered }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSectionId, setActiveSectionId] = useState<string>('cache-settings');

  const actions = useSettingsActions({ status, onUpdatePaths, onReplayScanTriggered });

  const sessionScanStatus = replayScanStatus && 'sessionScan' in replayScanStatus
    ? replayScanStatus.sessionScan
    : undefined;

  const matchingSections = useMemo(
    () => SETTINGS_SECTIONS.filter((s) => matchesSettingsSection(s, searchQuery)),
    [searchQuery]
  );

  // Update active section when visible matching sections change
  useEffect(() => {
    if (matchingSections.length > 0 && !matchingSections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(matchingSections[0].id);
    }
  }, [matchingSections, activeSectionId]);

  // Track active section on scroll
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) {
          setActiveSectionId(visible.target.id);
        }
      },
      { rootMargin: '-20px 0px -60% 0px', threshold: 0.1 }
    );

    for (const section of matchingSections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [matchingSections]);

  const handleSelectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderCard = (sectionId: string) => {
    switch (sectionId) {
      case 'cache-settings':
        return (
          <CacheSettingsCard
            status={status}
            isClearingCache={actions.isClearingCache}
            onClearCache={actions.handleClearCache}
            cacheMessage={actions.cacheMessage}
          />
        );
      case 'replay-cache':
        return <ReplayCacheCard replayScanStatus={replayScanStatus} />;
      case 'replay-upgrade':
        return <ReplayUpgradeCard replayScanStatus={replayScanStatus} />;
      case 'ai-settings':
        return <AISettingsCard />;
      case 'ai-history':
        return <AiReportsHistoryCard />;
      case 'reference-benchmarks':
        return (
          <ReferenceLaptimesCard
            status={status}
            isUpdatingLaptimes={actions.isUpdatingLaptimes}
            onUpdateReferenceLaptimes={actions.handleUpdateReferenceLaptimes}
            laptimesMessage={actions.laptimesMessage}
            updateDiff={actions.updateDiff}
          />
        );
      case 'folder-paths':
        return (
          <FolderPathsCard
            status={status}
            resultsDirInput={actions.resultsDirInput}
            setResultsDirInput={actions.setResultsDirInput}
            replaysDirInput={actions.replaysDirInput}
            setReplaysDirInput={actions.setReplaysDirInput}
            telemetryDirInput={actions.telemetryDirInput}
            setTelemetryDirInput={actions.setTelemetryDirInput}
            playerNameInput={actions.playerNameInput}
            setPlayerNameInput={actions.setPlayerNameInput}
            isScanning={actions.isScanning}
            onScanPaths={actions.handleScanPaths}
            pathMessage={actions.pathMessage}
            sessionScanStatus={sessionScanStatus}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-[1500px] mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 bg-lmu-card border border-lmu-border p-6 rounded-2xl">
        <div className="p-3 rounded-xl bg-lmu-accent/10 text-lmu-accent-text border border-lmu-accent/20">
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-white">Application Settings</h2>
          <p className="text-xs text-lmu-muted mt-0.5">
            Manage LMU telemetry log paths, SQLite session database cache, and reference lap time benchmarks
          </p>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Left Sidepanel / Table of Contents */}
        <aside className="lg:sticky lg:top-6 space-y-4">
          <SettingsSidebar
            sections={matchingSections}
            activeSectionId={activeSectionId}
            onSelectSection={handleSelectSection}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            status={status}
            totalSectionsCount={SETTINGS_SECTIONS.length}
          />
        </aside>

        {/* Right Column / Cards List */}
        <div className="space-y-6 min-w-0">
          {searchQuery.trim() && matchingSections.length > 0 && (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-sky-950/30 border border-sky-800/50 text-xs text-sky-200">
              <span>
                Filtering settings by <strong>&quot;{searchQuery}&quot;</strong> ({matchingSections.length} found)
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold underline cursor-pointer"
              >
                Reset Search
              </button>
            </div>
          )}

          {matchingSections.length === 0 ? (
            <div className="bg-lmu-card border border-lmu-border p-12 rounded-2xl text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-700 flex items-center justify-center mx-auto text-lmu-muted">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">No Settings Found</h3>
              <p className="text-xs text-lmu-muted max-w-sm mx-auto">
                No settings match &quot;{searchQuery}&quot;. Try searching for cache, replays, AI, benchmarks, or paths.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-4 py-2 rounded-xl bg-lmu-accent text-white text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : (
            matchingSections.map((section) => (
              <section id={section.id} key={section.id} className="scroll-mt-6">
                {renderCard(section.id)}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
