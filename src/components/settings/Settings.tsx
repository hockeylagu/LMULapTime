import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertCircle, Search } from 'lucide-react';
import { AppStatus, ReplayScanStatus, ScanStatus } from '../../../shared/types/index.js';
import { updateSearchParams } from '../../utils/urlParams.js';
import { CacheSettingsCard } from './CacheSettingsCard.js';
import { ReferenceLaptimesCard } from './ReferenceLaptimesCard.js';
import { FolderPathsCard } from './FolderPathsCard.js';
import { AISettingsCard } from './AISettingsCard.js';
import { ReplayCacheCard } from './ReplayCacheCard.js';
import { AiReportsHistoryCard } from './AiReportsHistoryCard.js';
import { SettingsSidebar } from './SettingsSidebar.js';
import {
  SETTINGS_SECTIONS,
  getMissingPaths,
  matchesSettingsSection,
  orderSettingsSections,
} from './settingsSections.js';
import { useSettingsActions } from './useSettingsActions.js';
import { useSettingsScrollspy } from './useSettingsScrollspy.js';

export interface SettingsProps {
  status: AppStatus | null;
  onUpdatePaths: (resultsDir?: string, replaysDir?: string, telemetryDir?: string) => void;
  replayScanStatus?: ScanStatus | ReplayScanStatus | null;
  onReplayScanTriggered?: () => void;
}

function scrollBehavior(): ScrollBehavior {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'auto' : 'smooth';
}

export const Settings: React.FC<SettingsProps> = ({ status, onUpdatePaths, replayScanStatus, onReplayScanTriggered }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();

  const actions = useSettingsActions({ status, onUpdatePaths, onReplayScanTriggered });

  const sessionScanStatus = replayScanStatus && 'sessionScan' in replayScanStatus
    ? replayScanStatus.sessionScan
    : undefined;

  const missingPaths = getMissingPaths(status);
  const setupNeeded = missingPaths.length > 0;

  const matchingSections = useMemo(
    () => orderSettingsSections(SETTINGS_SECTIONS, setupNeeded).filter((s) => matchesSettingsSection(s, searchQuery)),
    [searchQuery, setupNeeded]
  );

  const { activeId: activeSectionId, pin } = useSettingsScrollspy(matchingSections.map((s) => s.id));

  const goToSection = (sectionId: string, updateUrl: boolean) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    pin(sectionId);
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    document.getElementById(`${sectionId}-heading`)?.focus({ preventScroll: true });
    if (updateUrl) updateSearchParams(searchParams, setSearchParams, { section: sectionId });
  };

  // Open on the section named by ?section=<id>.
  useEffect(() => {
    const requested = searchParams.get('section');
    if (requested && SETTINGS_SECTIONS.some((s) => s.id === requested)) goToSection(requested, false);
    // Only the first render honours the link; later changes come from the TOC itself.
  }, []);

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
      <div>
        <h2 className="text-xl font-bold text-lmu-text">Application Settings</h2>
        <p className="text-xs text-lmu-muted mt-1">
          Folder paths, session and replay caches, AI lap reports and reference benchmarks
        </p>
      </div>

      {setupNeeded && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-lmu-border bg-lmu-card px-4 py-3 text-xs text-lmu-text-soft">
          <AlertCircle className="w-4 h-4 shrink-0 text-lmu-warn" aria-hidden="true" />
          <span>Setup needed: {missingPaths.join(', ')} not found.</span>
          <button
            type="button"
            onClick={() => goToSection('folder-paths', true)}
            className="font-semibold text-lmu-text underline underline-offset-2 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
          >
            Fix folder paths
          </button>
        </div>
      )}

      <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-8 items-start">
        <aside className="sticky top-[84px]">
          <SettingsSidebar
            sections={matchingSections}
            activeSectionId={activeSectionId}
            onSelectSection={(id) => goToSection(id, true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            status={status}
            totalSectionsCount={SETTINGS_SECTIONS.length}
          />
        </aside>

        <div className="min-w-0 space-y-6">
          {matchingSections.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="flex items-center justify-center mx-auto text-lmu-muted">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">No Settings Found</h3>
              <p className="text-xs text-lmu-muted max-w-sm mx-auto">
                No settings match &quot;{searchQuery}&quot;. Try searching for cache, replays, AI, benchmarks, or paths.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-4 py-2 rounded-lg bg-lmu-card border border-lmu-rule text-lmu-text-soft text-xs font-semibold hover:bg-lmu-card-hover transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
              >
                Clear search
              </button>
            </div>
          ) : (
            matchingSections.map((section) => (
              <section id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-[84px]">
                {renderCard(section.id)}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
